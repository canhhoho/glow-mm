import { expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import { login, solidPng } from "./helpers";

/** Dữ liệu trang chủ cho E2E storefront: tạo qua màn hình admin (đi đúng luồng thật, kể cả updateTag). */

export async function adminPage(browser: Browser, testInfo: TestInfo): Promise<Page> {
  const ctx = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  const page = await ctx.newPage();
  await login(page, "admin@glow.local");
  return page;
}

export async function createBanner(page: Page, alt: string, href: string) {
  await page.goto("/admin/content/banners/new");
  await page.getByLabel(/Ảnh desktop/).setInputFiles({ name: "d.png", mimeType: "image/png", buffer: solidPng(150) });
  await page.getByLabel("Mô tả ảnh (alt)").fill(alt);
  await page.getByLabel(/Link khi bấm/).fill(href);
  await page.getByRole("button", { name: "Lưu" }).click();
  await expect(page).toHaveURL(/\/admin\/content\/banners\?saved=1$/);
}

export async function deleteBanners(page: Page, altPrefix: string) {
  await page.goto("/admin/content/banners");
  const rows = page.getByTestId("banner-row").filter({ hasText: altPrefix });
  while ((await rows.count()) > 0) {
    const n = await rows.count();
    page.once("dialog", (d) => d.accept());
    await rows.first().getByRole("button", { name: "Xoá" }).click();
    await expect(rows).toHaveCount(n - 1);
  }
}

/** Tạo bộ sưu tập (hiện trên trang chủ) với các SP theo slug; trả URL trang sửa. */
export async function createCollection(page: Page, slug: string, nameEn: string, productSlugs: string[]) {
  await page.goto("/admin/content/collections");
  const form = page.getByRole("region", { name: "Tạo bộ sưu tập" });
  await form.getByLabel(/Slug/).fill(slug);
  await form.getByLabel("Tên (Myanmar)").fill("စမ်းသပ်");
  await form.getByLabel("Tên (English)").fill(nameEn);
  await form.getByRole("button", { name: "Tạo" }).click();
  await expect(page).toHaveURL(/\/admin\/content\/collections\/[^/?]+$/);
  const url = page.url();
  for (const q of productSlugs) {
    await page.getByLabel("Tìm tên, slug, SKU").filter({ visible: true }).fill(q);
    await page.getByRole("button", { name: "Tìm", exact: true }).click();
    await page.getByTestId("product-result").filter({ hasText: q }).getByRole("button", { name: "Thêm" }).click();
    await expect(page.getByTestId("collection-item").filter({ hasText: q })).toBeVisible();
  }
  return url;
}

export async function deleteCollection(page: Page, editUrl: string) {
  await page.goto(editUrl);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Xoá bộ sưu tập" }).click();
  await expect(page).toHaveURL(/\/admin\/content\/collections$/);
}
