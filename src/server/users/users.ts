import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { emailSchema, mmTextReq, newPasswordSchema } from "@/lib/schemas";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "@/lib/db";
import { Prisma, type Role } from "@/generated/prisma/client";
import { MIN_STAFF_PASSWORD, ROLES, type Role as StaffRole } from "@/server/auth/roles";

/**
 * Quản lý tài khoản nhân viên (P8): tạo, đổi tên/vai trò, khoá/mở khoá, đặt lại mật khẩu.
 * Mật khẩu băm bằng `better-auth/crypto` (giống seed) và lưu ở `Account` providerId "credential".
 * Khoá / đặt lại mật khẩu → xoá mọi phiên của người đó. Luôn còn ít nhất 1 ADMIN đang hoạt động.
 */

export type UserErrorCode = "email_taken" | "not_found" | "self" | "last_admin";

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

export const updateStaffSchema = z.object({ name: nameSchema, role: roleSchema });

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
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new UserError("email_taken", "Email đã được dùng cho tài khoản khác");
    }
    throw e;
  }
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
  const [row] = await tx.$queryRaw<{ id: string; role: Role; active: boolean }[]>`
    SELECT id, role, active FROM "user" WHERE id = ${id} FOR UPDATE`;
  if (!row) throw new UserError("not_found", "Không tìm thấy nhân viên");
  return row;
}

export async function updateStaff(id: string, raw: unknown, actorId: string) {
  const input = updateStaffSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    const cur = await lockStaff(tx, id);
    if (cur.role !== input.role) {
      if (id === actorId) throw new UserError("self", "Không thể tự đổi vai trò của mình");
      if (cur.role === "ADMIN" && cur.active) await assertOtherActiveAdmin(tx, id);
    }
    const user = await tx.user.update({ where: { id }, data: { name: input.name, role: input.role } });
    await tx.auditLog.create({
      data: { userId: actorId, action: "user.update", entity: "User", entityId: id, data: { name: input.name, role: input.role } },
    });
    return user;
  });
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
