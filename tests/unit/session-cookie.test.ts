import { describe, expect, it } from "vitest";
import { loginRedirectFor } from "@/server/auth/session-cookie";

describe("Chuyển về trang đăng nhập ở proxy (P12)", () => {
  it("admin / cổng CTV chưa có cookie phiên → trang đăng nhập tương ứng", () => {
    expect(loginRedirectFor("/admin", [])).toBe("/admin/login");
    expect(loginRedirectFor("/admin/orders/x", ["glow_ref"])).toBe("/admin/login");
    expect(loginRedirectFor("/ctv", [])).toBe("/ctv/login");
    expect(loginRedirectFor("/ctv/team", [])).toBe("/ctv/login");
  });

  it("đã có cookie phiên (http hoặc https) → để trang tự kiểm quyền", () => {
    expect(loginRedirectFor("/admin", ["better-auth.session_token"])).toBeNull();
    expect(loginRedirectFor("/ctv/orders", ["__Secure-better-auth.session_token"])).toBeNull();
  });

  it("trang công khai và ngoài khu vực → không chuyển", () => {
    expect(loginRedirectFor("/admin/login", [])).toBeNull();
    expect(loginRedirectFor("/ctv/login", [])).toBeNull();
    expect(loginRedirectFor("/ctv/join", [])).toBeNull();
    expect(loginRedirectFor("/", [])).toBeNull();
    expect(loginRedirectFor("/en/cart", [])).toBeNull();
    expect(loginRedirectFor("/adminx", [])).toBeNull();
  });
});
