import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { registerPhoneCustomer } from "@/server/accounts/phone";
import {
  decidePasswordReset,
  expirePasswordResets,
  listPasswordResetRequests,
  pendingPasswordResetCount,
  requestPasswordReset,
  RESET_TTL_DAYS,
} from "@/server/accounts/password-reset";
import { customerAuth } from "@/server/auth/customer-auth";
import { cleanupExpired } from "@/server/cron/cleanup";
import { createStaff } from "@/server/users/users";

const OLD = "it-old-pass-1";
const NEW = "it-new-pass-2";
const randomPhone = () => `09${(100_000_000 + (randomBytes(4).readUInt32BE() % 900_000_000)).toString()}`;
const signIn = (phoneNumber: string, password: string) => customerAuth.api.signInPhoneNumber({ body: { phoneNumber, password } });
const ip = () => `it-pw-${randomBytes(4).toString("hex")}`;

async function actor() {
  const u = await prisma.user.upsert({
    where: { email: "it-runner@glow.local" },
    update: {},
    create: { id: "it-runner", email: "it-runner@glow.local", name: "IT", role: "ADMIN" },
  });
  return u.id;
}

async function customer() {
  const phone = randomPhone();
  const { userId } = await registerPhoneCustomer({ name: "Ma Quen", phone, password: OLD, confirmPassword: OLD }, { ip: ip() });
  return { userId, phone };
}

const request = (phone: string, password = NEW, extra: { ip?: string; now?: Date } = {}) =>
  requestPasswordReset({ phone, password, confirmPassword: password }, { ip: extra.ip ?? ip(), now: extra.now });

const pendingOf = (userId: string) => prisma.passwordResetRequest.findMany({ where: { userId, status: "PENDING" } });

describe("Khách quên mật khẩu → yêu cầu, admin xác nhận", () => {
  it("yêu cầu chưa đổi gì; xác nhận → mật khẩu mới dùng được, cũ hết dùng, phiên bị thu hồi, hash bị xoá, có audit", async () => {
    const admin = await actor();
    const { userId, phone } = await customer();
    await signIn(phone, OLD); // tạo một phiên cũ
    expect(await prisma.session.count({ where: { userId } })).toBeGreaterThan(0);

    expect(await request(phone)).toEqual({ created: true });
    const [req] = await pendingOf(userId);
    expect(req.passwordHash).toBeTruthy();
    expect(req.passwordHash).not.toContain(NEW); // chỉ lưu hash
    expect(req.expiresAt.getTime() - req.createdAt.getTime()).toBe(RESET_TTL_DAYS * 86_400_000);

    // Chưa xác nhận: mật khẩu cũ vẫn đăng nhập, mật khẩu mới thì chưa.
    await expect(signIn(phone, OLD)).resolves.toBeTruthy();
    await expect(signIn(phone, NEW)).rejects.toBeTruthy();

    await decidePasswordReset(req.id, true, admin);
    await expect(signIn(phone, NEW)).resolves.toBeTruthy();
    await expect(signIn(phone, OLD)).rejects.toBeTruthy();

    const done = await prisma.passwordResetRequest.findUniqueOrThrow({ where: { id: req.id } });
    expect(done).toMatchObject({ status: "APPROVED", passwordHash: null, decidedById: admin });
    expect(await prisma.auditLog.count({ where: { entityId: userId, action: "customer.passwordReset.approve", userId: admin } })).toBe(1);
  });

  it("xác nhận thu hồi mọi phiên đang có", async () => {
    const admin = await actor();
    const { userId, phone } = await customer();
    await signIn(phone, OLD);
    await request(phone);
    const [req] = await pendingOf(userId);
    expect(await prisma.session.count({ where: { userId } })).toBeGreaterThan(0);
    await decidePasswordReset(req.id, true, admin);
    expect(await prisma.session.count({ where: { userId } })).toBe(0);
  });

  it("từ chối: mật khẩu cũ giữ nguyên, hash bị xoá, không xác nhận lại được", async () => {
    const admin = await actor();
    const { userId, phone } = await customer();
    await request(phone);
    const [req] = await pendingOf(userId);
    await decidePasswordReset(req.id, false, admin);
    await expect(signIn(phone, OLD)).resolves.toBeTruthy();
    await expect(signIn(phone, NEW)).rejects.toBeTruthy();
    expect(await prisma.passwordResetRequest.findUniqueOrThrow({ where: { id: req.id } })).toMatchObject({ status: "REJECTED", passwordHash: null });
    await expect(decidePasswordReset(req.id, true, admin)).rejects.toMatchObject({ code: "not_pending" });
    expect(await prisma.auditLog.count({ where: { entityId: userId, action: "customer.passwordReset.reject" } })).toBe(1);
  });

  it("SĐT chưa đăng ký: không tạo gì, kết quả không lộ; SĐT sai định dạng / mật khẩu ngắn / không khớp → lỗi", async () => {
    const before = await prisma.passwordResetRequest.count();
    expect(await request(randomPhone())).toEqual({ created: false });
    expect(await prisma.passwordResetRequest.count()).toBe(before);
    await expect(request("12345")).rejects.toMatchObject({ code: "invalid_phone" });
    await expect(requestPasswordReset({ phone: randomPhone(), password: "short", confirmPassword: "short" }, { ip: ip() })).rejects.toThrow();
    await expect(requestPasswordReset({ phone: randomPhone(), password: NEW, confirmPassword: "khac" }, { ip: ip() })).rejects.toThrow();
  });

  it("gửi lại: bản cũ SUPERSEDED (xoá hash), chỉ còn một bản chờ — kể cả khi gửi đồng thời", async () => {
    const { userId, phone } = await customer();
    await request(phone, "it-first-pass-1");
    const [first] = await pendingOf(userId);
    await Promise.all([request(phone, "it-second-pass-2"), request(phone, "it-third-pass-3")]);
    const pending = await pendingOf(userId);
    expect(pending).toHaveLength(1);
    const old = await prisma.passwordResetRequest.findUniqueOrThrow({ where: { id: first.id } });
    expect(old).toMatchObject({ status: "SUPERSEDED", passwordHash: null });
    const all = await prisma.passwordResetRequest.findMany({ where: { userId } });
    expect(all.filter((r) => r.status === "SUPERSEDED")).toHaveLength(2);
  });

  it("hết hạn: không xác nhận được; cron cleanup đóng yêu cầu quá hạn và xoá hash", async () => {
    const admin = await actor();
    const { userId, phone } = await customer();
    const longAgo = new Date(Date.now() - (RESET_TTL_DAYS + 1) * 86_400_000);
    await request(phone, NEW, { now: longAgo });
    const [req] = await pendingOf(userId);
    expect(await listPasswordResetRequests()).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: req.id })]));
    await expect(decidePasswordReset(req.id, true, admin)).rejects.toMatchObject({ code: "expired" });
    await expect(signIn(phone, NEW)).rejects.toBeTruthy();

    expect((await cleanupExpired()).passwordResets).toBeGreaterThanOrEqual(1);
    expect(await prisma.passwordResetRequest.findUniqueOrThrow({ where: { id: req.id } })).toMatchObject({ status: "REJECTED", passwordHash: null, decidedById: null });
    expect(await expirePasswordResets()).toBe(0);
  });

  it("hai admin xác nhận cùng lúc: đúng một lần thành công", async () => {
    const admin = await actor();
    const { userId, phone } = await customer();
    await request(phone);
    const [req] = await pendingOf(userId);
    const results = await Promise.allSettled([decidePasswordReset(req.id, true, admin), decidePasswordReset(req.id, true, admin)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(failed.reason).toMatchObject({ code: "not_pending" });
    expect(await prisma.auditLog.count({ where: { entityId: userId, action: "customer.passwordReset.approve" } })).toBe(1);
  });

  it("giới hạn tần suất: tối đa 3 lần / ngày / SĐT (kể cả SĐT chưa đăng ký) và 5 lần / giờ / IP", async () => {
    const phone = randomPhone(); // chưa đăng ký: vẫn bị đếm, không lộ được là có tài khoản hay không
    for (let i = 0; i < 3; i++) await request(phone);
    await expect(request(phone)).rejects.toMatchObject({ code: "too_many" });

    const sameIp = ip();
    for (let i = 0; i < 5; i++) await request(randomPhone(), NEW, { ip: sameIp });
    await expect(request(randomPhone(), NEW, { ip: sameIp })).rejects.toMatchObject({ code: "too_many" });
  });

  it("không đổi được mật khẩu nhân viên / CTV qua luồng này; tài khoản bị khoá vẫn bị khoá sau khi xác nhận", async () => {
    const admin = await actor();
    const staffPhone = randomPhone();
    const staff = await createStaff(
      { name: "Ko Staff", email: `it-pw-staff-${randomBytes(3).toString("hex")}@glow.local`, role: "ORDER_STAFF", password: "it-staff-password-1" },
      admin,
    );
    await prisma.user.update({ where: { id: staff.id }, data: { phoneNumber: staffPhone } });
    expect(await request(staffPhone)).toEqual({ created: false });
    expect(await prisma.passwordResetRequest.count({ where: { userId: staff.id } })).toBe(0);

    const { userId, phone } = await customer();
    await request(phone);
    const [req] = await pendingOf(userId);
    await prisma.user.update({ where: { id: userId }, data: { active: false } });
    await decidePasswordReset(req.id, true, admin);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).active).toBe(false);
  });

  it("tài khoản chưa có mật khẩu (credential): xác nhận tạo mới; danh sách + số đếm chỉ tính yêu cầu còn hạn", async () => {
    const admin = await actor();
    const { userId, phone } = await customer();
    await prisma.account.deleteMany({ where: { userId, providerId: "credential" } });
    const countBefore = await pendingPasswordResetCount();
    await request(phone);
    expect(await pendingPasswordResetCount()).toBe(countBefore + 1);
    const list = await listPasswordResetRequests();
    const row = list.find((r) => r.userId === userId)!;
    expect(row).toMatchObject({ phone, name: "Ma Quen", active: true, orders: 0 });
    expect(JSON.stringify(row)).not.toContain("passwordHash");
    await decidePasswordReset(row.id, true, admin);
    await expect(signIn(phone, NEW)).resolves.toBeTruthy();
    expect(await pendingPasswordResetCount()).toBe(countBefore);
  });
});
