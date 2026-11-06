import { expect, test, type Page } from "@playwright/test";
import { loginCtv, login, loginCustomer, PASSWORD } from "./helpers";

// P21: Content-Security-Policy. Storefront: 'unsafe-inline' (static shell không có nonce). Admin/CTV: nonce mỗi
// request + 'strict-dynamic'. Đi qua các trang chính, ghi mọi vi phạm CSP — phải là 0 (trang vẫn chạy đủ JS).

const PRODUCT = "/en/p/sen-viet-sunscreen-spf50";

/** Ghi vi phạm CSP (sự kiện trình duyệt + lỗi console) cho cả trang; trả hàm đọc danh sách. */
function watchCsp(page: Page) {
  const seen: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && /Content Security Policy/i.test(m.text())) seen.push(`console: ${m.text()}`);
  });
  void page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      // In ra console để listener phía Playwright bắt được (kể cả khi trang đã điều hướng).
      console.error(`Content Security Policy violation: ${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  return () => seen;
}

async function visit(page: Page, path: string) {
  const res = await page.goto(path);
  expect(res?.status(), path).toBeLessThan(400);
  await page.waitForLoadState("networkidle");
  return res!;
}

test("storefront: CSP 'unsafe-inline', không vi phạm trên các trang chính", async ({ page }) => {
  test.setTimeout(120_000);
  const violations = watchCsp(page);

  const home = await visit(page, "/en");
  const csp = home.headers()["content-security-policy"];
  expect(csp).toContain("script-src 'self' 'unsafe-inline'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).not.toContain("nonce-");

  for (const path of [PRODUCT, "/en/c/skincare", "/en/search?q=sun", "/en/cart", "/en/login", "/en/register", "/en/track", "/offline.html"]) {
    await visit(page, path);
  }
  // JS thật sự chạy: thêm vào giỏ (Server Action) từ trang SP.
  await visit(page, PRODUCT);
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByRole("link", { name: "Checkout" })).toBeVisible();

  // Khách đã đăng nhập: tài khoản + checkout.
  await loginCustomer(page, "khach@glow.local", PASSWORD);
  await page.waitForURL((u) => u.pathname === "/en/account");
  await visit(page, "/en/account");
  await visit(page, "/en/checkout");

  expect(violations()).toEqual([]);
});

test("admin + CTV: CSP nonce đổi mỗi request, script của Next có nonce, không vi phạm", async ({ page, request }) => {
  test.setTimeout(150_000);
  const violations = watchCsp(page);

  const a = (await request.get("/admin/login")).headers()["content-security-policy"];
  const b = (await request.get("/admin/login")).headers()["content-security-policy"];
  expect(a).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(a).not.toBe(b);
  const nonce = a.match(/'nonce-([^']+)'/)![1];
  expect(nonce.length).toBeGreaterThan(10);

  await login(page, "admin@glow.local"); // form đăng nhập (client component) chạy được dưới CSP nonce
  const html = await (await page.request.get("/admin")).text();
  expect(html).toMatch(/<script[^>]+nonce="[^"]+"/);

  for (const path of ["/admin", "/admin/orders", "/admin/products", "/admin/reports", "/admin/inventory", "/admin/settings"]) {
    await visit(page, path);
  }
  // Chi tiết đơn + trang in nhãn (<style> inline).
  await visit(page, "/admin/orders");
  const href = await page.locator('a[href^="/admin/orders/"]:not([href$="/new"])').first().getAttribute("href");
  await visit(page, href!);
  await visit(page, `${href}/label`);
  // Chi tiết SP có ảnh (next/image) + thao tác client (mở/đóng menu admin).
  await visit(page, "/admin/products?q=sen-viet-sunscreen-spf50");
  await page.getByRole("row", { name: /sen-viet-sunscreen-spf50/ }).getByRole("link", { name: /^Sửa / }).click();
  await page.waitForLoadState("networkidle");

  // Cổng CTV.
  await loginCtv(page);
  const ctv = await visit(page, "/ctv");
  expect(ctv.headers()["content-security-policy"]).toContain("'strict-dynamic'");
  await visit(page, "/ctv/orders");

  expect(violations()).toEqual([]);
});
