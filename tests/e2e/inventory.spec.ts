import { expect, test, type Page } from "@playwright/test";

const PASSWORD = process.env.SEED_STAFF_PASSWORD!;
const VARIANT = "SV-SUN-50 — Sunscreen SPF50 PA++++ (50ml)";

async function login(page: Page, email: string) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu").fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.getByTestId("role")).toBeVisible();
}

async function postAndExpect(page: Page) {
  await page.getByRole("button", { name: "Lưu nháp" }).click();
  await expect(page.getByText("Nháp", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Ghi sổ" }).click();
  await expect(page.getByText("Đã ghi sổ", { exact: true })).toBeVisible();
}

test("quản lý kho: nhận → chuyển → xuất, tồn khớp theo lô và vị trí", async ({ page }) => {
  const lot = `E2E${Date.now().toString(36).toUpperCase()}`;
  await login(page, "kho@glow.local");

  // 1) Nhập 10 vào kho VN
  await page.goto("/admin/inventory/documents/new?type=RECEIVE");
  await page.getByLabel("Chọn vị trí nhận").selectOption({ label: "VN-STOCK — Kho VN" });
  await page.getByLabel("Biến thể").selectOption({ label: VARIANT });
  await page.getByLabel("Số lô").fill(lot);
  await page.getByLabel("Hạn dùng").fill("2028-12-31");
  await page.getByLabel("Giá mua/đv (VND)").fill("90000");
  await page.getByLabel("Số lượng").fill("10");
  await postAndExpect(page);

  // 2) Chuyển 4 sang kho Yangon (chọn đúng lô vừa nhập)
  await page.goto("/admin/inventory/documents/new?type=TRANSFER");
  await page.getByLabel("Chọn vị trí xuất").selectOption({ label: "VN-STOCK — Kho VN" });
  await page.getByLabel("Chọn vị trí nhận").selectOption({ label: "MM-STOCK — Kho Yangon" });
  await page.getByLabel("Biến thể").selectOption({ label: VARIANT });
  await page.getByLabel("Lô").selectOption({ label: `${lot} · 2028-12-31 · 10` });
  await page.getByLabel("Số lượng").fill("4");
  await postAndExpect(page);

  // 3) Xuất 1 ở kho Yangon (hàng hỏng)
  await page.goto("/admin/inventory/documents/new?type=ISSUE");
  await page.getByLabel("Chọn vị trí xuất").selectOption({ label: "MM-STOCK — Kho Yangon" });
  await page.getByLabel("Lý do / ghi chú").fill("Hàng hỏng khi vận chuyển");
  await page.getByLabel("Biến thể").selectOption({ label: VARIANT });
  await page.getByLabel("Lô").selectOption({ label: `${lot} · 2028-12-31 · 4` });
  await page.getByLabel("Số lượng").fill("1");
  await postAndExpect(page);

  // 4) Tồn: VN còn 6, Yangon còn 3
  await page.goto(`/admin/inventory?q=${lot}`);
  const rows = page.getByRole("row").filter({ hasText: lot });
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: "VN-STOCK" })).toContainText("6");
  await expect(rows.filter({ hasText: "MM-STOCK" })).toContainText("3");
});

test("nhân viên đơn hàng không tạo được phiếu nhập kho", async ({ page }) => {
  await login(page, "donhang@glow.local");
  await page.goto("/admin/inventory/documents/new?type=RECEIVE");
  await expect(page).toHaveURL(/\/admin\?denied=1$/);
});
