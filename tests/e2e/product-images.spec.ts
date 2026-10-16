import { expect, test } from "@playwright/test";
import { login, solidPng } from "./helpers";

const SLUG = "sen-viet-sunscreen-spf50";
const PNG = solidPng(64);

test("admin tải ảnh sản phẩm → hiện trên trang sản phẩm → xoá ảnh", async ({ page }) => {
  test.setTimeout(90_000);
  const alt = `E2E ảnh ${Date.now()}`;
  await login(page, "admin@glow.local");
  await page.goto(`/admin/products?q=${SLUG}`);
  await page.getByRole("row", { name: new RegExp(SLUG) }).getByRole("link").click();
  await expect(page).toHaveURL(/\/admin\/products\/[^/?]+$/);
  const adminUrl = page.url();

  const section = page.getByRole("region", { name: "Ảnh", exact: true });
  const rows = section.getByTestId("product-image");
  const before = await rows.count();
  await section.getByLabel("Chọn ảnh sản phẩm").setInputFiles({ name: "e2e.png", mimeType: "image/png", buffer: PNG });
  await section.getByRole("button", { name: "Tải lên" }).click();
  await expect(section.getByRole("status").filter({ hasText: "Đã tải ảnh lên" })).toBeVisible();
  await expect(rows).toHaveCount(before + 1);

  const mine = rows.last();
  await mine.getByLabel("Mô tả ảnh (alt)").fill(alt);
  await mine.getByRole("button", { name: "Lưu mô tả" }).click();
  // Lần đầu tối ưu ảnh (sharp) trên server lạnh có thể chậm vài giây.
  await expect(mine.getByRole("status").filter({ hasText: "Đã lưu" })).toBeVisible({ timeout: 20_000 });
  await expect(mine.getByRole("img", { name: alt })).toBeVisible();
  await page.screenshot({ path: "test-results/screens/product-images-admin.png", fullPage: true });

  try {
    await page.goto(`/en/p/${SLUG}`);
    const img = page.getByRole("img", { name: alt });
    await expect(img).toBeVisible();
    // Ảnh thật sự tải được (qua /api/files + bộ tối ưu next/image).
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
    await page.screenshot({ path: "test-results/screens/product-images-store.png", fullPage: true });
  } finally {
    // Dọn: xoá ảnh vừa thêm để không ảnh hưởng test khác.
    await page.goto(adminUrl);
    const row = page.getByRole("region", { name: "Ảnh", exact: true }).getByTestId("product-image").filter({ has: page.getByRole("img", { name: alt }) });
    page.once("dialog", (d) => d.accept());
    await row.getByRole("button", { name: "Xoá ảnh" }).click();
    await expect(row).toHaveCount(0);
  }

  await page.goto(`/en/p/${SLUG}`);
  await expect(page.getByRole("img", { name: alt })).toHaveCount(0);
});
