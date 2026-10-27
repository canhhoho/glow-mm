import { expect, test } from "@playwright/test";

// P12: chưa đăng nhập → proxy chuyển ngay (307) về trang đăng nhập, không render trang trắng rồi mới chuyển.

test("admin / cổng CTV chưa đăng nhập → 307 về trang đăng nhập; trang công khai giữ nguyên", async ({ request }) => {
  for (const [path, login] of [
    ["/admin", "/admin/login"],
    ["/admin/orders", "/admin/login"],
    ["/ctv", "/ctv/login"],
    ["/ctv/team", "/ctv/login"],
  ]) {
    const res = await request.get(path, { maxRedirects: 0 });
    expect(res.status(), path).toBe(307);
    expect(new URL(res.headers().location, "http://x").pathname, path).toBe(login);
  }
  for (const path of ["/admin/login", "/ctv/login", "/ctv/join?inv=MAUNG"]) {
    expect((await request.get(path, { maxRedirects: 0 })).status(), path).toBe(200);
  }
});
