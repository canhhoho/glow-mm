import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { listCustomerAccounts, resetCustomerPassword, setCustomerActive } from "@/server/accounts/admin";
import { consumeRateLimit, registerPhoneCustomer } from "@/server/accounts/phone";
import { customerAuth } from "@/server/auth/customer-auth";
import { hitRateLimit } from "@/server/rate-limit";
import { createStaff } from "@/server/users/users";

const PASSWORD = "it-phone-pass-1";
/** SĐT ngẫu nhiên hợp lệ 09 + 9 chữ số (không đụng nhau giữa các lần chạy). */
const randomPhone = () => `09${(100_000_000 + (randomBytes(4).readUInt32BE() % 900_000_000)).toString()}`;
const signIn = (phoneNumber: string, password = PASSWORD) => customerAuth.api.signInPhoneNumber({ body: { phoneNumber, password } });

async function actor() {
  const u = await prisma.user.upsert({
    where: { email: "it-runner@glow.local" },
    update: {},
    create: { id: "it-runner", email: "it-runner@glow.local", name: "IT", role: "ADMIN" },
  });
  return u.id;
}

async function phoneCustomer() {
  const phone = randomPhone();
  return registerPhoneCustomer({ name: "Ma Phone", phone, password: PASSWORD, confirmPassword: PASSWORD }, { ip: `it-${phone}` });
}

describe("Tài khoản khách bằng SĐT + mật khẩu (P17)", () => {
  it("đăng ký: chuẩn hoá SĐT (+95, chữ số Myanmar), role CUSTOMER, email nội bộ; trùng SĐT bị từ chối", async () => {
    const phone = randomPhone();
    const mm = phone.replace(/\d/g, (d) => "၀၁၂၃၄၅၆၇၈၉"[Number(d)]);
    const { userId, phone: saved } = await registerPhoneCustomer(
      { name: "Ma Hla", phone: `+95 ${mm.slice(1)}`, password: PASSWORD, confirmPassword: PASSWORD },
      { ip: `it-a-${phone}` },
    );
    expect(saved).toBe(phone);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: userId } })).toMatchObject({
      role: "CUSTOMER",
      phoneNumber: phone,
      phoneNumberVerified: false,
      email: `${phone}@phone.glow.invalid`,
    });
    await expect(
      registerPhoneCustomer({ name: "X", phone, password: PASSWORD, confirmPassword: PASSWORD }, { ip: `it-b-${phone}` }),
    ).rejects.toMatchObject({ code: "phone_taken" });
    await expect(
      registerPhoneCustomer({ name: "X", phone: "12345", password: PASSWORD, confirmPassword: PASSWORD }, { ip: "it-c" }),
    ).rejects.toMatchObject({ code: "invalid_phone" });
    await expect(
      registerPhoneCustomer({ name: "X", phone: randomPhone(), password: PASSWORD, confirmPassword: "khac-nhau-1" }, { ip: "it-d" }),
    ).rejects.toThrow();
  });

  it("đăng nhập SĐT + mật khẩu; sai mật khẩu bị từ chối; SĐT client gửi kèm khi đăng ký email bị bỏ", async () => {
    const { phone } = await phoneCustomer();
    expect((await signIn(phone)).token).toBeTruthy();
    await expect(signIn(phone, "sai-mat-khau-1")).rejects.toMatchObject({ body: { code: "INVALID_PHONE_NUMBER_OR_PASSWORD" } });

    const other = randomPhone();
    const email = `it-email-${randomBytes(3).toString("hex")}@glow.local`;
    await customerAuth.api.signUpEmail({ body: { name: "Ma E", email, password: PASSWORD, phoneNumber: other } as never }).catch(() => {});
    const created = await prisma.user.findUnique({ where: { email } });
    expect(created?.phoneNumber ?? null).toBeNull();
  });

  it("admin đặt lại mật khẩu: mật khẩu cũ hết hiệu lực, phiên cũ bị xoá; khoá → không đăng nhập được", async () => {
    const actorId = await actor();
    const { userId, phone } = await phoneCustomer();
    await signIn(phone);
    expect(await prisma.session.count({ where: { userId } })).toBe(1);

    await resetCustomerPassword(userId, "tam-thoi-123", actorId);
    expect(await prisma.session.count({ where: { userId } })).toBe(0);
    await expect(signIn(phone)).rejects.toBeTruthy();
    expect((await signIn(phone, "tam-thoi-123")).token).toBeTruthy();
    await expect(resetCustomerPassword(userId, "ngan", actorId)).rejects.toThrow();

    await setCustomerActive(userId, false, actorId);
    expect(await prisma.session.count({ where: { userId } })).toBe(0);
    await expect(signIn(phone, "tam-thoi-123")).rejects.toMatchObject({ body: { code: "USER_INACTIVE" } });
    await setCustomerActive(userId, true, actorId);
    expect((await signIn(phone, "tam-thoi-123")).token).toBeTruthy();
    expect(await prisma.auditLog.count({ where: { entityId: userId, action: { startsWith: "customer." } } })).toBe(3);

    expect((await listCustomerAccounts(phone)).map((a) => a.id)).toEqual([userId]);
  });

  it("chỉ quản trị tài khoản khách: nhân viên / tài khoản Google không có mật khẩu bị từ chối", async () => {
    const actorId = await actor();
    const staff = await createStaff(
      { name: "Ko Staff", email: `it-staff-${randomBytes(3).toString("hex")}@glow.local`, role: "ORDER_STAFF", password: "it-staff-password-1" },
      actorId,
    );
    await expect(resetCustomerPassword(staff.id, "tam-thoi-123", actorId)).rejects.toMatchObject({ code: "not_found" });
    await expect(setCustomerActive(staff.id, false, actorId)).rejects.toMatchObject({ code: "not_found" });

    const google = await prisma.user.create({
      data: { id: `it-g-${randomBytes(3).toString("hex")}`, email: `it-g-${randomBytes(3).toString("hex")}@gmail.test`, name: "G", role: "CUSTOMER" },
    });
    await expect(resetCustomerPassword(google.id, "tam-thoi-123", actorId)).rejects.toMatchObject({ code: "no_password" });
  });

  it("giới hạn tần suất: vượt số lần trong cửa sổ → too_many", async () => {
    const key = `it-limit:${randomBytes(3).toString("hex")}`;
    const now = new Date();
    await consumeRateLimit(key, 2, 60_000, now);
    await consumeRateLimit(key, 2, 60_000, now);
    await expect(consumeRateLimit(key, 2, 60_000, now)).rejects.toMatchObject({ code: "too_many" });
    await consumeRateLimit(key, 2, 60_000, new Date(now.getTime() + 61_000)); // sang cửa sổ mới
  });

  it("giới hạn tần suất nguyên tử: 10 request song song, max 3 → đúng 3 lượt qua (P19)", async () => {
    const key = `it-race:${randomBytes(3).toString("hex")}`;
    const now = new Date();
    const results = await Promise.all(Array.from({ length: 10 }, () => hitRateLimit(key, 3, 60_000, now)));
    expect(results.filter(Boolean)).toHaveLength(3);
    await prisma.rateLimit.delete({ where: { key } });
  });
});
