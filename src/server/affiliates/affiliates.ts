import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { toUnicode } from "@/lib/myanmar";
import { yangonDayKey, yangonDayStart } from "@/lib/time";
import { storage } from "@/server/adapters/storage";
import { can, MIN_STAFF_PASSWORD, type Role } from "@/server/auth/roles";
import type { Tx } from "@/server/inventory/ledger";
import { normalizeMmPhone } from "@/server/orders/pricing";
import { PROOF_MAX_BYTES, PROOF_MIME } from "@/server/orders/payments";
import { getNumberSetting } from "@/server/settings";
import {
  commissionBaseMmk,
  orderCommission,
  payoutLines,
  percentToBp,
  summarizeCommissions,
  type CommissionState,
} from "./commission";
import { normalizeRefCode } from "./referral";

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
  | "forbidden"
  | "order_paid"
  | "nothing_due"
  | "invalid_file";

export class AffiliateError extends Error {
  constructor(
    public readonly code: AffiliateErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AffiliateError";
  }
}

const text = (max: number) => z.string().trim().max(max).transform(toUnicode);

const profileSchema = z.object({
  name: text(100).pipe(z.string().min(1)),
  phone: z.string().trim().min(1).max(30),
  code: z.string(),
  /** % hoa hồng, tối đa 2 chữ số thập phân (vd 12.5). */
  commissionPercent: z.coerce.number().min(0).max(50).multipleOf(0.01),
  payoutInfo: text(500).optional(),
});

export const createAffiliateSchema = profileSchema.extend({
  email: z.string().trim().toLowerCase().pipe(z.email().max(200)),
  password: z.string().min(MIN_STAFF_PASSWORD).max(128),
});

function parseProfile<T extends z.ZodType<z.infer<typeof profileSchema>>>(schema: T, raw: unknown) {
  const input = schema.parse(raw) as z.infer<T> & z.infer<typeof profileSchema>;
  const code = normalizeRefCode(input.code);
  if (!code) throw new AffiliateError("invalid_code", "Mã CTV 4–12 ký tự A–Z, 0–9");
  const phone = normalizeMmPhone(input.phone);
  if (!phone) throw new AffiliateError("invalid_phone", "Số điện thoại không hợp lệ");
  return { ...input, code, phone, commissionRateBp: percentToBp(input.commissionPercent), payoutInfo: input.payoutInfo || null };
}

function uniqueError(e: unknown): never {
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

export async function createAffiliate(raw: unknown, actorId: string) {
  const input = parseProfile(createAffiliateSchema, raw);
  const userId = randomUUID();
  const hash = await hashPassword(input.password);
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          id: userId,
          name: input.name,
          email: input.email,
          role: "AFFILIATE",
          locale: "my",
          accounts: { create: { id: randomUUID(), accountId: userId, providerId: "credential", password: hash } },
        },
      });
      const affiliate = await tx.affiliate.create({
        data: {
          userId,
          code: input.code,
          phone: input.phone,
          commissionRateBp: input.commissionRateBp,
          payoutInfo: input.payoutInfo,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: "affiliate.create",
          entity: "Affiliate",
          entityId: affiliate.id,
          data: { email: input.email, code: input.code, commissionRateBp: input.commissionRateBp },
        },
      });
      return affiliate;
    });
  } catch (e) {
    uniqueError(e);
  }
}

export async function updateAffiliate(id: string, raw: unknown, actorId: string) {
  const input = parseProfile(profileSchema, raw);
  try {
    return await prisma.$transaction(async (tx) => {
      const cur = await tx.affiliate.findUnique({ where: { id } });
      if (!cur) throw new AffiliateError("not_found", "Không tìm thấy CTV");
      await tx.user.update({ where: { id: cur.userId }, data: { name: input.name } });
      const updated = await tx.affiliate.update({
        where: { id },
        data: { code: input.code, phone: input.phone, commissionRateBp: input.commissionRateBp, payoutInfo: input.payoutInfo },
      });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: "affiliate.update",
          entity: "Affiliate",
          entityId: id,
          data: {
            name: input.name,
            code: { from: cur.code, to: input.code },
            commissionRateBp: { from: cur.commissionRateBp, to: input.commissionRateBp },
          },
        },
      });
      return updated;
    });
  } catch (e) {
    uniqueError(e);
  }
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
  addressText: true,
  zoneName: true,
  channel: true,
  subtotalMmk: true,
  totalMmk: true,
  commissionRateBp: true,
  affiliateId: true,
  affiliateSource: true,
  items: { select: { qty: true, returnedQty: true, unitPriceMmk: true } },
  payoutLines: { select: { amountMmk: true } },
} satisfies Prisma.OrderSelect;

type CommissionOrderRow = Prisma.OrderGetPayload<{ select: typeof orderForCommission }>;

function withCommission(rows: CommissionOrderRow[], opts: { now: Date; holdDays: number }) {
  return rows.map(({ payoutLines: lines, ...o }) => ({
    ...o,
    commission: orderCommission({ ...o, paidMmk: lines.reduce((s, l) => s + l.amountMmk, 0) }, opts),
  }));
}
export type AffiliateOrder = ReturnType<typeof withCommission>[number];

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

/** Tổng hợp cho một CTV: hoa hồng chờ / đến hạn / đã nhận (mọi thời điểm) + doanh số tháng này. */
function summarize(orders: AffiliateOrder[], now: Date) {
  const month = monthRange(currentMonth(now))!;
  const thisMonth = orders.filter((o) => o.createdAt >= month.gte && o.createdAt < month.lt && o.status !== "CANCELLED");
  return {
    ...summarizeCommissions(orders.map((o) => o.commission)),
    monthOrders: thisMonth.length,
    monthSalesMmk: thisMonth.reduce((s, o) => s + commissionBaseMmk(o.items), 0),
  };
}

export async function listAffiliates(filter: { q?: string; active?: boolean } = {}, now = new Date()) {
  const q = filter.q?.trim();
  const affiliates = await prisma.affiliate.findMany({
    where: {
      active: filter.active,
      ...(q && {
        OR: [
          { code: { contains: q.toUpperCase() } },
          { phone: { contains: q.replace(/\D/g, "") || q } },
          { user: { name: { contains: q, mode: "insensitive" } } },
          { user: { email: { contains: q, mode: "insensitive" } } },
        ],
      }),
    },
    include: { user: { select: { name: true, email: true } } },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    take: 200,
  });
  const rows = await prisma.order.findMany({
    where: { affiliateId: { in: affiliates.map((a) => a.id) } },
    select: orderForCommission,
  });
  const orders = withCommission(rows, await commissionOpts(now));
  return affiliates.map((a) => ({ ...a, summary: summarize(orders.filter((o) => o.affiliateId === a.id), now) }));
}

/** Chi tiết CTV cho admin và cổng CTV (cổng CTV truyền `affiliateId` lấy từ phiên đăng nhập). */
export async function getAffiliate(id: string, now = new Date()) {
  const affiliate = await prisma.affiliate.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, active: true } },
      payouts: { orderBy: { paidAt: "desc" }, include: { _count: { select: { lines: true } }, proofFile: { select: { url: true } } } },
    },
  });
  if (!affiliate) return null;
  const all = await affiliateOrders(id, {}, now);
  const due = payoutLines(all);
  const dueOrders = all.filter((o) => due.lines.some((l) => l.orderId === o.id));
  return { ...affiliate, summary: summarize(all, now), due: { totalMmk: due.totalMmk, orders: dueOrders } };
}
export type AffiliateDetail = NonNullable<Awaited<ReturnType<typeof getAffiliate>>>;

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

/** Gán / đổi / bỏ CTV (nguồn STAFF, chốt % hiện tại). Đơn đã có dòng chi trả thì không đổi được. */
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
    if (order.affiliateId === affiliateId) return order;

    let data: Prisma.OrderUncheckedUpdateInput = { affiliateId: null, affiliateSource: null, commissionRateBp: null };
    if (affiliateId) {
      const a = await tx.affiliate.findFirst({ where: { id: affiliateId, active: true, user: { active: true } } });
      if (!a) throw new AffiliateError("not_found", "CTV không tồn tại hoặc đã bị khoá");
      data = { affiliateId: a.id, affiliateSource: "STAFF", commissionRateBp: a.commissionRateBp };
    }
    const updated = await tx.order.update({ where: { id: orderId }, data });
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
      const { lines, totalMmk } = payoutLines(withCommission(await dueRows(tx, affiliateId), cOpts));
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

/** Đơn có thể đến hạn: đã hoàn thành / trả / huỷ (đơn đang xử lý luôn `pending`). */
function dueRows(tx: Tx, affiliateId: string) {
  return tx.order.findMany({
    where: { affiliateId, status: { in: ["COMPLETED", "RETURNED", "CANCELLED"] } },
    select: orderForCommission,
  });
}

async function storeProof(file: { data: Buffer; mime: string }) {
  const ext = PROOF_MIME[file.mime];
  if (!ext || file.data.length === 0 || file.data.length > PROOF_MAX_BYTES) {
    throw new AffiliateError("invalid_file", "File biên nhận không hợp lệ (JPG/PNG/WebP/PDF, tối đa 5MB)");
  }
  // Tiền tố proofs/ → /api/files coi là riêng tư (chỉ nhân viên xem).
  const key = `proofs/payout-${randomBytes(16).toString("hex")}.${ext}`;
  return (await storage()).put(key, file.data, file.mime);
}
