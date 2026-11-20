import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { emailSchema, mmTextReq, newPasswordSchema } from "@/lib/schemas";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "@/lib/db";
import { Prisma, type Role } from "@/generated/prisma/client";
import { MIN_STAFF_PASSWORD, ROLES, type Role as StaffRole } from "@/server/auth/roles";

/**
 * Quản lý tài khoản nhân viên (P8): tạo, đổi tên/vai trò/email, khoá/mở khoá, đặt lại mật khẩu.
 * Mật khẩu băm bằng `better-auth/crypto` (giống seed) và lưu ở `Account` providerId "credential".
 * Khoá / đặt lại mật khẩu → xoá mọi phiên của người đó. Luôn còn ít nhất 1 ADMIN đang hoạt động.
 * Xoá chỉ cho tài khoản tạo nhầm (chưa có thao tác/dữ liệu nào) — người đã làm việc thì khoá để giữ lịch sử.
 */

export type UserErrorCode = "email_taken" | "not_found" | "self" | "last_admin" | "in_use";

export class UserError extends Error {
  constructor(
    public readonly code: UserErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "UserError";
  }
}

const nameSchema = mmTextReq(100);
const roleSchema = z.enum(ROLES);
const passwordSchema = newPasswordSchema(MIN_STAFF_PASSWORD);

export const createStaffSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  role: roleSchema,
  password: passwordSchema,
});

/** `email` bỏ trống = giữ nguyên. Admin đổi email người khác; không tự đổi email của mình. */
export const updateStaffSchema = z.object({ name: nameSchema, role: roleSchema, email: emailSchema.optional() });

export type StaffFilter = { q?: string; role?: Role; active?: boolean };

export async function listStaff(filter: StaffFilter = {}) {
  const q = filter.q?.trim();
  return prisma.user.findMany({
    where: {
      // CTV (role AFFILIATE) quản lý ở trang CTV riêng, không lẫn vào danh sách nhân viên.
      role: filter.role ?? { in: [...ROLES] },
      active: filter.active,
      ...(q && { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] }),
    },
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    take: 200,
  });
}

export async function getStaff(id: string) {
  const user = await prisma.user.findFirst({
    where: { id, role: { in: [...ROLES] } },
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
  });
  return user as (typeof user & { role: StaffRole }) | null;
}

export async function createStaff(raw: unknown, actorId: string) {
  const input = createStaffSchema.parse(raw);
  const id = randomUUID();
  const hash = await hashPassword(input.password);
  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          id,
          name: input.name,
          email: input.email,
          role: input.role,
          accounts: { create: { id: randomUUID(), accountId: id, providerId: "credential", password: hash } },
        },
      });
      await tx.auditLog.create({
        data: { userId: actorId, action: "user.create", entity: "User", entityId: id, data: { email: input.email, role: input.role } },
      });
      return user;
    });
  } catch (e) {
    emailTakenError(e);
  }
}

/** Lỗi unique (email trùng) → `email_taken`; lỗi khác ném lại nguyên vẹn. */
function emailTakenError(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    throw new UserError("email_taken", "Email đã được dùng cho tài khoản khác");
  }
  throw e;
}

/**
 * Khoá các dòng ADMIN đang hoạt động rồi kiểm tra: bỏ `userId` ra thì còn ít nhất 1 ADMIN.
 * Gọi trong transaction trước khi hạ quyền / khoá một ADMIN (2 thao tác đồng thời không thể cùng lọt).
 */
async function assertOtherActiveAdmin(tx: Prisma.TransactionClient, userId: string) {
  const admins = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "user" WHERE role = 'ADMIN' AND active = true FOR UPDATE`;
  assertNotLastAdmin(
    admins.map((a) => a.id),
    userId,
  );
}

/** Phần thuần của kiểm tra "ADMIN cuối cùng" (test được không cần DB). */
export function assertNotLastAdmin(activeAdminIds: string[], userId: string) {
  if (!activeAdminIds.some((id) => id !== userId)) throw new UserError("last_admin", "Phải còn ít nhất 1 ADMIN đang hoạt động");
}

async function lockStaff(tx: Prisma.TransactionClient, id: string) {
  const [row] = await tx.$queryRaw<{ id: string; role: Role; active: boolean; email: string }[]>`
    SELECT id, role, active, email FROM "user" WHERE id = ${id} FOR UPDATE`;
  if (!row) throw new UserError("not_found", "Không tìm thấy nhân viên");
  return row;
}

export async function updateStaff(id: string, raw: unknown, actorId: string) {
  const input = updateStaffSchema.parse(raw);
  try {
    return await prisma.$transaction(async (tx) => {
      const cur = await lockStaff(tx, id);
      if (cur.role !== input.role) {
        if (id === actorId) throw new UserError("self", "Không thể tự đổi vai trò của mình");
        if (cur.role === "ADMIN" && cur.active) await assertOtherActiveAdmin(tx, id);
      }
      const email = input.email && input.email !== cur.email ? input.email : undefined;
      if (email && id === actorId) throw new UserError("self", "Không thể tự đổi email của mình");
      const user = await tx.user.update({ where: { id }, data: { name: input.name, role: input.role, email } });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: "user.update",
          entity: "User",
          entityId: id,
          data: { name: input.name, role: input.role, ...(email && { email: { from: cur.email, to: email } }) },
        },
      });
      return user;
    });
  } catch (e) {
    emailTakenError(e);
  }
}

export async function setStaffActive(id: string, active: boolean, actorId: string) {
  if (id === actorId) throw new UserError("self", "Không thể tự khoá tài khoản của mình");
  await prisma.$transaction(async (tx) => {
    const cur = await lockStaff(tx, id);
    if (cur.active === active) return;
    if (!active && cur.role === "ADMIN") await assertOtherActiveAdmin(tx, id);
    await tx.user.update({ where: { id }, data: { active } });
    if (!active) await tx.session.deleteMany({ where: { userId: id } });
    await tx.auditLog.create({
      data: { userId: actorId, action: active ? "user.activate" : "user.deactivate", entity: "User", entityId: id },
    });
  });
}

/** Admin đặt mật khẩu tạm cho nhân viên (tự đổi mật khẩu của mình dùng /admin/account). */
export async function resetStaffPassword(id: string, rawPassword: unknown, actorId: string) {
  if (id === actorId) throw new UserError("self", "Đổi mật khẩu của mình ở trang Tài khoản");
  const password = passwordSchema.parse(rawPassword);
  const hash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    await lockStaff(tx, id);
    const updated = await tx.account.updateMany({ where: { userId: id, providerId: "credential" }, data: { password: hash } });
    if (updated.count === 0) {
      await tx.account.create({ data: { id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: hash } });
    }
    await tx.session.deleteMany({ where: { userId: id } });
    await tx.auditLog.create({ data: { userId: actorId, action: "user.resetPassword", entity: "User", entityId: id } });
  });
}

/**
 * Tài khoản đã để lại dấu vết nghiệp vụ? Các cột người thao tác là chuỗi thường (không FK) nên phải đếm từng bảng;
 * nhật ký thao tác (`AuditLog.userId`) bắt gần như mọi việc nhân viên đã làm.
 */
async function staffHasData(tx: Prisma.TransactionClient, id: string) {
  const counts: (() => Promise<number>)[] = [
    () => tx.auditLog.count({ where: { userId: id } }),
    () => tx.order.count({ where: { OR: [{ createdById: id }, { accountId: id }] } }),
    () => tx.orderStatusHistory.count({ where: { userId: id } }),
    () => tx.orderPick.count({ where: { printedById: id } }),
    () => tx.paymentProof.count({ where: { reviewedById: id } }),
    () => tx.stockDocument.count({ where: { OR: [{ createdById: id }, { postedById: id }] } }),
    () => tx.stockLedger.count({ where: { userId: id } }),
    () => tx.exchangeRate.count({ where: { createdById: id } }),
    () => tx.priceUpdateRun.count({ where: { createdById: id } }),
    () => tx.priceHistory.count({ where: { userId: id } }),
    () => tx.shipmentAllocation.count({ where: { createdById: id } }),
    () => tx.catalogOpeningImport.count({ where: { userId: id } }),
    () => tx.affiliatePayout.count({ where: { createdById: id } }),
    () => tx.affiliateApplication.count({ where: { reviewedById: id } }),
  ];
  // Tuần tự: cùng một kết nối của interactive transaction.
  for (const count of counts) if ((await count()) > 0) return true;
  return false;
}

/** Xoá nhân viên tạo nhầm. Không xoá chính mình, ADMIN cuối cùng, hay tài khoản đã có thao tác/dữ liệu (`in_use`). */
export async function deleteStaff(id: string, actorId: string) {
  if (id === actorId) throw new UserError("self", "Không thể tự xoá tài khoản của mình");
  await prisma.$transaction(async (tx) => {
    const cur = await lockStaff(tx, id);
    if (!(ROLES as readonly string[]).includes(cur.role)) throw new UserError("not_found", "Không tìm thấy nhân viên");
    if (cur.role === "ADMIN" && cur.active) await assertOtherActiveAdmin(tx, id);
    if (await staffHasData(tx, id)) throw new UserError("in_use", "Nhân viên đã có dữ liệu liên quan; hãy khoá tài khoản");
    await tx.user.delete({ where: { id } }); // phiên + mật khẩu xoá theo (onDelete: Cascade)
    await tx.auditLog.create({
      data: { userId: actorId, action: "user.delete", entity: "User", entityId: id, data: { email: cur.email, role: cur.role } },
    });
  });
}
