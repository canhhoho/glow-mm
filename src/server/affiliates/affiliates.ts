import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { emailSchema, mmText, newPasswordSchema, phoneSchema, rawId } from "@/lib/schemas";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { yangonDayKey, yangonDayStart } from "@/lib/time";
import { storage } from "@/server/adapters/storage";
import { can, MIN_STAFF_PASSWORD, type Role } from "@/server/auth/roles";
import type { Tx } from "@/server/inventory/ledger";
import { normalizeMmPhone, phoneSearchDigits } from "@/lib/phone";
import { PAYOUT_PROOF_PREFIX, PROOF_MAX_BYTES, PROOF_MIME } from "@/server/affiliates/proof-policy";
import { sniffImageMime } from "@/server/files/public-images";
import { getNumberSetting } from "@/server/settings";
import { uplineSnapshot } from "./upline";
import {
  commissionBaseMmk,
  commissionPerUnitSnapshot,
  saleRateSnapshotBp,
  effectiveUplineRateBp,
  payoutLines,
  percentToBp,
  splitCommissions,
  summarizeCommissions,
  type CommissionState,
} from "./commission";
import { normalizeRefCode } from "./referral";
import { wouldCreateCycle } from "./tree";

/**
 * Cộng tác viên (P10b): tài khoản (user role AFFILIATE + hồ sơ CTV), gán CTV cho đơn, ghi nhận chi trả.
 * Hoa hồng không lưu sẵn — tính lại từ đơn + dòng chi trả (`commission.ts`).
 */

export type AffiliateErrorCode =
  | "email_taken"
  | "code_taken"
  | "invalid_code"
  | "invalid_phone"
  | "not_found"
  | "in_use"
  | "forbidden"
  | "order_paid"
  | "order_cancelled"
  | "nothing_due"
  | "invalid_file"
  | "cycle";

export class AffiliateError extends Error {
  constructor(
    public readonly code: AffiliateErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AffiliateError";
  }
}

const text = mmText;
/** % hoa hồng bán hàng, tối đa 2 chữ số thập phân (vd 12.5). */
export const commissionPercentSchema = z.coerce.number().min(0).max(50).multipleOf(0.01);
/**
 * % bán hàng trên hồ sơ CTV — từ 18/11/2026 không còn dùng để tính (hoa hồng theo mức ở Giá bán), form không gửi:
 * trống = tạo mới 0 / sửa giữ nguyên. Giữ cột cho dữ liệu cũ.
 */
const profilePercentSchema = z.preprocess((v) => (v === "" || v == null ? undefined : v), commissionPercentSchema.optional());

/** % hưởng từ tuyến dưới (P13) — trống = dùng % chung trong Cài đặt. */
export const uplinePercentSchema = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? Number(v) : null))
  .pipe(z.number().min(0).max(20).multipleOf(0.01).nullable());

const profileSchema = z.object({
  name: text(100).pipe(z.string().min(1)),
  phone: phoneSchema,
  code: z.string(),
  commissionPercent: profilePercentSchema,
  uplinePercent: uplinePercentSchema,
  payoutInfo: text(500).optional(),
});

export const createAffiliateSchema = profileSchema.extend({
  email: emailSchema,
  password: newPasswordSchema(MIN_STAFF_PASSWORD),
  /** Cấp trên (P11) — trống = không có. */
  parentId: z.string().trim().max(64).optional(),
});

/** Sửa hồ sơ CTV: thêm đổi email đăng nhập (`email` bỏ trống = giữ nguyên). */
export const updateAffiliateSchema = profileSchema.extend({ email: emailSchema.optional() });

export function parseProfile<T extends z.ZodType<z.infer<typeof profileSchema>>>(schema: T, raw: unknown) {
  const input = schema.parse(raw) as z.infer<T> & z.infer<typeof profileSchema>;
  const code = normalizeRefCode(input.code);
  if (!code) throw new AffiliateError("invalid_code", "Mã CTV 4–12 ký tự A–Z, 0–9");
  const phone = normalizeMmPhone(input.phone);
  if (!phone) throw new AffiliateError("invalid_phone", "Số điện thoại không hợp lệ");
  return {
    ...input,
    code,
    phone,
    commissionRateBp: input.commissionPercent == null ? undefined : percentToBp(input.commissionPercent),
    uplineRateBp: input.uplinePercent == null ? null : percentToBp(input.uplinePercent),
    payoutInfo: input.payoutInfo || null,
  };
}

export function uniqueError(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    const target = JSON.stringify(e.meta ?? {});
    if (target.includes("code")) throw new AffiliateError("code_taken", "Mã CTV đã được dùng");
    throw new AffiliateError("email_taken", "Email đã được dùng cho tài khoản khác");
  }
  throw e;
}

/** Gợi ý mã CTV ngẫu nhiên cho form tạo mới (admin sửa được). */
export function suggestAffiliateCode() {
  return `CTV${randomBytes(3).toString("hex").toUpperCase()}`;
}

export type NewAffiliate = {
  name: string;
  email: string;
  phone: string;
  code: string;
  /** Không còn dùng để tính (18/11/2026) — trống = 0. */
  commissionRateBp?: number;
  uplineRateBp?: number | null;
  payoutInfo: string | null;
  parentId: string | null;
  passwordHash: string;
};

/** Tạo user AFFILIATE (mặc định tiếng Myanmar) + hồ sơ CTV trong transaction có sẵn — dùng cho tạo tay và duyệt đơn đăng ký. */
export async function insertAffiliate(tx: Tx, input: NewAffiliate, actorId: string, action = "affiliate.create") {
  if (input.parentId && !(await tx.affiliate.findUnique({ where: { id: input.parentId }, select: { id: true } }))) {
    throw new AffiliateError("not_found", "Không tìm thấy CTV cấp trên");
  }
  const userId = randomUUID();
  await tx.user.create({
    data: {
      id: userId,
      name: input.name,
      email: input.email,
      role: "AFFILIATE",
      locale: "my",
      // Email do admin nhập / duyệt → coi như đã xác minh: CTV đăng nhập storefront bằng Google cùng email được (P16).
      emailVerified: true,
      accounts: { create: { id: randomUUID(), accountId: userId, providerId: "credential", password: input.passwordHash } },
    },
  });
  const affiliate = await tx.affiliate.create({
    data: {
      userId,
      code: input.code,
      phone: input.phone,
      commissionRateBp: input.commissionRateBp ?? 0,
      uplineRateBp: input.uplineRateBp ?? null,
      payoutInfo: input.payoutInfo,
      parentId: input.parentId,
    },
  });
  await tx.auditLog.create({
    data: {
      userId: actorId,
      action,
      entity: "Affiliate",
      entityId: affiliate.id,
      data: { email: input.email, code: input.code, commissionRateBp: input.commissionRateBp, parentId: input.parentId },
    },
  });
  return affiliate;
}

export async function createAffiliate(raw: unknown, actorId: string) {
  const input = parseProfile(createAffiliateSchema, raw);
  const passwordHash = await hashPassword(input.password);
  try {
    return await prisma.$transaction((tx) =>
      insertAffiliate(tx, { ...input, parentId: input.parentId || null, passwordHash }, actorId),
    );
  } catch (e) {
    uniqueError(e);
  }
}

export async function updateAffiliate(id: string, raw: unknown, actorId: string) {
  const input = parseProfile(updateAffiliateSchema, raw);
  try {
    return await prisma.$transaction(async (tx) => {
      const cur = await tx.affiliate.findUnique({ where: { id }, include: { user: { select: { email: true } } } });
      if (!cur) throw new AffiliateError("not_found", "Không tìm thấy CTV");
      const email = input.email && input.email !== cur.user.email ? input.email : undefined;
      await tx.user.update({ where: { id: cur.userId }, data: { name: input.name, email } });
      const updated = await tx.affiliate.update({
        where: { id },
        data: {
          code: input.code,
          phone: input.phone,
          commissionRateBp: input.commissionRateBp,
          uplineRateBp: input.uplineRateBp,
          payoutInfo: input.payoutInfo,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: "affiliate.update",
          entity: "Affiliate",
          entityId: id,
          data: {
            name: input.name,
            ...(email && { email: { from: cur.user.email, to: email } }),
            code: { from: cur.code, to: input.code },
            commissionRateBp: { from: cur.commissionRateBp, to: input.commissionRateBp },
            uplineRateBp: { from: cur.uplineRateBp, to: input.uplineRateBp },
          },
        },
      });
      return updated;
    });
  } catch (e) {
    uniqueError(e);
  }
}

/**
 * Đổi cấp trên (P11, chỉ admin): chỉ áp cho đơn mới (đơn cũ đã chốt cấp trên). Không được chọn chính mình
 * hoặc tuyến dưới của mình (tạo vòng). `parentId` null = bỏ cấp trên.
 */
export async function setAffiliateParent(id: string, parentId: string | null, actorId: string) {
  await prisma.$transaction(async (tx) => {
    const cur = await tx.affiliate.findUnique({ where: { id } });
    if (!cur) throw new AffiliateError("not_found", "Không tìm thấy CTV");
    if (cur.parentId === parentId) return;
    if (parentId) {
      const all = await tx.affiliate.findMany({ select: { id: true, parentId: true } });
      const parentOf = new Map(all.map((a) => [a.id, a.parentId]));
      if (!parentOf.has(parentId)) throw new AffiliateError("not_found", "Không tìm thấy CTV cấp trên");
      if (wouldCreateCycle(id, parentId, parentOf)) throw new AffiliateError("cycle", "Không thể chọn chính CTV này hoặc tuyến dưới của họ");
    }
    await tx.affiliate.update({ where: { id }, data: { parentId } });
    await tx.auditLog.create({
      data: { userId: actorId, action: "affiliate.setParent", entity: "Affiliate", entityId: id, data: { from: cur.parentId, to: parentId } },
    });
  });
}

/** Khoá/mở CTV: khoá cả hồ sơ lẫn tài khoản đăng nhập, xoá phiên đang mở. Link giới thiệu cũ ngừng tính. */
export async function setAffiliateActive(id: string, active: boolean, actorId: string) {
  await prisma.$transaction(async (tx) => {
    const cur = await tx.affiliate.findUnique({ where: { id } });
    if (!cur) throw new AffiliateError("not_found", "Không tìm thấy CTV");
    await tx.affiliate.update({ where: { id }, data: { active } });
    await tx.user.update({ where: { id: cur.userId }, data: { active } });
    if (!active) await tx.session.deleteMany({ where: { userId: cur.userId } });
    await tx.auditLog.create({
      data: { userId: actorId, action: active ? "affiliate.activate" : "affiliate.deactivate", entity: "Affiliate", entityId: id },
    });
  });
}

/** Chỉ xoá tài khoản chưa phát sinh nghiệp vụ; giữ nguyên mọi lịch sử đơn và hoa hồng. */
export async function deleteAffiliate(id: string, actor: { userId: string; role: Role }) {
  if (!can(actor.role, "affiliates:manage")) throw new AffiliateError("forbidden", "Không có quyền xoá CTV");
  const affiliateId = rawId.max(64).parse(id);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Affiliate" WHERE "id" = ${affiliateId} FOR UPDATE`;
      const a = await tx.affiliate.findUnique({
        where: { id: affiliateId },
        include: { application: { select: { id: true } }, _count: { select: { orders: true, uplineOrders: true, payouts: true, children: true, invitations: true } } },
      });
      if (!a) throw new AffiliateError("not_found", "Không tìm thấy CTV");
      await tx.$queryRaw`SELECT "id" FROM "user" WHERE "id" = ${a.userId} FOR UPDATE`;
      const orders = await tx.order.count({ where: { OR: [{ accountId: a.userId }, { createdById: a.userId }] } });
      if (a.application || Object.values(a._count).some(Boolean) || orders > 0) {
        throw new AffiliateError("in_use", "CTV đã có dữ liệu liên quan; hãy khoá tài khoản");
      }
      const user = await tx.user.findUniqueOrThrow({ where: { id: a.userId }, select: { role: true } });
      if (user.role !== "AFFILIATE" || a.userId === actor.userId) throw new AffiliateError("forbidden", "Không thể xoá tài khoản này");
      await tx.affiliate.delete({ where: { id: affiliateId } });
      await tx.user.delete({ where: { id: a.userId } });
      await tx.auditLog.create({
        data: { userId: actor.userId, action: "affiliate.delete", entity: "Affiliate", entityId: affiliateId, data: { code: a.code, userId: a.userId } },
      });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      throw new AffiliateError("in_use", "CTV đã có dữ liệu liên quan; hãy khoá tài khoản");
    }
    throw e;
  }
}

// ── Hoa hồng theo đơn ──

const orderForCommission = {
  id: true,
  code: true,
  createdAt: true,
  completedAt: true,
  status: true,
  paymentStatus: true,
  recipientName: true,
  recipientPhone: true,
  recipientPhone2: true,
  addressText: true,
  zoneName: true,
  channel: true,
  subtotalMmk: true,
  totalMmk: true,
  commissionRateBp: true,
  affiliateId: true,
  affiliateSource: true,
  uplineAffiliateId: true,
  uplineRateBp: true,
  items: { select: { qty: true, returnedQty: true, unitPriceMmk: true, commissionPerUnitMmk: true } },
  payoutLines: { select: { amountMmk: true, kind: true } },
} satisfies Prisma.OrderSelect;

type CommissionOrderRow = Prisma.OrderGetPayload<{ select: typeof orderForCommission }>;

/** Hoa hồng của từng đơn: `commission` (người bán) + `uplineCommission` (cấp trên, null nếu không có). */
function withCommission(rows: CommissionOrderRow[], opts: { now: Date; holdDays: number }) {
  return rows.map(({ payoutLines: lines, ...o }) => ({ ...o, ...splitCommissions({ ...o, lines }, opts) }));
}
export type AffiliateOrder = ReturnType<typeof withCommission>[number];

/** Phần hoa hồng của CTV `affiliateId` trên các đơn: SALE nếu là người bán, UPLINE nếu là cấp trên. */
function entriesFor(affiliateId: string, orders: AffiliateOrder[]) {
  return orders.flatMap((o) => [
    ...(o.affiliateId === affiliateId ? [{ orderId: o.id, code: o.code, kind: "SALE" as const, commission: o.commission }] : []),
    ...(o.uplineAffiliateId === affiliateId && o.uplineCommission
      ? [{ orderId: o.id, code: o.code, kind: "UPLINE" as const, commission: o.uplineCommission }]
      : []),
  ]);
}

async function commissionOpts(now: Date) {
  return { now, holdDays: await getNumberSetting("affiliate.holdDays") };
}

/** Đơn của CTV kèm hoa hồng. `month` = "YYYY-MM" (giờ Yangon, theo ngày tạo đơn). */
export async function affiliateOrders(
  affiliateId: string,
  filter: { month?: string; state?: CommissionState } = {},
  now = new Date(),
) {
  const where: Prisma.OrderWhereInput = { affiliateId };
  const range = monthRange(filter.month);
  if (range) where.createdAt = range;
  const rows = await prisma.order.findMany({ where, select: orderForCommission, orderBy: { createdAt: "desc" }, take: 500 });
  const orders = withCommission(rows, await commissionOpts(now));
  return filter.state ? orders.filter((o) => o.commission.state === filter.state) : orders;
}

/** "YYYY-MM" → khoảng UTC của tháng đó theo giờ Yangon; sai định dạng → null. */
export function monthRange(month?: string) {
  if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { gte: yangonDayStart(`${month}-01`), lt: yangonDayStart(`${next}-01`) };
}

export const currentMonth = (now = new Date()) => yangonDayKey(now).slice(0, 7);

/**
 * Tổng hợp cho một CTV (mọi thời điểm): hoa hồng chờ / đến hạn / đã nhận = bán hàng + tuyến dưới (tách ở `sale`, `upline`),
 * doanh số tháng này của chính CTV. `orders` gồm cả đơn mình bán lẫn đơn tuyến dưới.
 */
function summarize(affiliateId: string, orders: AffiliateOrder[], now: Date) {
  const entries = entriesFor(affiliateId, orders);
  const sale = summarizeCommissions(entries.filter((e) => e.kind === "SALE").map((e) => e.commission));
  const upline = summarizeCommissions(entries.filter((e) => e.kind === "UPLINE").map((e) => e.commission));
  const month = monthRange(currentMonth(now))!;
  const thisMonth = orders.filter(
    (o) => o.affiliateId === affiliateId && o.createdAt >= month.gte && o.createdAt < month.lt && o.status !== "CANCELLED",
  );
  return {
    pendingMmk: sale.pendingMmk + upline.pendingMmk,
    payableMmk: sale.payableMmk + upline.payableMmk,
    paidMmk: sale.paidMmk + upline.paidMmk,
    sale,
    upline,
    monthOrders: thisMonth.length,
    monthSalesMmk: thisMonth.reduce((s, o) => s + commissionBaseMmk(o.items), 0),
  };
}

/** Đơn mình bán + đơn tuyến dưới của các CTV `ids` (để tổng hợp). */
async function ordersInvolving(ids: string[], now: Date) {
  const rows = await prisma.order.findMany({
    where: { OR: [{ affiliateId: { in: ids } }, { uplineAffiliateId: { in: ids } }] },
    select: orderForCommission,
    orderBy: { createdAt: "desc" },
  });
  return withCommission(rows, await commissionOpts(now));
}

export async function listAffiliates(filter: { q?: string; active?: boolean } = {}, now = new Date()) {
  const q = filter.q?.trim();
  // Chỉ tìm theo SĐT khi người dùng gõ số (tránh mã như "E2E1" khớp nhầm SĐT chứa "21").
  const phoneDigits = q ? phoneSearchDigits(q) : "";
  const affiliates = await prisma.affiliate.findMany({
    where: {
      active: filter.active,
      ...(q && {
        OR: [
          { code: { contains: q.toUpperCase() } },
          ...(phoneDigits ? [{ phone: { contains: phoneDigits.replace(/^(95|0)/, "") } }] : []),
          { user: { name: { contains: q, mode: "insensitive" } } },
          { user: { email: { contains: q, mode: "insensitive" } } },
        ],
      }),
    },
    include: { user: { select: { name: true, email: true } } },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    take: 200,
  });
  const orders = await ordersInvolving(
    affiliates.map((a) => a.id),
    now,
  );
  return affiliates.map((a) => ({ ...a, summary: summarize(a.id, orders, now) }));
}

/** Chi tiết CTV cho admin và cổng CTV (cổng CTV truyền `affiliateId` lấy từ phiên đăng nhập). */
export async function getAffiliate(id: string, now = new Date()) {
  const affiliate = await prisma.affiliate.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, active: true } },
      parent: { select: { id: true, code: true, active: true, user: { select: { name: true } } } },
      children: {
        select: { id: true, code: true, active: true, createdAt: true, user: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      },
      payouts: {
        orderBy: { paidAt: "desc" },
        include: { _count: { select: { lines: true } }, lines: { select: { kind: true } }, proofFile: { select: { url: true } } },
      },
    },
  });
  if (!affiliate) return null;
  const orders = await ordersInvolving([id], now);
  const due = payoutLines(entriesFor(id, orders));
  return { ...affiliate, summary: summarize(id, orders, now), due: { totalMmk: due.totalMmk, entries: due.entries } };
}

/** Đơn tuyến dưới mà CTV `affiliateId` hưởng hoa hồng tầng trên (admin xem chi tiết; cổng CTV chỉ dùng số tổng). */
export async function teamOrders(affiliateId: string, now = new Date()) {
  const rows = await prisma.order.findMany({
    where: { uplineAffiliateId: affiliateId },
    select: { ...orderForCommission, affiliate: { select: { code: true, user: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  const opts = await commissionOpts(now);
  return rows.map(({ affiliate, ...row }) => ({ ...withCommission([row], opts)[0], seller: affiliate }));
}

/**
 * Tuyến dưới của CTV (P11c) — chỉ số tổng, KHÔNG có thông tin khách: tuyến dưới trực tiếp (số đơn + doanh số
 * tháng này, hoa hồng tầng trên mình hưởng từ từng người), đơn đăng ký đang chờ duyệt, % tầng trên hiện hành.
 * Hoa hồng từ người đã chuyển sang tuyến khác vẫn tính (đơn đã chốt) → gộp vào `former`.
 */
export async function teamOverview(affiliateId: string, now = new Date()) {
  const [children, upline, pendingApplications, globalUplineBp, self] = await Promise.all([
    prisma.affiliate.findMany({
      where: { parentId: affiliateId },
      select: { id: true, code: true, active: true, createdAt: true, user: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    teamOrders(affiliateId, now),
    prisma.affiliateApplication.count({ where: { inviterId: affiliateId, status: "PENDING" } }),
    getNumberSetting("affiliate.uplineRateBp"),
    prisma.affiliate.findUnique({ where: { id: affiliateId }, select: { uplineRateBp: true } }),
  ]);
  const uplineRateBp = effectiveUplineRateBp({ uplineRateBp: self?.uplineRateBp ?? null }, globalUplineBp);
  const childIds = new Set(children.map((c) => c.id));
  const month = monthRange(currentMonth(now))!;
  const commissionOf = (orders: AffiliateOrder[]) =>
    summarizeCommissions(orders.flatMap((o) => (o.uplineCommission ? [o.uplineCommission] : [])));
  // Doanh số tháng của tuyến dưới tính trên mọi đơn của họ (kể cả đơn trước khi gắn vào mình).
  const ownRows = await prisma.order.findMany({
    where: { affiliateId: { in: [...childIds] }, createdAt: month },
    select: { affiliateId: true, status: true, createdAt: true, items: { select: { qty: true, returnedQty: true, unitPriceMmk: true } } },
  });
  return {
    uplineRateBp,
    pendingApplications,
    children: children.map((c) => {
      const mine = ownRows.filter((o) => o.affiliateId === c.id && o.status !== "CANCELLED");
      return {
        ...c,
        monthOrders: mine.length,
        monthSalesMmk: mine.reduce((s, o) => s + commissionBaseMmk(o.items), 0),
        commission: commissionOf(upline.filter((o) => o.affiliateId === c.id)),
      };
    }),
    former: commissionOf(upline.filter((o) => !childIds.has(o.affiliateId ?? ""))),
    total: commissionOf(upline),
  };
}

/** CTV đang hoạt động cho ô chọn trong form đơn hàng. */
export async function affiliateOptions() {
  const rows = await prisma.affiliate.findMany({
    where: { active: true, user: { active: true } },
    select: { id: true, code: true, user: { select: { name: true } } },
    orderBy: { code: "asc" },
  });
  return rows.map((a) => ({ id: a.id, label: `${a.code} — ${a.user.name}` }));
}

// ── Gán CTV cho đơn ──

/** Gán / đổi / bỏ CTV (nguồn STAFF; hoa hồng bán hàng chốt lại theo mức ở Giá bán, % tầng trên hiện tại). Đơn đã có dòng chi trả hoặc đã huỷ thì không đổi được. */
export async function assignOrderAffiliate(
  orderId: string,
  affiliateId: string | null,
  actor: { userId: string; role: Role },
) {
  if (!can(actor.role, "orders:assign-affiliate")) throw new AffiliateError("forbidden", "Không có quyền gán CTV");
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { _count: { select: { payoutLines: true } } } });
    if (!order) throw new AffiliateError("not_found", "Không tìm thấy đơn");
    if (order._count.payoutLines > 0) throw new AffiliateError("order_paid", "Đơn đã chi trả hoa hồng — không đổi CTV được");
    if (order.status === "CANCELLED") throw new AffiliateError("order_cancelled", "Đơn đã huỷ — không đổi CTV được");
    if (order.affiliateId === affiliateId) return order;

    let data: Prisma.OrderUncheckedUpdateInput = {
      affiliateId: null,
      affiliateSource: null,
      commissionRateBp: null,
      uplineAffiliateId: null,
      uplineRateBp: null,
    };
    if (affiliateId) {
      const a = await tx.affiliate.findFirst({ where: { id: affiliateId, active: true, user: { active: true } } });
      if (!a) throw new AffiliateError("not_found", "CTV không tồn tại hoặc đã bị khoá");
      data = {
        affiliateId: a.id,
        affiliateSource: "STAFF",
        commissionRateBp: saleRateSnapshotBp(),
        ...(await uplineSnapshot(tx, a.parentId)),
      };
    }
    const updated = await tx.order.update({ where: { id: orderId }, data });
    // Mức hoa hồng cố định theo SP: chốt lại theo biến thể hiện tại khi gán/đổi CTV, xoá khi bỏ CTV.
    const items = await tx.orderItem.findMany({ where: { orderId }, select: { id: true, variant: { select: { affiliateCommissionMmk: true } } } });
    for (const item of items) {
      await tx.orderItem.update({ where: { id: item.id }, data: { commissionPerUnitMmk: commissionPerUnitSnapshot(item.variant.affiliateCommissionMmk, !!affiliateId) } });
    }
    await tx.auditLog.create({
      data: {
        userId: actor.userId,
        action: "order.assignAffiliate",
        entity: "Order",
        entityId: orderId,
        data: { code: order.code, from: order.affiliateId, to: affiliateId },
      },
    });
    return updated;
  });
}

// ── Chỉnh % trên từng đơn (P13) ──

const orderRatesSchema = z.object({
  // Chỉ đơn cũ còn chốt % bán hàng mới có ô này (18/11/2026: hoa hồng bán hàng theo mức ở Giá bán).
  commissionPercent: z.preprocess((v) => (v === "" || v == null ? undefined : v), commissionPercentSchema.optional()),
  uplinePercent: uplinePercentSchema,
});

/**
 * Admin chỉnh % hoa hồng đã chốt trên một đơn (người bán + tầng trên nếu đơn có cấp trên).
 * Chỉ khi đơn chưa có dòng chi trả nào — đơn đã chi trả thì khoá để sổ chi trả không lệch.
 */
export async function setOrderCommissionRates(orderId: string, raw: unknown, actor: { userId: string; role: Role }) {
  if (!can(actor.role, "affiliates:manage")) throw new AffiliateError("forbidden", "Không có quyền chỉnh hoa hồng");
  const input = orderRatesSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { _count: { select: { payoutLines: true } } } });
    if (!order?.affiliateId) throw new AffiliateError("not_found", "Đơn không có CTV");
    if (order._count.payoutLines > 0) throw new AffiliateError("order_paid", "Đơn đã chi trả hoa hồng — không chỉnh % được");
    if (order.status === "CANCELLED") throw new AffiliateError("order_cancelled", "Đơn đã huỷ — không chỉnh % được");
    const data = {
      // Đơn mới không có % bán hàng (null) → giữ null; chỉ đơn cũ đã chốt % mới chỉnh được.
      commissionRateBp: order.commissionRateBp != null && input.commissionPercent != null ? percentToBp(input.commissionPercent) : order.commissionRateBp,
      // Đơn không có cấp trên → bỏ qua % tầng trên; có cấp trên mà để trống → giữ nguyên.
      uplineRateBp: order.uplineAffiliateId && input.uplinePercent != null ? percentToBp(input.uplinePercent) : order.uplineRateBp,
    };
    const updated = await tx.order.update({ where: { id: orderId }, data });
    await tx.auditLog.create({
      data: {
        userId: actor.userId,
        action: "order.setCommissionRates",
        entity: "Order",
        entityId: orderId,
        data: {
          code: order.code,
          commissionRateBp: { from: order.commissionRateBp, to: data.commissionRateBp },
          uplineRateBp: { from: order.uplineRateBp, to: data.uplineRateBp },
        },
      },
    });
    return updated;
  });
}

// ── Chi trả ──

export const payoutSchema = z.object({ note: text(500).optional() });

/**
 * Ghi nhận đã chuyển tiền cho CTV: chốt mọi đơn đến hạn (kể cả số âm do trả hàng sau khi đã chi).
 * Khoá dòng Affiliate để hai lần bấm đồng thời không ghi trùng. Tổng ≤ 0 → không có gì để trả.
 */
export async function recordPayout(
  affiliateId: string,
  raw: unknown,
  actorId: string,
  opts: { now?: Date; proof?: { data: Buffer; mime: string } | null } = {},
) {
  const input = payoutSchema.parse(raw);
  const now = opts.now ?? new Date();
  const stored = opts.proof ? await storeProof(opts.proof) : null;
  const cOpts = await commissionOpts(now);
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Affiliate" WHERE "id" = ${affiliateId} FOR UPDATE`;
      const affiliate = await tx.affiliate.findUnique({ where: { id: affiliateId } });
      if (!affiliate) throw new AffiliateError("not_found", "Không tìm thấy CTV");
      const { lines, totalMmk } = payoutLines(entriesFor(affiliateId, withCommission(await dueRows(tx, affiliateId), cOpts)));
      if (totalMmk <= 0) throw new AffiliateError("nothing_due", "Chưa có hoa hồng đến hạn để trả");
      const file = stored
        ? await tx.fileObject.create({ data: { ...stored, url: `/api/files/${stored.key}`, visibility: "PRIVATE" } })
        : null;
      const payout = await tx.affiliatePayout.create({
        data: {
          affiliateId,
          amountMmk: totalMmk,
          note: input.note || null,
          proofFileId: file?.id,
          paidAt: now,
          createdById: actorId,
          lines: { create: lines },
        },
      });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: "affiliate.payout",
          entity: "Affiliate",
          entityId: affiliateId,
          data: { payoutId: payout.id, amountMmk: totalMmk, orders: lines.length },
        },
      });
      return payout;
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
}

/** Đơn có thể đến hạn (mình bán hoặc tuyến dưới): đã hoàn thành / trả / huỷ (đơn đang xử lý luôn `pending`). */
function dueRows(tx: Tx, affiliateId: string) {
  return tx.order.findMany({
    where: {
      OR: [{ affiliateId }, { uplineAffiliateId: affiliateId }],
      status: { in: ["COMPLETED", "RETURNED", "CANCELLED"] },
    },
    select: orderForCommission,
  });
}

async function storeProof(file: { data: Buffer; mime: string }) {
  // Định dạng theo nội dung file (magic bytes), không tin mime trình duyệt gửi lên.
  const mime = file.data.subarray(0, 5).toString("ascii") === "%PDF-" ? "application/pdf" : sniffImageMime(file.data);
  const ext = mime ? PROOF_MIME[mime] : undefined;
  if (!mime || !ext || !PROOF_MIME[file.mime] || file.data.length > PROOF_MAX_BYTES) {
    throw new AffiliateError("invalid_file", "File biên nhận không hợp lệ (JPG/PNG/WebP/PDF, tối đa 5MB)");
  }
  // Tiền tố proofs/payout- → /api/files coi là riêng tư, chỉ người quản lý CTV (affiliates:manage) xem.
  const key = `${PAYOUT_PROOF_PREFIX}${randomBytes(16).toString("hex")}.${ext}`;
  return (await storage()).put(key, file.data, mime);
}

// ── Cổng CTV ──

/**
 * Một đơn của CTV (cổng /ctv) — luôn lọc theo `affiliateId` lấy từ phiên đăng nhập; đơn của người khác → null.
 * Không trả giá vốn / lô / kho.
 */
export async function getAffiliateOrder(affiliateId: string, orderId: string, now = new Date()) {
  const row = await prisma.order.findFirst({
    where: { id: orderId, affiliateId },
    select: {
      ...orderForCommission,
      shippingFeeMmk: true,
      paymentMethod: true,
      items: { select: { id: true, sku: true, name: true, qty: true, returnedQty: true, unitPriceMmk: true, commissionPerUnitMmk: true } },
      history: { select: { toStatus: true, createdAt: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!row) return null;
  const [order] = withCommission([row], await commissionOpts(now));
  return {
    ...order,
    items: row.items,
    history: row.history,
    shippingFeeMmk: row.shippingFeeMmk,
    paymentMethod: row.paymentMethod,
  };
}
