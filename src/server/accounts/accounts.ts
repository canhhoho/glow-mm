import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { toUnicode } from "@/lib/myanmar";
import { normalizeMmPhone } from "@/server/orders/pricing";

/**
 * Tài khoản khách (P14b): hồ sơ, đơn của tôi, sổ địa chỉ. Mọi hàm nhận `userId` từ `getCustomerUser()` —
 * không bao giờ từ input client; truy vấn luôn lọc theo userId.
 */

export type AccountErrorCode = "not_found" | "too_many" | "invalid_phone" | "invalid_zone";

export class AccountError extends Error {
  constructor(
    public readonly code: AccountErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AccountError";
  }
}

export const MAX_ADDRESSES = 10;

// ── Hồ sơ ──

export const profileSchema = z.object({ name: z.string().trim().min(1).max(100).transform(toUnicode) });

export async function updateProfile(userId: string, raw: unknown) {
  const { name } = profileSchema.parse(raw);
  return prisma.user.update({ where: { id: userId }, data: { name }, select: { id: true, name: true } });
}

// ── Đơn của tôi ──

export function accountOrders(userId: string, take = 50) {
  return prisma.order.findMany({
    where: { accountId: userId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      code: true,
      status: true,
      paymentStatus: true,
      totalMmk: true,
      createdAt: true,
      _count: { select: { items: true } },
    },
  });
}

// ── Sổ địa chỉ ──

export const addressSchema = z.object({
  recipientName: z.string().trim().min(1).max(100).transform(toUnicode),
  phone: z.string().trim().min(1).max(30),
  zoneId: z.string().min(1),
  line: z.string().trim().min(3).max(500).transform(toUnicode),
  note: z
    .string()
    .trim()
    .max(300)
    .transform(toUnicode)
    .optional()
    .transform((v) => v || null),
  isDefault: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()).default(false),
});

async function parseAddress(raw: unknown) {
  const input = addressSchema.parse(raw);
  const phone = normalizeMmPhone(input.phone);
  if (!phone) throw new AccountError("invalid_phone", "Số điện thoại không hợp lệ");
  const zone = await prisma.shippingZone.findFirst({ where: { id: input.zoneId, active: true }, select: { id: true } });
  if (!zone) throw new AccountError("invalid_zone", "Khu vực không hợp lệ");
  return { ...input, phone };
}

export function listAddresses(userId: string) {
  return prisma.accountAddress.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    include: { zone: { select: { nameMy: true, nameEn: true, active: true } } },
  });
}

/** Địa chỉ mặc định (tự điền khi thanh toán) hoặc null. */
export function defaultAddress(userId: string) {
  return prisma.accountAddress.findFirst({ where: { userId }, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] });
}

export async function createAddress(userId: string, raw: unknown) {
  const { isDefault, ...data } = await parseAddress(raw);
  return prisma.$transaction(async (tx) => {
    // Khoá dòng user để đếm giới hạn chính xác khi gửi 2 lần.
    await tx.$queryRaw`SELECT "id" FROM "user" WHERE "id" = ${userId} FOR UPDATE`;
    const count = await tx.accountAddress.count({ where: { userId } });
    if (count >= MAX_ADDRESSES) throw new AccountError("too_many", "Tối đa 10 địa chỉ");
    const makeDefault = isDefault || count === 0;
    if (makeDefault) await tx.accountAddress.updateMany({ where: { userId }, data: { isDefault: false } });
    return tx.accountAddress.create({ data: { ...data, userId, isDefault: makeDefault } });
  });
}

export async function updateAddress(userId: string, id: string, raw: unknown) {
  const { isDefault, ...data } = await parseAddress(raw);
  return prisma.$transaction(async (tx) => {
    const current = await tx.accountAddress.findFirst({ where: { id, userId }, select: { isDefault: true } });
    if (!current) throw new AccountError("not_found", "Không tìm thấy địa chỉ");
    if (isDefault) await tx.accountAddress.updateMany({ where: { userId }, data: { isDefault: false } });
    return tx.accountAddress.update({ where: { id }, data: { ...data, isDefault: isDefault || current.isDefault } });
  });
}

export async function setDefaultAddress(userId: string, id: string) {
  await prisma.$transaction(async (tx) => {
    if (!(await tx.accountAddress.findFirst({ where: { id, userId }, select: { id: true } }))) {
      throw new AccountError("not_found", "Không tìm thấy địa chỉ");
    }
    await tx.accountAddress.updateMany({ where: { userId }, data: { isDefault: false } });
    await tx.accountAddress.update({ where: { id }, data: { isDefault: true } });
  });
}

/** Xoá địa chỉ; xoá địa chỉ mặc định thì địa chỉ mới nhất còn lại thành mặc định. */
export async function deleteAddress(userId: string, id: string) {
  await prisma.$transaction(async (tx) => {
    const current = await tx.accountAddress.findFirst({ where: { id, userId }, select: { isDefault: true } });
    if (!current) throw new AccountError("not_found", "Không tìm thấy địa chỉ");
    await tx.accountAddress.delete({ where: { id } });
    if (current.isDefault) {
      const next = await tx.accountAddress.findFirst({ where: { userId }, orderBy: { createdAt: "desc" }, select: { id: true } });
      if (next) await tx.accountAddress.update({ where: { id: next.id }, data: { isDefault: true } });
    }
  });
}
