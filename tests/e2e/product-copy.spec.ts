import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("thêm sản phẩm từ bản sao, sửa trước khi lưu và giữ nguyên nguồn", async ({ page }) => {
  test.setTimeout(90_000);
  const sourceSlug = "sen-viet-sunscreen-spf50";
  const slug = `e2e-copy-${Date.now()}`;
  await login(page, "admin@glow.local");
  await page.goto(`/admin/products?q=${sourceSlug}`);
  const sourceRow = page.getByRole("row", { name: new RegExp(sourceSlug) });
  await sourceRow.getByRole("link", { name: "Sửa", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[^/?]+$/);
  const originalUrl = page.url();
  const sourceId = new URL(originalUrl).pathname.split("/").pop()!;
  const originalName = await page.getByRole("textbox", { name: "Tên", exact: true }).last().inputValue();
  const originalSku = await page.getByRole("textbox", { name: "SKU", exact: true }).first().inputValue();

  await page.goto("/admin/products/new");
  const picker = page.getByRole("combobox", { name: "Sản phẩm nguồn", exact: true });
  await picker.selectOption(sourceId);
  await page.getByRole("button", { name: "Nạp thông tin", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`copyFrom=${sourceId}`));
  await expect(page.getByRole("textbox", { name: "Slug (URL)", exact: true })).toHaveValue("");
  await expect(page.getByRole("textbox", { name: "Tên", exact: true }).last()).toHaveValue(originalName);
  await expect(page.getByRole("checkbox", { name: "Hiển thị trên web", exact: true })).not.toBeChecked();
  const skus = page.getByRole("textbox", { name: "SKU", exact: true });
  const count = await skus.count();
  for (let i = 0; i < count; i++) {
    await expect(skus.nth(i)).toHaveValue("");
    await skus.nth(i).fill(`${slug}-${i}`);
  }
  await page.getByRole("textbox", { name: "Slug (URL)", exact: true }).fill(slug);
  await page.getByRole("textbox", { name: "Tên", exact: true }).last().fill(`Copy ${originalName}`);
  await page.getByRole("button", { name: "Lưu", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[^/?]+\?saved=1$/);
  expect(page.url().split("?")[0]).not.toBe(originalUrl.split("?")[0]);
  await expect(page.getByRole("textbox", { name: "Slug (URL)", exact: true })).toHaveValue(slug);
  await expect(page.getByRole("textbox", { name: "Tên", exact: true }).last()).toHaveValue(`Copy ${originalName}`);
  await page.goto(originalUrl);
  await expect(page.getByRole("textbox", { name: "Tên", exact: true }).last()).toHaveValue(originalName);
  await expect(page.getByRole("textbox", { name: "SKU", exact: true }).first()).toHaveValue(originalSku);
});
