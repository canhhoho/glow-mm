import { expect, test } from "@playwright/test";
import { login, openAdminNav, solidPng } from "./helpers";

// P6b: quản trị nội dung trang chủ (danh mục + icon, banner, bộ sưu tập) và phân quyền.

test("danh mục: lưu, tải icon (hiện ảnh), xoá icon", async ({ page }) => {
  test.setTimeout(90_000);
  await login(page, "admin@glow.local");
  await page.goto("/admin/categories?q=skincare"); // lọc → trang nhẹ dù DB test có hàng nghìn danh mục fixture
  // Lọc theo ô slug (ô chọn danh mục cha ở mọi hàng cũng chứa chữ "Skincare").
  const row = page.getByTestId("category-row").filter({ has: page.getByText("skincare", { exact: true }) });

  // DB test local tích luỹ nhiều danh mục fixture → trang nặng, server action có thể chậm vài giây.
  await row.getByRole("button", { name: "Lưu" }).click();
  await expect(row.getByRole("status").filter({ hasText: "Đã lưu" })).toBeVisible({ timeout: 20_000 });

  await row.getByLabel("Chọn ảnh icon").setInputFiles({ name: "icon.png", mimeType: "image/png", buffer: solidPng(64) });
  await row.getByRole("button", { name: "Tải icon" }).click();
  await expect(row.getByRole("status").filter({ hasText: "Đã tải icon" })).toBeVisible({ timeout: 20_000 });
  await expect(row.getByRole("img", { name: /Icon/ })).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: "test-results/screens/admin-categories.png", fullPage: true });

  // Dọn: bỏ icon để không ảnh hưởng test khác.
  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: "Xoá icon" }).click();
  await expect(row.getByRole("img", { name: /Icon/ })).toHaveCount(0, { timeout: 20_000 });
});

test("banner: tạo, báo lỗi link sai, tắt/bật, sửa, xoá", async ({ page }) => {
  test.setTimeout(90_000);
  const alt = `E2E banner ${Date.now()}`;
  await login(page, "admin@glow.local");
  await page.goto("/admin/content/banners");
  await page.getByRole("link", { name: "Thêm banner" }).click();
  await expect(page).toHaveURL(/\/admin\/content\/banners\/new$/);

  await page.getByLabel(/Ảnh desktop/).setInputFiles({ name: "d.png", mimeType: "image/png", buffer: solidPng(90) });
  await page.getByLabel("Mô tả ảnh (alt)").fill(alt);
  await page.getByLabel(/Link khi bấm/).fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Link" })).toBeVisible();

  // React đặt lại form sau mỗi lần gửi → nhập lại.
  await page.getByLabel(/Ảnh desktop/).setInputFiles({ name: "d.png", mimeType: "image/png", buffer: solidPng(90) });
  await page.getByLabel("Mô tả ảnh (alt)").fill(alt);
  await page.getByLabel(/Link khi bấm/).fill("/c/skincare");
  await page.getByRole("button", { name: "Lưu" }).click();
  await expect(page).toHaveURL(/\/admin\/content\/banners\?saved=1$/);

  const row = page.getByTestId("banner-row").filter({ hasText: alt });
  await expect(row.getByText("Đang hiện")).toBeVisible();
  await expect(row.getByRole("img", { name: alt })).toBeVisible();
  await page.screenshot({ path: "test-results/screens/admin-banners.png", fullPage: true });

  await row.getByRole("button", { name: "Tắt" }).click();
  await expect(row.getByText("Đã tắt")).toBeVisible();
  await row.getByRole("button", { name: "Bật" }).click();
  await expect(row.getByText("Đang hiện")).toBeVisible();

  // Sửa: chỉ hiện cho tiếng Myanmar + thêm ảnh mobile.
  // Next giữ trang vừa rời (form "Thêm banner") ẩn trong DOM → chỉ lấy phần tử đang hiện.
  await row.getByRole("link", { name: "Sửa" }).click();
  await expect(page.getByRole("heading", { name: "Sửa banner" })).toBeVisible();
  await page.getByLabel("Hiện cho ngôn ngữ").filter({ visible: true }).selectOption("my");
  await page.getByLabel(/Ảnh mobile/).filter({ visible: true }).setInputFiles({ name: "m.png", mimeType: "image/png", buffer: solidPng(60) });
  await page.getByRole("button", { name: "Lưu" }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/admin\/content\/banners\?saved=1$/);
  // Bảng dạng thẻ trên điện thoại: nhãn cột (CSS content) nằm trong tên ô → so nội dung ô, không so tên ô.
  await expect(row.getByText("Myanmar", { exact: true })).toBeVisible();

  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: "Xoá" }).click();
  await expect(row).toHaveCount(0);
});

test("bộ sưu tập: tạo, thêm 2 SP, đổi thứ tự, bỏ SP, xoá", async ({ page }) => {
  test.setTimeout(90_000);
  const slug = `e2e-${Date.now()}`;
  await login(page, "admin@glow.local");
  await page.goto("/admin/content/collections");
  const form = page.getByRole("region", { name: "Tạo bộ sưu tập" });
  await form.getByLabel(/Slug/).fill(slug);
  await form.getByLabel("Tên (Myanmar)").fill("စမ်းသပ်");
  await form.getByLabel("Tên (English)").fill(`E2E ${slug}`);
  await form.getByRole("button", { name: "Tạo" }).click();
  await expect(page).toHaveURL(/\/admin\/content\/collections\/[^/?]+$/);

  const items = page.getByTestId("collection-item");
  for (const q of ["sen-viet-sunscreen-spf50", "moc-lan-rose-toner"]) {
    await page.getByLabel("Tìm tên, slug, SKU").fill(q);
    await page.getByRole("button", { name: "Tìm", exact: true }).click();
    await page.getByTestId("product-result").filter({ hasText: q }).getByRole("button", { name: "Thêm" }).click();
    await expect(items.filter({ hasText: q })).toBeVisible();
  }
  await expect(items).toHaveCount(2);
  await expect(items.first()).toContainText("sen-viet-sunscreen-spf50");

  await items.nth(1).getByRole("button", { name: /Lên/ }).click();
  await expect(items.first()).toContainText("moc-lan-rose-toner");
  await page.screenshot({ path: "test-results/screens/admin-collection.png", fullPage: true });

  await items.filter({ hasText: "sen-viet-sunscreen-spf50" }).getByRole("button", { name: "Bỏ" }).click();
  await expect(items).toHaveCount(1);

  // Sửa thông tin: tắt "Hiện trên trang chủ" (form tạo ở trang danh sách có thể còn ẩn trong DOM).
  await page.getByLabel("Hiện trên trang chủ").filter({ visible: true }).uncheck();
  await page.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Đã lưu" })).toBeVisible();

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Xoá bộ sưu tập" }).click();
  await expect(page).toHaveURL(/\/admin\/content\/collections$/);
  await expect(page.getByTestId("collection-row").filter({ hasText: slug })).toHaveCount(0);
});

test("quản lý kho không vào được trang nội dung; menu không hiện", async ({ page }) => {
  await login(page, "kho@glow.local");
  await expect((await openAdminNav(page)).getByRole("link", { name: "Banner" })).toHaveCount(0);
  await page.goto("/admin/content/banners");
  await expect(page).toHaveURL(/\/admin\?denied=1$/);
  await page.goto("/admin/categories");
  await expect(page).toHaveURL(/\/admin\?denied=1$/);
});
