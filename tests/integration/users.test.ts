import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { auth } from "@/server/auth/auth";
import {
  assertNotLastAdmin,
  createStaff,
  listStaff,
  resetStaffPassword,
  setStaffActive,
  updateStaff,
} from "@/server/users/users";

const PASSWORD = "it-staff-password-1";

async function actor() {
  const u = await prisma.user.upsert({
    where: { email: "it-runner@glow.local" },
    update: {},
    create: { id: "it-runner", email: "it-runner@glow.local", name: "IT", role: "ADMIN" },
  });
  return u.id;
}

const tag = () => randomBytes(4).toString("hex");
const signIn = (email: string, password = PASSWORD) => auth.api.signInEmail({ body: { email, password } });

describe("Quản lý nhân viên", () => {
  it("tạo → đăng nhập được; khoá → mất phiên, không đăng nhập được; mở khoá → lại được", async () => {
    const actorId = await actor();
    const email = `IT-Staff-${tag()}@Glow.Local`;
    const user = await createStaff({ name: "  Ko Min  ", email, role: "ORDER_STAFF", password: PASSWORD }, actorId);
    expect(user).toMatchObject({ name: "Ko Min", email: email.toLowerCase(), role: "ORDER_STAFF", active: true });
    expect(await listStaff({ q: email.toLowerCase() })).toEqual([expect.objectContaining({ id: user.id })]);

    const res = await signIn(email.toLowerCase());
    expect(res.token).toBeTruthy();
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);

    await setStaffActive(user.id, false, actorId);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    await expect(signIn(email.toLowerCase())).rejects.toMatchObject({ body: { code: "USER_INACTIVE" } });
    expect(await listStaff({ q: email.toLowerCase(), active: true })).toEqual([]);

    await setStaffActive(user.id, true, actorId);
    expect((await signIn(email.toLowerCase())).token).toBeTruthy();

    const actions = await prisma.auditLog.findMany({ where: { entity: "User", entityId: user.id }, orderBy: { createdAt: "asc" } });
    expect(actions.map((a) => a.action)).toEqual(["user.create", "user.deactivate", "user.activate"]);
    expect(JSON.stringify(actions)).not.toContain(PASSWORD);
  });

  it("đặt lại mật khẩu: mật khẩu cũ hết dùng, phiên cũ bị xoá", async () => {
    const actorId = await actor();
    const email = `it-staff-${tag()}@glow.local`;
    const user = await createStaff({ name: "Ma Su", email, role: "WAREHOUSE_MANAGER", password: PASSWORD }, actorId);
    await signIn(email);

    await expect(resetStaffPassword(user.id, "short", actorId)).rejects.toThrow();
    await resetStaffPassword(user.id, "brand-new-password-2", actorId);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    await expect(signIn(email)).rejects.toThrow();
    expect((await signIn(email, "brand-new-password-2")).token).toBeTruthy();
  });

  it("email trùng (không phân biệt hoa thường), dữ liệu sai", async () => {
    const actorId = await actor();
    const email = `it-staff-${tag()}@glow.local`;
    await createStaff({ name: "A", email, role: "ORDER_STAFF", password: PASSWORD }, actorId);
    await expect(
      createStaff({ name: "B", email: email.toUpperCase(), role: "ORDER_STAFF", password: PASSWORD }, actorId),
    ).rejects.toMatchObject({ code: "email_taken" });
    await expect(createStaff({ name: "C", email: "khong-phai-email", role: "ORDER_STAFF", password: PASSWORD }, actorId)).rejects.toThrow();
    await expect(createStaff({ name: "D", email: `x${email}`, role: "ROOT", password: PASSWORD }, actorId)).rejects.toThrow();
    await expect(createStaff({ name: "E", email: `y${email}`, role: "ORDER_STAFF", password: "short" }, actorId)).rejects.toThrow();
  });

  it("không tự khoá / tự đổi vai trò / tự đặt lại mật khẩu; đổi vai trò người khác được", async () => {
    const actorId = await actor();
    await expect(setStaffActive(actorId, false, actorId)).rejects.toMatchObject({ code: "self" });
    await expect(updateStaff(actorId, { name: "IT", role: "ORDER_STAFF" }, actorId)).rejects.toMatchObject({ code: "self" });
    await expect(resetStaffPassword(actorId, "whatever-password", actorId)).rejects.toMatchObject({ code: "self" });
    expect(await updateStaff(actorId, { name: "IT", role: "ADMIN" }, actorId)).toMatchObject({ role: "ADMIN" });

    const other = await createStaff(
      { name: "Admin 2", email: `it-admin-${tag()}@glow.local`, role: "ADMIN", password: PASSWORD },
      actorId,
    );
    expect(await updateStaff(other.id, { name: "Kho 2", role: "WAREHOUSE_MANAGER" }, actorId)).toMatchObject({
      name: "Kho 2",
      role: "WAREHOUSE_MANAGER",
    });
    await expect(setStaffActive("khong-co", false, actorId)).rejects.toMatchObject({ code: "not_found" });
  });

  it("luôn còn ít nhất 1 ADMIN đang hoạt động", () => {
    expect(() => assertNotLastAdmin(["a"], "a")).toThrow(expect.objectContaining({ code: "last_admin" }));
    expect(() => assertNotLastAdmin([], "a")).toThrow(expect.objectContaining({ code: "last_admin" }));
    expect(() => assertNotLastAdmin(["a", "b"], "a")).not.toThrow();
  });
});
