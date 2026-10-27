import "server-only";
import { z } from "zod";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "@/lib/db";
import { toUnicode } from "@/lib/myanmar";
import { MIN_STAFF_PASSWORD } from "@/server/auth/roles";
import { normalizeMmPhone } from "@/server/orders/pricing";
import { AffiliateError, insertAffiliate, parseProfile, uniqueError, uplinePercentSchema } from "./affiliates";
import { normalizeRefCode } from "./referral";

/**
 * Đăng ký làm CTV qua link mời (P11b): người mới gửi đơn → admin duyệt (tạo tài khoản, gắn dưới người mời)
 * hoặc từ chối. Mật khẩu băm giữ trong đơn tới khi xử lý xong rồi xoá.
 */

export type ApplicationErrorCode = "invalid_invite" | "email_taken" | "duplicate" | "too_many" | "invalid_phone" | "not_pending";

export class ApplicationError extends Error {
  constructor(
    public readonly code: ApplicationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ApplicationError";
  }
}

/** Giới hạn chống spam. */
export const MAX_PENDING_PER_INVITER = 20;
export const MAX_PER_IP_PER_HOUR = 5;
const HOUR_MS = 60 * 60 * 1000;

/** Người mời hợp lệ (CTV + tài khoản đang hoạt động) theo mã trong link mời. */
export async function inviterByCode(raw: unknown) {
  const code = normalizeRefCode(raw);
  if (!code) return null;
  return prisma.affiliate.findFirst({
    where: { code, active: true, user: { active: true } },
    select: { id: true, code: true, user: { select: { name: true } } },
  });
}

export const applicationSchema = z
  .object({
    invite: z.string(),
    name: z.string().trim().min(1).max(100).transform(toUnicode),
    phone: z.string().trim().min(1).max(30),
    email: z.string().trim().toLowerCase().pipe(z.email().max(200)),
    password: z.string().min(MIN_STAFF_PASSWORD).max(128),
    confirmPassword: z.string().max(128),
  })
  .refine((d) => d.password === d.confirmPassword, { path: ["confirmPassword"], message: "mismatch" });

/**
 * Gửi đơn đăng ký. `honeypot` có giá trị (bot điền ô ẩn) → giả vờ thành công, không lưu.
 * `ip` dùng cho giới hạn theo giờ (bảng RateLimit dùng chung với Better Auth, khoá riêng `ctv-join:`).
 */
export async function submitApplication(raw: unknown, ctx: { ip: string; honeypot?: string; now?: Date }) {
  const input = applicationSchema.parse(raw);
  if (ctx.honeypot) return null;
  const now = ctx.now ?? new Date();
  const phone = normalizeMmPhone(input.phone);
  if (!phone) throw new ApplicationError("invalid_phone", "Số điện thoại không hợp lệ");
  const inviter = await inviterByCode(input.invite);
  if (!inviter) throw new ApplicationError("invalid_invite", "Link mời không hợp lệ");

  await hitIpLimit(ctx.ip, now);
  const passwordHash = await hashPassword(input.password);
  return prisma.$transaction(async (tx) => {
    if (await tx.user.findUnique({ where: { email: input.email }, select: { id: true } })) {
      throw new ApplicationError("email_taken", "Email đã có tài khoản");
    }
    const dup = await tx.affiliateApplication.count({
      where: { status: "PENDING", OR: [{ email: input.email }, { phone }] },
    });
    if (dup > 0) throw new ApplicationError("duplicate", "Đã có đơn đăng ký đang chờ duyệt");
    // Khoá dòng người mời để đếm đơn chờ chính xác khi nhiều người gửi cùng lúc.
    await tx.$queryRaw`SELECT "id" FROM "Affiliate" WHERE "id" = ${inviter.id} FOR UPDATE`;
    const pending = await tx.affiliateApplication.count({ where: { inviterId: inviter.id, status: "PENDING" } });
    if (pending >= MAX_PENDING_PER_INVITER) throw new ApplicationError("too_many", "Người mời có quá nhiều đơn chờ duyệt");
    return tx.affiliateApplication.create({
      data: { inviterId: inviter.id, name: input.name, phone, email: input.email, passwordHash, createdAt: now },
    });
  });
}

/** Tối đa MAX_PER_IP_PER_HOUR đơn / giờ / IP (cửa sổ cố định 1 giờ). */
async function hitIpLimit(ip: string, now: Date) {
  const key = `ctv-join:${ip || "unknown"}`;
  const t = BigInt(now.getTime());
  const row = await prisma.rateLimit.findUnique({ where: { key } });
  if (row && t - row.lastRequest < BigInt(HOUR_MS)) {
    if (row.count >= MAX_PER_IP_PER_HOUR) throw new ApplicationError("too_many", "Gửi quá nhiều đơn, thử lại sau");
    await prisma.rateLimit.update({ where: { key }, data: { count: { increment: 1 } } });
  } else {
    await prisma.rateLimit.upsert({
      where: { key },
      update: { count: 1, lastRequest: t },
      create: { id: key, key, count: 1, lastRequest: t },
    });
  }
}

export async function listApplications(status: "PENDING" | "DECIDED" = "PENDING") {
  return prisma.affiliateApplication.findMany({
    where: status === "PENDING" ? { status: "PENDING" } : { status: { not: "PENDING" } },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      status: true,
      note: true,
      createdAt: true,
      reviewedAt: true,
      affiliateId: true,
      inviter: { select: { id: true, code: true, user: { select: { name: true } } } },
    },
    // Mới nhất trước: danh sách giới hạn 200 dòng, xếp cũ trước thì đơn mới gửi bị khuất khi tồn nhiều đơn chờ.
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export const pendingApplicationsCount = () => prisma.affiliateApplication.count({ where: { status: "PENDING" } });

const approveSchema = z.object({
  code: z.string(),
  commissionPercent: z.coerce.number().min(0).max(50).multipleOf(0.01),
  payoutInfo: z.string().trim().max(500).transform(toUnicode).optional(),
});

/** Duyệt: tạo tài khoản CTV (mật khẩu người đăng ký đã đặt) gắn dưới người mời, xoá mật khẩu băm khỏi đơn. */
export async function approveApplication(id: string, raw: unknown, actorId: string, now = new Date()) {
  const input = approveSchema.parse(raw);
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "AffiliateApplication" WHERE "id" = ${id} FOR UPDATE`;
      const app = await tx.affiliateApplication.findUnique({ where: { id } });
      if (!app) throw new AffiliateError("not_found", "Không tìm thấy đơn đăng ký");
      if (app.status !== "PENDING" || !app.passwordHash) throw new ApplicationError("not_pending", "Đơn đã được xử lý");
      const profile = parseProfile(approveSchema.extend({ name: z.string(), phone: z.string(), uplinePercent: uplinePercentSchema }), {
        ...input,
        name: app.name,
        phone: app.phone,
      });
      const affiliate = await insertAffiliate(
        tx,
        {
          name: app.name,
          email: app.email,
          phone: profile.phone,
          code: profile.code,
          commissionRateBp: profile.commissionRateBp,
          payoutInfo: profile.payoutInfo,
          parentId: app.inviterId,
          passwordHash: app.passwordHash,
        },
        actorId,
        "affiliate.approve",
      );
      await tx.affiliateApplication.update({
        where: { id },
        data: { status: "APPROVED", passwordHash: null, affiliateId: affiliate.id, reviewedById: actorId, reviewedAt: now },
      });
      return affiliate;
    });
  } catch (e) {
    if (e instanceof ApplicationError || e instanceof AffiliateError) throw e;
    uniqueError(e);
  }
}

export async function rejectApplication(id: string, rawNote: unknown, actorId: string, now = new Date()) {
  const note = z.string().trim().max(500).transform(toUnicode).parse(rawNote ?? "");
  await prisma.$transaction(async (tx) => {
    const updated = await tx.affiliateApplication.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "REJECTED", passwordHash: null, note: note || null, reviewedById: actorId, reviewedAt: now },
    });
    if (updated.count === 0) throw new ApplicationError("not_pending", "Đơn đã được xử lý");
    await tx.auditLog.create({ data: { userId: actorId, action: "affiliate.reject", entity: "AffiliateApplication", entityId: id, data: { note } } });
  });
}
