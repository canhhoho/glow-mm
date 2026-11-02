import { describe, expect, it } from "vitest";
import { customerLoginRedirectFor, loginRedirectFor } from "@/server/auth/session-cookie";

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

describe("Khu tài khoản khách ở proxy (P14)", () => {
  it("chưa có cookie phiên khách → login cùng ngôn ngữ, giữ đường dẫn + query trong ?next", () => {
    expect(customerLoginRedirectFor("/account", "", [])).toBe("/login?next=%2Faccount");
    expect(customerLoginRedirectFor("/en/account/addresses", "?edit=1", ["better-auth.session_token"])).toBe(
      "/en/login?next=%2Fen%2Faccount%2Faddresses%3Fedit%3D1",
    );
    expect(customerLoginRedirectFor("/checkout", "", ["glow_ref"])).toBe("/login?next=%2Fcheckout");
    expect(customerLoginRedirectFor("/en/checkout", "", [])).toBe("/en/login?next=%2Fen%2Fcheckout");
    expect(customerLoginRedirectFor("/vi/checkout", "", [])).toBe("/vi/login?next=%2Fvi%2Fcheckout");
  });

  it("đã có cookie khách / trang khác → không chuyển", () => {
    expect(customerLoginRedirectFor("/account", "", ["glow-customer.session_token"])).toBeNull();
    expect(customerLoginRedirectFor("/en/account", "", ["__Secure-glow-customer.session_token"])).toBeNull();
    expect(customerLoginRedirectFor("/login", "", [])).toBeNull();
    expect(customerLoginRedirectFor("/accounts", "", [])).toBeNull();
    expect(customerLoginRedirectFor("/en/cart", "", [])).toBeNull();
    expect(customerLoginRedirectFor("/en/checkouts", "", [])).toBeNull();
  });
});
