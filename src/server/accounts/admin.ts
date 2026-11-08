import "server-only";
import { z } from "zod";
import { mmTextReq, newPasswordSchema } from "@/lib/schemas";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { toUnicode } from "@/lib/myanmar";
import { CUSTOMER_ROLE, isPhoneEmail, phoneEmail } from "@/server/auth/customer-policy";
import { normalizeMmPhone } from "@/lib/phone";
import { MIN_CUSTOMER_PASSWORD } from "./phone";

/**
 * Quản trị tài khoản khách storefront (P17, quyền `users:manage`): tìm, sửa tên/SĐT, đặt lại mật khẩu (khách SĐT không tự
 * lấy lại được), khoá / mở khoá, xoá tài khoản chưa có đơn. Chỉ đụng user role CUSTOMER — nhân viên/CTV quản lý ở trang riêng.
 */

export type CustomerAccountErrorCode = "not_found" | "no_password" | "in_use" | "phone_taken" | "invalid_phone";

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
  const password = newPasswordSchema(MIN_CUSTOMER_PASSWORD).parse(rawPassword);
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

/** Một tài khoản khách cho trang sửa `/admin/customer-accounts/[id]`; không phải khách → null. */
export async function getCustomerAccount(id: string) {
  const u = await prisma.user.findFirst({
    where: { id, role: CUSTOMER_ROLE },
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
  if (!u) return null;
  const { accounts, ...rest } = u;
  return { ...rest, providers: [...new Set(accounts.map((a) => a.providerId))] };
}

export const updateCustomerSchema = z.object({ name: mmTextReq(100), phone: z.string().trim().max(32).optional() });

/**
 * Sửa tên (và SĐT đăng nhập nếu tài khoản đăng ký bằng SĐT). Đổi SĐT → đổi luôn email nội bộ `<SĐT>@phone.glow.invalid`
 * để đăng nhập bằng số mới; tài khoản Google/email giữ nguyên email. SĐT trùng tài khoản khác → `phone_taken`.
 */
export async function updateCustomerAccount(id: string, raw: unknown, actorId: string) {
  const input = updateCustomerSchema.parse(raw);
  try {
    await prisma.$transaction(async (tx) => {
      const [cur] = await tx.$queryRaw<{ id: string; role: string; email: string; phoneNumber: string | null }[]>`
        SELECT id, role, email, "phoneNumber" FROM "user" WHERE id = ${id} FOR UPDATE`;
      if (!cur || cur.role !== CUSTOMER_ROLE) throw new CustomerAccountError("not_found", "Không tìm thấy tài khoản khách");
      let phone: string | undefined;
      if (cur.phoneNumber && input.phone) {
        const normalized = normalizeMmPhone(toUnicode(input.phone));
        if (!normalized) throw new CustomerAccountError("invalid_phone", "Số điện thoại không hợp lệ");
        if (normalized !== cur.phoneNumber) phone = normalized;
      }
      const email = phone && isPhoneEmail(cur.email) ? phoneEmail(phone) : undefined;
      if (phone) {
        const taken = await tx.user.findFirst({
          where: { id: { not: id }, OR: [{ phoneNumber: phone }, ...(email ? [{ email }] : [])] },
          select: { id: true },
        });
        if (taken) throw new CustomerAccountError("phone_taken", "Số điện thoại đã được dùng cho tài khoản khác");
      }
      await tx.user.update({ where: { id }, data: { name: input.name, ...(phone && { phoneNumber: phone }), ...(email && { email }) } });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: "customer.update",
          entity: "User",
          entityId: id,
          data: { name: input.name, ...(phone && { phone: { from: cur.phoneNumber, to: phone } }) },
        },
      });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new CustomerAccountError("phone_taken", "Số điện thoại đã được dùng cho tài khoản khác");
    }
    throw e;
  }
}

/**
 * Xoá tài khoản khách chưa có đơn (đánh giá gắn theo đơn nên cũng không có). Địa chỉ đã lưu, phiên, mật khẩu xoá theo
 * (onDelete: Cascade). Khách đã có đơn → `in_use`, dùng khoá để giữ lịch sử.
 */
export async function deleteCustomerAccount(id: string, actorId: string) {
  await prisma.$transaction(async (tx) => {
    const [cur] = await tx.$queryRaw<{ id: string; role: string; email: string; phoneNumber: string | null }[]>`
      SELECT id, role, email, "phoneNumber" FROM "user" WHERE id = ${id} FOR UPDATE`;
    if (!cur || cur.role !== CUSTOMER_ROLE) throw new CustomerAccountError("not_found", "Không tìm thấy tài khoản khách");
    const orders = await tx.order.count({ where: { OR: [{ accountId: id }, { createdById: id }] } });
    if (orders > 0) throw new CustomerAccountError("in_use", "Khách đã có đơn hàng; hãy khoá tài khoản");
    await tx.user.delete({ where: { id } });
    await tx.auditLog.create({
      data: { userId: actorId, action: "customer.delete", entity: "User", entityId: id, data: { email: cur.email, phone: cur.phoneNumber } },
    });
  });
}
