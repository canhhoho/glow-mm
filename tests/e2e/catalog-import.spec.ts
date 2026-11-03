import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import columns from "../../src/lib/catalog-import-columns.json";
import { login } from "./helpers";

/** Fill the actual downloaded template, leaving its headers and guide intact. */
function fillProductTemplate(template: Uint8Array, values: Record<string, string | number>): Buffer {
  const files = unzipSync(template);
  const sheetPath = "xl/worksheets/sheet1.xml";
  const original = strFromU8(files[sheetPath]);
  const row7 = /<((?:[\w.-]+:)?row)\b[^>]*\br="7"[^>]*(?:\/>|>[\s\S]*?<\/\1>)/;
  const rowMatch = row7.exec(original);
  if (!rowMatch) throw new Error("Downloaded template has no entry row 7");
  const ns = rowMatch[1].replace(/row$/, "");
  const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const cells = columns.products.map((column, i) => {
    const address = `${String.fromCharCode(65 + i)}7`;
    const value = values[column.key] ?? "";
    return typeof value === "number"
      ? `<${ns}c r="${address}"><${ns}v>${value}</${ns}v></${ns}c>`
      : `<${ns}c r="${address}" t="inlineStr"><${ns}is><${ns}t>${escape(value)}</${ns}t></${ns}is></${ns}c>`;
  }).join("");
  files[sheetPath] = strToU8(original.replace(row7, `<${ns}row r="7">${cells}</${ns}row>`));
  return Buffer.from(zipSync(files));
}

test("tải mẫu Excel, điền và nhập sản phẩm trực tiếp qua trình duyệt", async ({ page }) => {
  test.setTimeout(90_000);
  const suffix = Date.now();
  const slug = `e2e-xlsx-${suffix}`;
  const sku = `E2E-XLSX-${suffix}`;
  const name = `Excel imported ${suffix}`;
  await login(page, "admin@glow.local");
  await page.goto("/admin/products/import");
  const products = page.locator("section").filter({ has: page.getByRole("heading", { name: "1. Import sản phẩm", exact: true }) });
  await expect(products).toHaveCount(1);
  const downloaded = page.waitForEvent("download");
  await products.getByRole("link", { name: "Tải mẫu Excel (.xlsx)", exact: true }).click();
  const template = await downloaded;
  expect(template.suggestedFilename()).toBe("products.xlsx");
  const templatePath = await template.path();
  expect(templatePath).not.toBeNull();
  const filled = fillProductTemplate(await readFile(templatePath!), {
    product_slug: slug,
    sku,
    variant_label: "50 ml",
    name_my: `နေကာခရင်မ် ${suffix}`,
    name_en: name,
    brand: "Sen Việt",
    category: "skincare", // danh mục có sẵn trong seed DB test
    price_mmk: 27000,
    weight_g: 90,
    description_en: "Imported through the Excel browser flow.",
  });
  await products.getByLabel("Import sản phẩm", { exact: true }).setInputFiles({
    name: `${slug}.xlsx`,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: filled,
  });
  await products.getByRole("button", { name: "Tải lên", exact: true }).click();
  await expect(products.getByText("Đã xử lý 1 dòng.", { exact: true })).toBeVisible();
  await expect(products.getByRole("alert")).toHaveCount(0);

  await page.goto(`/admin/products?q=${slug}`);
  const row = page.getByRole("row").filter({ hasText: slug });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(name);
  await expect(row).toContainText(sku);
  const editLink = row.getByRole("link", { name: "Sửa", exact: true });
  const editHref = await editLink.getAttribute("href");
  expect(editHref).toMatch(/^\/admin\/products\/(?!import$|new$)[^/?]+$/);
  const editUrl = new URL(editHref!, page.url()).toString();
  await editLink.click();
  await expect(page).toHaveURL(editUrl);
  await expect(page.getByRole("textbox", { name: "Slug (URL)", exact: true })).toHaveValue(slug);
  await page.reload(); // xác nhận dữ liệu đã lưu, không chỉ là kết quả form import
  await expect(page.getByRole("textbox", { name: "Slug (URL)", exact: true })).toHaveValue(slug);
  await expect(page.getByRole("textbox", { name: "SKU", exact: true }).first()).toHaveValue(sku);
  await expect(page.getByRole("textbox", { name: "Tên", exact: true }).last()).toHaveValue(name);
  await expect(page.getByRole("checkbox", { name: "Hiển thị trên web", exact: true })).not.toBeChecked();
});
