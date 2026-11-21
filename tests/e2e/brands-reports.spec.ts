import { expect, test } from "@playwright/test";
import { login } from "./helpers";

// Đợt 3 audit (21/11/2026): khoảng ngày nhanh dùng chung, xuất Excel báo cáo bán hàng, trang Thương hiệu.
test("báo cáo bán hàng: nút khoảng nhanh đổi kỳ; Xuất Excel tải file .xlsx cùng kỳ", async ({ page }) => {
  await login(page, "admin@glow.local");
  await page.goto("/admin/reports");
  const presets = page.getByRole("navigation", { name: "Khoảng nhanh" });
  await presets.getByRole("link", { name: "7 ngày", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/reports\?from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}$/);
  await expect(presets.getByRole("link", { name: "7 ngày", exact: true })).toHaveAttribute("aria-current", "true");
  const from = new URL(page.url()).searchParams.get("from")!;
  await expect(page.getByLabel("Từ ngày")).toHaveValue(from);

  const href = await page.getByTestId("sales-export").getAttribute("href");
  expect(href).toContain(`from=${from}`);
  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("spreadsheetml");
  expect(res.headers()["content-disposition"]).toContain(`bao-cao-ban-hang-${from}`);
  expect((await res.body()).subarray(0, 2).toString()).toBe("PK");
});

test("đơn hàng: nút khoảng nhanh giữ bộ lọc khác", async ({ page }) => {
  await login(page, "admin@glow.local");
  await page.goto("/admin/orders?q=GL");
  await page.getByRole("navigation", { name: "Khoảng nhanh" }).getByRole("link", { name: "Tháng này", exact: true }).click();
  await expect(page).toHaveURL(/q=GL/);
  await expect(page).toHaveURL(/from=\d{4}-\d{2}-01/);
});

test("thương hiệu: đổi tên rồi gộp vào thương hiệu khác", async ({ page }) => {
  const tag = Date.now().toString(36).toUpperCase();
  await login(page, "admin@glow.local");
  // Tạo 2 SP với 2 thương hiệu mới (thương hiệu chỉ được tạo từ form SP / Excel).
  for (const brand of [`E2E Nivae ${tag}`, `E2E Nivea ${tag}`]) {
    await page.goto("/admin/products/new");
    const form = page.getByTestId("product-create-form");
    await form.getByRole("textbox", { name: "Tên sản phẩm", exact: true }).fill(`Kem ${brand}`);
    await form.getByRole("combobox", { name: "Thương hiệu", exact: true }).fill(brand);
    await form.getByRole("combobox", { name: "Danh mục", exact: true }).selectOption({ index: 1 });
    await form.getByRole("button", { name: "Tạo sản phẩm", exact: true }).click();
    await expect(page).toHaveURL(/\?created=1$/, { timeout: 15_000 });
  }

  await page.goto(`/admin/brands?q=${tag}`);
  const rows = page.getByTestId("brand-row");
  // Lọc theo ô tên (ô "Gộp vào" của dòng khác cũng chứa tên thương hiệu).
  const row = (name: string) => rows.filter({ has: page.getByTestId("brand-name").getByText(name, { exact: true }) });
  await expect(rows).toHaveCount(2);
  const typo = row(`E2E Nivae ${tag}`);
  await typo.getByText("Đổi tên / gộp").click();
  await typo.getByRole("textbox", { name: "Tên mới" }).fill(`E2E Nivaee ${tag}`);
  await typo.getByRole("button", { name: "Đổi tên" }).click();
  await expect(row(`E2E Nivaee ${tag}`)).toHaveCount(1);
  await page.screenshot({ path: "test-results/screens/brands.png", fullPage: true });

  const renamed = row(`E2E Nivaee ${tag}`);
  if (!(await renamed.getByRole("combobox", { name: "Gộp vào thương hiệu" }).isVisible())) await renamed.getByText("Đổi tên / gộp").click();
  await renamed.getByRole("combobox", { name: "Gộp vào thương hiệu" }).selectOption({ label: `E2E Nivea ${tag}` });
  page.once("dialog", (d) => d.accept());
  await renamed.getByRole("button", { name: "Gộp" }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(`E2E Nivea ${tag}`);
  await expect(rows.first().getByRole("cell").nth(1)).toContainText("2");
});

// Ưu tiên thấp (21/11/2026): Bán chậm → tab Cảnh báo; Web Vitals → Sức khoẻ dữ liệu.
test("Bán chậm ở tab Cảnh báo (Báo cáo › Tồn kho để lối tắt); Web Vitals ở Sức khoẻ dữ liệu", async ({ page }) => {
  await login(page, "admin@glow.local");
  await page.goto("/admin/reports/inventory");
  await page.getByRole("link", { name: "Xem tab Bán chậm" }).click();
  await expect(page).toHaveURL(/\/admin\/alerts\?tab=slow$/);
  await expect(page.getByRole("link", { name: /^Bán chậm/ })).toHaveAttribute("aria-current", /page|true/);
  await expect(page.getByText(/không bán được cái nào trong \d+ ngày/)).toBeVisible();

  await page.goto("/admin/reports/analytics");
  await expect(page.getByTestId("web-vitals")).toHaveCount(0);
  await page.getByRole("link", { name: "Xem Web Vitals" }).click();
  await expect(page).toHaveURL(/\/admin\/reports\/data-health#web-vitals$/);
  await expect(page.getByTestId("web-vitals")).toBeVisible();
});
