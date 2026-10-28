import { randomBytes } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { claimOrders } from "@/server/accounts/claims";
import { auth } from "@/server/auth/auth";
import { customerAuth } from "@/server/auth/customer-auth";
import { createOrder } from "@/server/orders/orders";
import { createAffiliate } from "@/server/affiliates/affiliates";
import { createStaff } from "@/server/users/users";
import { orderInput, saleFixture, unpublishTestProducts } from "./fixtures";

afterAll(unpublishTestProducts);

const PASSWORD = "it-customer-pass-1";
const tag = () => randomBytes(4).toString("hex");
const OUTBOX = path.resolve(process.env.EMAIL_OUTBOX_DIR ?? "./storage-test/outbox");

/** Email mới nhất gửi tới `to` (EMAIL_DRIVER=outbox trong .env.test). */
async function lastEmail(to: string) {
  const files = (await readdir(OUTBOX).catch(() => [] as string[])).filter((f) => f.endsWith(`-${to}.json`)).sort();
  if (!files.length) return null;
  return JSON.parse(await readFile(path.join(OUTBOX, files.at(-1)!), "utf8")) as { subject: string; text: string };
}

const tokenIn = (text: string) => new URL(text.match(/https?:\/\/\S+/)![0]).searchParams.get("token") ?? text.match(/reset-password\/([^?\s]+)/)?.[1];

async function itActor() {
  const u = await prisma.user.upsert({
    where: { email: "it-runner@glow.local" },
    update: {},
    create: { id: "it-runner", email: "it-runner@glow.local", name: "IT", role: "ADMIN" },
  });
  return u.id;
}

/** Khách đã đăng ký + xác minh email. */
async function verifiedCustomer() {
  const email = `it-khach-${tag()}@glow.local`;
  await customerAuth.api.signUpEmail({ body: { name: "Ma Hla", email, password: PASSWORD, callbackURL: "/login" } });
  await prisma.user.update({ where: { email }, data: { emailVerified: true } });
  return prisma.user.findUniqueOrThrow({ where: { email } });
}

describe("Tài khoản khách (P14)", () => {
  it("đăng ký: luôn là CUSTOMER dù client gửi role; chưa xác minh không đăng nhập được; xác minh xong thì được", async () => {
    const email = `it-khach-${tag()}@glow.local`;
    await expect(
      customerAuth.api.signUpEmail({ body: { name: "Ma Hla", email, password: PASSWORD, role: "ADMIN" } as never }),
    ).rejects.toThrow(/role is not allowed/);
    await customerAuth.api.signUpEmail({ body: { name: "Ma Hla", email, password: PASSWORD, callbackURL: "/en/login" } });
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user).toMatchObject({ role: "CUSTOMER", emailVerified: false, active: true, locale: "en" });

    await expect(customerAuth.api.signInEmail({ body: { email, password: PASSWORD } })).rejects.toMatchObject({
      body: { code: "EMAIL_NOT_VERIFIED" },
    });

    const mail = await lastEmail(email);
    expect(mail?.subject).toContain("confirm your email");
    expect(mail!.text).toContain("/api/customer-auth/verify-email?token=");
    await customerAuth.api.verifyEmail({ query: { token: tokenIn(mail!.text)! } });
    expect((await prisma.user.findUniqueOrThrow({ where: { email } })).emailVerified).toBe(true);
    expect((await customerAuth.api.signInEmail({ body: { email, password: PASSWORD } })).token).toBeTruthy();
  });

  it("khách không đăng nhập được cổng nhân viên/CTV; nhân viên không đăng nhập được ở instance khách", async () => {
    const customer = await verifiedCustomer();
    await expect(auth.api.signInEmail({ body: { email: customer.email, password: PASSWORD } })).rejects.toMatchObject({
      body: { code: "NOT_STAFF" },
    });

    const staffEmail = `it-staff-${tag()}@glow.local`;
    const staff = await createStaff({ name: "Ko Staff", email: staffEmail, role: "ORDER_STAFF", password: "it-staff-password-1" }, await itActor());
    const staffSignIn = () => customerAuth.api.signInEmail({ body: { email: staffEmail, password: "it-staff-password-1" } });
    // Nhân viên chưa xác minh email: bị chặn ở bước xác minh và KHÔNG nhận email xác minh từ instance khách.
    await expect(staffSignIn()).rejects.toMatchObject({ body: { code: "EMAIL_NOT_VERIFIED" } });
    expect(await lastEmail(staffEmail)).toBeNull();
    // Đã xác minh (như tài khoản seed): bị chặn ở hook phiên.
    await prisma.user.update({ where: { id: staff.id }, data: { emailVerified: true } });
    await expect(staffSignIn()).rejects.toMatchObject({ body: { code: "NOT_CUSTOMER" } });
    expect(await prisma.session.count({ where: { userId: staff.id } })).toBe(0);

    // Không gửi link đặt lại mật khẩu / xác minh cho tài khoản nhân viên.
    await customerAuth.api.requestPasswordReset({ body: { email: staffEmail, redirectTo: "/reset-password" } });
    expect(await lastEmail(staffEmail)).toBeNull();
  });

  it("Google không liên kết được vào tài khoản nhân viên (validateUserInfo)", async () => {
    const staffEmail = `it-staff-${tag()}@glow.local`;
    const staff = await createStaff({ name: "Ko Staff", email: staffEmail, role: "ADMIN", password: "it-staff-password-1" }, await itActor());
    const customer = await verifiedCustomer();
    const validate = customerAuth.options.user!.validateUserInfo!;
    const source = { action: "link-account" as const, method: "oauth", oauth: { providerId: "google" } };
    expect(await validate({ user: { id: staff.id, email: staffEmail }, source })).toEqual({ error: "NOT_CUSTOMER" });
    expect(await validate({ user: { id: customer.id, email: customer.email }, source })).toBeUndefined();
  });

  it("CTV đăng nhập storefront bằng chính tài khoản CTV (P16): email đã xác minh, Google liên kết được", async () => {
    const t = tag();
    const a = await createAffiliate(
      { name: "Ko CTV", phone: "09 7812 3456", commissionPercent: "10", password: "it-ctv-password-1", email: `it-ctv-shop-${t}@glow.local`, code: `S${t}`.slice(0, 10) },
      await itActor(),
    );
    const user = await prisma.user.findUniqueOrThrow({ where: { id: a!.userId } });
    expect(user).toMatchObject({ role: "AFFILIATE", emailVerified: true });
    expect((await customerAuth.api.signInEmail({ body: { email: user.email, password: "it-ctv-password-1" } })).token).toBeTruthy();
    const validate = customerAuth.options.user!.validateUserInfo!;
    const source = { action: "link-account" as const, method: "oauth", oauth: { providerId: "google" } };
    expect(await validate({ user: { id: user.id, email: user.email }, source })).toBeUndefined();
    // Tài khoản CTV bị khoá → không đăng nhập storefront được.
    await prisma.user.update({ where: { id: user.id }, data: { active: false } });
    await expect(customerAuth.api.signInEmail({ body: { email: user.email, password: "it-ctv-password-1" } })).rejects.toMatchObject({
      body: { code: "USER_INACTIVE" },
    });
  });

  it("quên mật khẩu: gửi link, đặt lại được, mật khẩu cũ hết hiệu lực", async () => {
    const customer = await verifiedCustomer();
    await customerAuth.api.requestPasswordReset({ body: { email: customer.email, redirectTo: "/reset-password" } });
    const mail = await lastEmail(customer.email);
    expect(mail?.text).toContain("/api/customer-auth/reset-password/");
    await customerAuth.api.resetPassword({ body: { newPassword: "it-new-pass-22", token: tokenIn(mail!.text)! } });
    await expect(customerAuth.api.signInEmail({ body: { email: customer.email, password: PASSWORD } })).rejects.toBeTruthy();
    expect((await customerAuth.api.signInEmail({ body: { email: customer.email, password: "it-new-pass-22" } })).token).toBeTruthy();
  });

  it("nhận đơn cũ: chỉ đơn khớp mã + SĐT và chưa thuộc tài khoản nào", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 5 }]);
    const mine = await createOrder(orderInput(f, 1), { userId: null });
    const other = await createOrder(orderInput(f, 1, { phone: "09 7812 9999" }), { userId: null });
    const a = await verifiedCustomer();
    const b = await verifiedCustomer();

    // Sai SĐT → không nhận; đúng → nhận; tài khoản khác nhận lại → không được.
    expect(await claimOrders(a.id, [{ c: other.code, p: "09 7812 3456" }])).toBe(0);
    expect(await claimOrders(a.id, [{ c: mine.code.toLowerCase(), p: "+95 9 7812 3456" }])).toBe(1);
    expect(await claimOrders(b.id, [{ c: mine.code, p: "09 7812 3456" }])).toBe(0);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: mine.id } })).accountId).toBe(a.id);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: other.id } })).accountId).toBeNull();
    expect(await prisma.auditLog.count({ where: { action: "order.claim", entityId: mine.id } })).toBe(1);
  });
});
