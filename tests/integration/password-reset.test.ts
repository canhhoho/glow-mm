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

/** Bản ghi đổi tự động chưa được admin xem (decidedById = null). */
const unreviewedOf = (userId: string) => prisma.passwordResetRequest.findMany({ where: { userId, status: "APPROVED", decidedById: null } });

describe("Khách quên mật khẩu qua SĐT → đổi ngay, admin theo dõi (audit 12, gói D3)", () => {
  it("đổi ngay: mật khẩu mới dùng được, cũ hết dùng, mọi phiên bị thu hồi, không lưu hash, có audit", async () => {
    const { userId, phone } = await customer();
    await signIn(phone, OLD); // tạo một phiên cũ
    expect(await prisma.session.count({ where: { userId } })).toBeGreaterThan(0);

    expect(await request(phone)).toEqual({ created: true });
    expect(await prisma.session.count({ where: { userId } })).toBe(0);

    await expect(signIn(phone, NEW)).resolves.toBeTruthy();
    await expect(signIn(phone, OLD)).rejects.toBeTruthy();

    const [rec] = await unreviewedOf(userId);
    expect(rec).toMatchObject({ status: "APPROVED", passwordHash: null, decidedById: null, phone });
    expect(rec.expiresAt.getTime() - rec.createdAt.getTime()).toBe(RESET_TTL_DAYS * 86_400_000);
    expect(await prisma.auditLog.count({ where: { entityId: userId, action: "customer.passwordReset.auto" } })).toBe(1);
  });

  it("admin bấm 'Đã kiểm tra': ghi người xem, rời danh sách theo dõi, có audit; không xem lại lần hai được", async () => {
    const admin = await actor();
    const { userId, phone } = await customer();
    await request(phone);
    const [rec] = await unreviewedOf(userId);
    const countBefore = await pendingPasswordResetCount();

    await decidePasswordReset(rec.id, true, admin);
    const done = await prisma.passwordResetRequest.findUniqueOrThrow({ where: { id: rec.id } });
    expect(done).toMatchObject({ status: "APPROVED", passwordHash: null, decidedById: admin });
    expect(await pendingPasswordResetCount()).toBe(countBefore - 1);
    expect((await listPasswordResetRequests()).some((r) => r.id === rec.id)).toBe(false);
    expect(await prisma.auditLog.count({ where: { entityId: userId, action: "customer.passwordReset.approve", userId: admin } })).toBe(1);
    // Đã kiểm tra không làm đổi mật khẩu lần nữa
    await expect(signIn(phone, NEW)).resolves.toBeTruthy();
  });

  it("SĐT chưa đăng ký: không tạo gì, kết quả không lộ; SĐT sai định dạng / mật khẩu ngắn / không khớp → lỗi", async () => {
    const before = await prisma.passwordResetRequest.count();
    expect(await request(randomPhone())).toEqual({ created: false });
    expect(await prisma.passwordResetRequest.count()).toBe(before);
    await expect(request("12345")).rejects.toMatchObject({ code: "invalid_phone" });
    await expect(requestPasswordReset({ phone: randomPhone(), password: "short", confirmPassword: "short" }, { ip: ip() })).rejects.toThrow();
    await expect(requestPasswordReset({ phone: randomPhone(), password: NEW, confirmPassword: "khac" }, { ip: ip() })).rejects.toThrow();
  });

  it("đổi nhiều lần (kể cả đồng thời): bản cũ chưa xem → SUPERSEDED, chỉ còn một bản theo dõi", async () => {
    const { userId, phone } = await customer();
    await request(phone, "it-first-pass-1");
    const [first] = await unreviewedOf(userId);
    await Promise.all([request(phone, "it-second-pass-2"), request(phone, "it-third-pass-3")]);
    expect(await unreviewedOf(userId)).toHaveLength(1);
    expect(await prisma.passwordResetRequest.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject({ status: "SUPERSEDED", passwordHash: null });
    const all = await prisma.passwordResetRequest.findMany({ where: { userId } });
    expect(all.filter((r) => r.status === "SUPERSEDED")).toHaveLength(2);
  });

  it("bản đổi quá 7 ngày không còn trong danh sách theo dõi / số đếm", async () => {
    const { userId, phone } = await customer();
    const longAgo = new Date(Date.now() - (RESET_TTL_DAYS + 1) * 86_400_000);
    await request(phone, NEW, { now: longAgo });
    const [rec] = await unreviewedOf(userId);
    expect((await listPasswordResetRequests()).some((r) => r.id === rec.id)).toBe(false);
    // Mật khẩu vẫn đã đổi (đổi ngay lúc yêu cầu)
    await expect(signIn(phone, NEW)).resolves.toBeTruthy();
  });

  it("yêu cầu PENDING kiểu cũ (trước D3): admin xác nhận vẫn áp mật khẩu; cron đóng bản PENDING quá hạn", async () => {
    const admin = await actor();
    const { userId, phone } = await customer();
    const { hashPassword } = await import("better-auth/crypto");
    const now = new Date();
    const legacy = await prisma.passwordResetRequest.create({
      data: { userId, phone, passwordHash: await hashPassword(NEW), status: "PENDING", createdAt: now, expiresAt: new Date(now.getTime() + RESET_TTL_DAYS * 86_400_000) },
    });
    await decidePasswordReset(legacy.id, true, admin);
    await expect(signIn(phone, NEW)).resolves.toBeTruthy();
    expect(await prisma.passwordResetRequest.findUniqueOrThrow({ where: { id: legacy.id } })).toMatchObject({ status: "APPROVED", passwordHash: null, decidedById: admin });

    const old = new Date(Date.now() - (RESET_TTL_DAYS + 1) * 86_400_000);
    const expired = await prisma.passwordResetRequest.create({
      data: { userId, phone, passwordHash: "x", status: "PENDING", createdAt: old, expiresAt: new Date(old.getTime() + RESET_TTL_DAYS * 86_400_000) },
    });
    expect(await expirePasswordResets()).toBeGreaterThanOrEqual(1);
    expect(await prisma.passwordResetRequest.findUniqueOrThrow({ where: { id: expired.id } })).toMatchObject({ status: "REJECTED", passwordHash: null, decidedById: null });
  });

  it("giới hạn tần suất: tối đa 3 lần / ngày / SĐT (kể cả SĐT chưa đăng ký) và 5 lần / giờ / IP", async () => {
    const phone = randomPhone();
    for (let i = 0; i < 3; i++) await request(phone);
    await expect(request(phone)).rejects.toMatchObject({ code: "too_many" });

    const sameIp = ip();
    for (let i = 0; i < 5; i++) await request(randomPhone(), NEW, { ip: sameIp });
    await expect(request(randomPhone(), NEW, { ip: sameIp })).rejects.toMatchObject({ code: "too_many" });
  });

  it("không đổi được mật khẩu nhân viên / CTV qua luồng này; tài khoản bị khoá vẫn bị khoá sau khi đổi", async () => {
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
    await prisma.user.update({ where: { id: userId }, data: { active: false } });
    await request(phone);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).active).toBe(false);
  });

  it("tài khoản chưa có credential: đổi ngay tạo mới; danh sách theo dõi có thông tin khách, không lộ hash", async () => {
    const { userId, phone } = await customer();
    await prisma.account.deleteMany({ where: { userId, providerId: "credential" } });
    const countBefore = await pendingPasswordResetCount();
    await request(phone);
    await expect(signIn(phone, NEW)).resolves.toBeTruthy();
    expect(await pendingPasswordResetCount()).toBe(countBefore + 1);
    const row = (await listPasswordResetRequests()).find((r) => r.userId === userId)!;
    expect(row).toMatchObject({ phone, name: "Ma Quen", active: true, orders: 0 });
    expect(JSON.stringify(row)).not.toContain("passwordHash");
  });
});
