import "server-only";
import { z } from "zod";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "@/lib/db";
import { toUnicode } from "@/lib/myanmar";
import { CUSTOMER_ROLE } from "@/server/auth/customer-policy";
import { normalizeMmPhone } from "@/server/orders/pricing";
import { MIN_CUSTOMER_PASSWORD } from "./phone";

/**
 * Quản trị tài khoản khách storefront (P17, quyền `users:manage`): tìm, đặt lại mật khẩu (khách SĐT không tự lấy lại
 * được), khoá / mở khoá. Chỉ đụng user role CUSTOMER — nhân viên/CTV quản lý ở trang riêng.
 */

export type CustomerAccountErrorCode = "not_found" | "no_password";

export class CustomerAccountError extends Error {
  constructor(
    public readonly code: CustomerAccountErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CustomerAccountError";
  }
}

/** Tìm theo SĐT (chuẩn hoá được), email hoặc tên; mới nhất trước, tối đa 100. */
export async function listCustomerAccounts(q = "") {
  const term = toUnicode(q.trim());
  const phone = term ? normalizeMmPhone(term) : null;
  const users = await prisma.user.findMany({
    where: {
      role: CUSTOMER_ROLE,
      ...(term && {
        OR: [
          ...(phone ? [{ phoneNumber: phone }] : []),
          { email: { contains: term, mode: "insensitive" as const } },
          { name: { contains: term, mode: "insensitive" as const } },
        ],
      }),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      name: true,
      email: true,
      phoneNumber: true,
      active: true,
      createdAt: true,
      accounts: { select: { providerId: true } },
      _count: { select: { orders: true } },
    },
  });
  return users.map(({ accounts, ...u }) => ({ ...u, providers: [...new Set(accounts.map((a) => a.providerId))] }));
}

async function customerOrThrow(id: string) {
  const u = await prisma.user.findFirst({ where: { id, role: CUSTOMER_ROLE }, select: { id: true } });
  if (!u) throw new CustomerAccountError("not_found", "Không tìm thấy tài khoản khách");
}

/** Đặt mật khẩu tạm cho khách (chỉ tài khoản có mật khẩu — Google-only thì không có), thu hồi mọi phiên. */
export async function resetCustomerPassword(id: string, rawPassword: unknown, actorId: string) {
  const password = z.string().min(MIN_CUSTOMER_PASSWORD).max(128).parse(rawPassword);
  await customerOrThrow(id);
  const hash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    const updated = await tx.account.updateMany({ where: { userId: id, providerId: "credential" }, data: { password: hash } });
    if (updated.count === 0) throw new CustomerAccountError("no_password", "Tài khoản đăng nhập bằng Google, không có mật khẩu");
    await tx.session.deleteMany({ where: { userId: id } });
    await tx.auditLog.create({ data: { userId: actorId, action: "customer.resetPassword", entity: "User", entityId: id } });
  });
}

/** Khoá (xoá mọi phiên, không đăng nhập được) / mở khoá tài khoản khách. */
export async function setCustomerActive(id: string, active: boolean, actorId: string) {
  await customerOrThrow(id);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { active } });
    if (!active) await tx.session.deleteMany({ where: { userId: id } });
    await tx.auditLog.create({
      data: { userId: actorId, action: active ? "customer.activate" : "customer.deactivate", entity: "User", entityId: id },
    });
  });
}
