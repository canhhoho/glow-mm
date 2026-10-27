import { mkdtemp, readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { authEmail, emailLocale } from "@/server/accounts/emails";
import { OutboxEmail } from "@/server/adapters/email/outbox";
import {
  customerIdentityDecision,
  customerSessionDecision,
  decodeCookieValue,
  deriveCustomerSecret,
  localeFromCallback,
  NOT_CUSTOMER,
  safeNextPath,
  staffSessionDecision,
} from "@/server/auth/customer-policy";
import { portalAllowsRole } from "@/server/auth/roles";

describe("Tách phiên khách / nhân viên (P14)", () => {
  it("instance nhân viên: chỉ nhân viên + CTV; khách bị từ chối; bị khoá → inactive", () => {
    for (const role of ["ADMIN", "WAREHOUSE_MANAGER", "ORDER_STAFF", "AFFILIATE"]) {
      expect(staffSessionDecision({ role, active: true })).toBe("ok");
      expect(staffSessionDecision({ role, active: false })).toBe("inactive");
    }
    expect(staffSessionDecision({ role: "CUSTOMER", active: true })).toBe("forbidden");
    expect(staffSessionDecision(null)).toBe("forbidden");
  });

  it("instance khách: chỉ CUSTOMER; khách bị khoá → inactive", () => {
    expect(customerSessionDecision({ role: "CUSTOMER", active: true })).toBe("ok");
    expect(customerSessionDecision({ role: "CUSTOMER", active: false })).toBe("inactive");
    for (const role of ["ADMIN", "ORDER_STAFF", "AFFILIATE"]) {
      expect(customerSessionDecision({ role, active: true })).toBe("forbidden");
    }
    expect(customerSessionDecision(undefined)).toBe("forbidden");
  });

  it("Google: tạo user mới được; liên kết / đăng nhập vào user không phải khách bị chặn", () => {
    expect(customerIdentityDecision("create-user", null)).toBeUndefined();
    expect(customerIdentityDecision("link-account", "CUSTOMER")).toBeUndefined();
    expect(customerIdentityDecision("sign-in", "CUSTOMER")).toBeUndefined();
    expect(customerIdentityDecision("link-account", "ADMIN")).toEqual({ error: NOT_CUSTOMER });
    expect(customerIdentityDecision("sign-in", "AFFILIATE")).toEqual({ error: NOT_CUSTOMER });
    expect(customerIdentityDecision("link-account", null)).toEqual({ error: NOT_CUSTOMER });
  });

  it("form đăng nhập: allow-list theo cổng", () => {
    expect(portalAllowsRole("admin", "ADMIN")).toBe(true);
    expect(portalAllowsRole("admin", "AFFILIATE")).toBe(false);
    expect(portalAllowsRole("admin", "CUSTOMER")).toBe(false);
    expect(portalAllowsRole("ctv", "AFFILIATE")).toBe(true);
    expect(portalAllowsRole("ctv", "ORDER_STAFF")).toBe(false);
    expect(portalAllowsRole("ctv", "CUSTOMER")).toBe(false);
  });

  it("secret khách suy ra ổn định, khác secret gốc", () => {
    const s = "x".repeat(32);
    expect(deriveCustomerSecret(s)).toBe(deriveCustomerSecret(s));
    expect(deriveCustomerSecret(s)).not.toBe(s);
    expect(deriveCustomerSecret(s)).not.toBe(deriveCustomerSecret("y".repeat(32)));
  });

  it("ngôn ngữ từ callbackURL; ?next chỉ nhận đường dẫn nội bộ; giải mã cookie", () => {
    expect(localeFromCallback("/en/login")).toBe("en");
    expect(localeFromCallback("http://localhost:3000/en")).toBe("en");
    expect(localeFromCallback("/login")).toBe("my");
    expect(localeFromCallback("/english")).toBe("my");
    expect(localeFromCallback(undefined)).toBe("my");

    expect(safeNextPath("/checkout")).toBe("/checkout");
    expect(safeNextPath("//evil.com")).toBe("/account");
    expect(safeNextPath("https://evil.com")).toBe("/account");
    expect(safeNextPath("/\\evil.com")).toBe("/account");
    expect(safeNextPath(undefined, "/")).toBe("/");

    expect(decodeCookieValue(encodeURIComponent('[{"c":"OD-1","p":"09"}]'))).toBe('[{"c":"OD-1","p":"09"}]');
    expect(decodeCookieValue('[{"c":"OD-1"}]')).toBe('[{"c":"OD-1"}]');
    expect(decodeCookieValue(undefined)).toBeNull();
  });
});

describe("Email tài khoản khách (P14)", () => {
  it("theo ngôn ngữ khách (mặc định my), escape HTML, có link", () => {
    expect(emailLocale("en")).toBe("en");
    expect(emailLocale("vi")).toBe("my");
    const en = authEmail("reset", { email: "a@x.test", name: "<b>Ann</b>", locale: "en" }, "https://shop.test/reset?t=1&x=2");
    expect(en.subject).toContain("reset your password");
    expect(en.html).toContain("&lt;b&gt;Ann&lt;/b&gt;");
    expect(en.html).toContain("https://shop.test/reset?t=1&amp;x=2");
    expect(en.text).toContain("https://shop.test/reset?t=1&x=2");
    const my = authEmail("verify", { email: "a@x.test", name: "Ma Hla", locale: null }, "https://shop.test/v");
    expect(my.subject).toContain("အီးမေးလ်");
    expect(my.to).toBe("a@x.test");
  });

  it("outbox ghi file JSON đọc lại được", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "outbox-"));
    await new OutboxEmail(dir).send({ to: "Khach@X.test", subject: "S", html: "<p>h</p>", text: "t" });
    const files = await readdir(dir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/khach@x\.test\.json$/);
    expect(JSON.parse(await readFile(path.join(dir, files[0]), "utf8"))).toMatchObject({ to: "Khach@X.test", subject: "S" });
  });
});
