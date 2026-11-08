import { describe, expect, it } from "vitest";
import { isPlaceholderSecret, isProductionUrl } from "@/lib/env";
import { isSafeInternalPath } from "@/lib/safe-path";
import { loginIdentifier, weakStaffPassword } from "@/server/auth/login-policy";

describe("Vá bảo mật 08/11 — hàm thuần", () => {
  it("đường dẫn nội bộ: chặn mọi biến thể đi ra ngoài web", () => {
    for (const ok of ["/", "/checkout", "/en/p/son-moi?x=1#top", "/account/orders"]) expect(isSafeInternalPath(ok), ok).toBe(true);
    for (const bad of ["//evil.com", "/\\evil.com", "/\t/evil.com", "/\n/evil.com", "/ /x", "https://evil.com", "evil", "", null, 1]) {
      expect(isSafeInternalPath(bad), String(bad)).toBe(false);
    }
  });

  it("định danh đăng nhập: SĐT và email nội bộ của SĐT dùng chung một bộ đếm; path khác bỏ qua", () => {
    const phone = loginIdentifier("/sign-in/phone-number", { phoneNumber: " 09123456789 " });
    expect(phone).toMatch(/^phone:/);
    expect(loginIdentifier("/sign-in/email", { email: `${phone!.slice(6)}@phone.glow.invalid` })).toBe(phone);
    expect(loginIdentifier("/sign-in/email", { email: " Admin@Glow.Local " })).toBe("email:admin@glow.local");
    expect(loginIdentifier("/sign-in/email", {})).toBeNull();
    expect(loginIdentifier("/sign-up/email", { email: "a@b.c" })).toBeNull();
    expect(loginIdentifier("/get-session", undefined)).toBeNull();
  });

  it("mật khẩu nhân viên đổi qua API phải đủ 12 ký tự", () => {
    expect(weakStaffPassword("/change-password", { newPassword: "12345678" })).toBe(true);
    expect(weakStaffPassword("/reset-password", { newPassword: "short-pass" })).toBe(true);
    expect(weakStaffPassword("/change-password", { newPassword: "du-12-ky-tu-roi" })).toBe(false);
    expect(weakStaffPassword("/sign-in/email", { newPassword: "x" })).toBe(false);
  });

  it("env production: từ chối khoá mẫu và APP_URL http (trừ localhost)", () => {
    expect(isPlaceholderSecret("change-me-to-a-random-32-char-secret-value")).toBe(true);
    expect(isPlaceholderSecret("change-me-cron-secret")).toBe(true);
    expect(isPlaceholderSecret("Zq3v0m3tH1ngRand0m+base64==")).toBe(false);
    expect(isProductionUrl("https://tandcstore.com")).toBe(true);
    expect(isProductionUrl("http://localhost:3100")).toBe(true);
    expect(isProductionUrl("http://tandcstore.com")).toBe(false);
  });
});
