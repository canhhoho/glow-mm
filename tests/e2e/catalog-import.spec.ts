import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { readSheet } from "read-excel-file/node";
import { CATALOG_HEADER_ROW, CATALOG_SHEET, sheetHeaderKey } from "../../src/lib/catalog-sheet";
import { toCsv } from "../../src/lib/csv";
import { login, openProductEdit, openProductSettings, priceInputs, setPrices } from "./helpers";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Điền các dòng vào đúng file vừa tải (giữ tiêu đề, danh sách thả xuống, hướng dẫn). */
function fillCatalogTemplate(template: Uint8Array, rows: Record<string, string | number>[]): Buffer {
  const files = unzipSync(template);
  const path = "xl/worksheets/sheet1.xml";
  const sheet = strFromU8(files[path]);
  const header = new RegExp(`<row r="${CATALOG_HEADER_ROW}"[^>]*>([\\s\\S]*?)</row>`).exec(sheet)![1];
  const keys = [...header.matchAll(/<c r="([A-Z]+)\d+"[^>]*>[\s\S]*?<t[^>]*>([^<]*)<\/t>/g)].map((m) => ({ col: m[1], key: sheetHeaderKey(m[2]) }));
  const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const body = rows.map((values, i) => {
    const r = CATALOG_HEADER_ROW + 1 + i;
    const cells = keys.map(({ col, key }) => {
      const v = values[key];
      if (v == null || v === "") return "";
      return typeof v === "number" ? `<c r="${col}${r}"><v>${v}</v></c>` : `<c r="${col}${r}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`;
    });
    return `<row r="${r}">${cells.join("")}</row>`;
  });
  files[path] = strToU8(sheet.replace("</sheetData>", `${body.join("")}</sheetData>`));
  return Buffer.from(zipSync(files));
}

async function download(page: Page, linkName: string) {
  const pending = page.waitForEvent("download");
  await page.getByRole("link", { name: linkName, exact: true }).click();
  const file = await pending;
  return { name: file.suggestedFilename(), bytes: new Uint8Array(await readFile((await file.path())!)) };
}

async function upload(page: Page, name: string, buffer: Buffer) {
  await page.getByLabel("File Excel nhập sản phẩm", { exact: true }).setInputFiles({ name, mimeType: XLSX, buffer });
  await page.getByRole("button", { name: "Xem trước", exact: true }).click();
  await expect(page.getByTestId("catalog-import-preview")).toBeVisible({ timeout: 30_000 });
}

test("mẫu một sheet: tạo SP hai biến thể kèm tồn → xem trước → xác nhận → ghi sổ phiếu nháp", async ({ page }) => {
  test.setTimeout(150_000);
  const suffix = Date.now();
  const name = `Excel imported ${suffix}`;
  await login(page, "admin@glow.local");
  await page.goto("/admin/products/import");
  const template = await download(page, "Tải file mẫu trống");
  expect(template.name).toBe("mau-nhap-san-pham.xlsx");
  const filled = fillCatalogTemplate(template.bytes, [
    { name_my: `နေကာခရင်မ် ${suffix}`, name_en: name, brand: "Sen Việt", category: "skincare", variant_label: "50 ml", weight_g: 90, description_en: "Imported through the Excel browser flow.", warehouse_code: "THAM", qty: 3, expiry_date: "31/03/2028", unit_cost: 100000, inbound_unit_vnd: 5000 },
    { name_my: `နေကာခရင်မ် ${suffix}`, name_en: name, brand: "Sen Việt", category: "skincare", variant_label: "100 ml", weight_g: 140, warehouse_code: "THAM" },
  ]);
  await upload(page, "nhap.xlsx", filled);
  const preview = page.getByTestId("catalog-import-preview");
  await expect(preview).toContainText("1 SP mới · 0 SP cập nhật · 0 SP không đổi · 1 dòng nhập tồn");
  await expect(preview.getByRole("alert")).toHaveCount(0);
  await expect(preview.getByRole("row").filter({ hasText: "50 ml" })).toContainText("2028-03-31");
  await page.screenshot({ path: "test-results/screens/catalog-import-preview.png", fullPage: true });
  await page.getByRole("button", { name: "Xác nhận nhập", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Đã nhập: 1 SP mới", { timeout: 30_000 });
  await page.getByRole("link", { name: /kiểm tra và ghi sổ/ }).click();
  await expect(page).toHaveURL(/\/admin\/inventory\/documents\/[^/?]+$/);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Ghi sổ", exact: true }).click();
  await expect(page.locator("span").filter({ hasText: /^Đã ghi sổ$/ }).filter({ visible: true })).toBeVisible();

  await page.goto(`/admin/products?q=${encodeURIComponent(name)}`);
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toHaveCount(1);
  await row.getByRole("link", { name: /^Sửa / }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[^/?]+$/);
  await expect(page.getByRole("textbox", { name: "Tên tiếng Anh", exact: true })).toHaveValue(name);
  await expect(page.getByRole("textbox", { name: "Tên biến thể (dung tích/màu)", exact: true })).toHaveCount(2);
  // Hiển thị trên web ở bước 5 (khối riêng), SP nhập từ Excel luôn ẩn (giá 0 → chờ các bước trước).
  await expect(page.getByTestId("step-publish-block")).toContainText("Hoàn thành các bước trước");
  await openProductSettings(page);
  await expect(page.getByRole("textbox", { name: "Slug (URL)", exact: true })).toHaveValue(`excel-imported-${suffix}`);

  // QT1b: SKU mới từ Excel vào giá 0 (cột giá bị bỏ qua) → bước 4 báo lỗi giá theo SKU, bước 5 chưa bật được.
  const check = page.getByTestId("launch-check");
  const sku = await page.getByRole("textbox", { name: "SKU", exact: true }).first().inputValue();
  await expect(check.getByTestId("issue-PRICE_ZERO")).toContainText(sku);
  await expect(page.getByTestId("product-steps").getByTestId("step-price")).toHaveAttribute("data-state", "todo");
  await expect(page.getByTestId("step-publish-block")).toContainText("Hoàn thành các bước trước");
  await expect(page.getByTestId("step-publish-block").getByRole("button", { name: "Bật hiển thị trên web" })).toHaveCount(0);
  // Bước 3: đặt giá tay có lý do → đủ điều kiện; thiếu ảnh chỉ là lưu ý; nguồn giá = sửa tay.
  await expect(await priceInputs(page)).toHaveCount(2);
  await setPrices(page, [27000, 42000], "Giá mở bán");
  // QT2: bước 1–3 xong → bước 4 chỉ còn "chưa duyệt"; bấm Duyệt (có xác nhận) → đủ điều kiện.
  await expect(check.getByTestId("issue-NOT_APPROVED")).toBeVisible();
  await expect(page.getByTestId("product-steps").getByTestId("step-review")).toHaveAttribute("data-state", "todo");
  page.once("dialog", (d) => d.accept());
  await check.getByRole("button", { name: "Duyệt", exact: true }).click();
  await expect(check.getByTestId("approval-status")).toContainText("Đã duyệt bởi", { timeout: 15_000 });
  await expect(check).toContainText("Đủ điều kiện");
  await expect(page.getByTestId("step-publish-block")).toContainText("Đang ẩn khỏi web");
  await check.getByTestId("readiness-warnings").locator("summary").click();
  await expect(check.getByTestId("issue-NO_IMAGE")).toContainText("Cảnh báo");
  await expect(page.getByTestId("step-price-row").first()).toContainText("Sửa tay");
  await expect(page.getByTestId("step-price-row").first()).toContainText("Giá mở bán");
  await page.screenshot({ path: "test-results/screens/product-price-step.png", fullPage: true });
});

test("cập nhật giá: danh sách SP hiện có chứa SKU; tải lên dòng SKU + giá mới → giá đổi, ô trống giữ nguyên", async ({ page }) => {
  test.setTimeout(150_000);
  const slug = "sen-viet-sunscreen-spf50";
  await login(page, "admin@glow.local");
  await page.goto(`/admin/products?q=${slug}`);
  await page.getByRole("row", { name: new RegExp(slug) }).getByRole("link", { name: /^Sửa / }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[^/?]+$/);
  const productUrl = page.url();
  await openProductEdit(page);
  const nameEn = await page.getByRole("textbox", { name: "Tên tiếng Anh", exact: true }).inputValue();
  await openProductSettings(page);
  const sku = await page.getByRole("textbox", { name: "SKU", exact: true }).first().inputValue();
  const original = Number(await (await priceInputs(page)).first().inputValue());
  const next = original + 100;

  await page.goto("/admin/products/import");
  const current = await download(page, "Tải danh sách sản phẩm hiện có (để cập nhật)");
  expect(current.name).toMatch(/^san-pham-hien-co-\d{8}\.xlsx$/);
  const rows = await readSheet(Buffer.from(current.bytes), CATALOG_SHEET);
  const keys = rows[CATALOG_HEADER_ROW - 1].map(sheetHeaderKey);
  const mine = rows.find((r) => r[keys.indexOf("sku")] === sku)!;
  expect(mine[keys.indexOf("name_en")]).toBe(nameEn);
  expect(keys).not.toContain("price_mmk");
  expect(keys).not.toContain("affiliate_commission_mmk");

  try {
    // File mẫu mới tập trung thông tin SP; file CSV cũ vẫn hỗ trợ sửa giá SKU đã có.
    await upload(page, "cap-nhat.csv", Buffer.from(toCsv([["sku", "brand", "category", "price_mmk"], [sku, "", "", String(next)]])));
    const preview = page.getByTestId("catalog-import-preview");
    await expect(preview).toContainText("0 SP mới · 1 SP cập nhật");
    await expect(preview.getByRole("row").filter({ hasText: sku })).toContainText("Cập nhật");
    await page.getByRole("button", { name: "Xác nhận nhập", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("1 SP cập nhật", { timeout: 30_000 });
    await page.goto(productUrl);
    await openProductEdit(page);
    await expect(page.getByRole("textbox", { name: "Tên tiếng Anh", exact: true })).toHaveValue(nameEn);
    await openProductSettings(page);
    const variant = page.getByRole("textbox", { name: "SKU", exact: true }).first();
    await expect(variant).toHaveValue(sku);
    await expect((await priceInputs(page)).first()).toHaveValue(String(next));
    await expect(page.getByTestId("step-price-row").first()).toContainText("Excel");
  } finally {
    // Trả giá cũ cho dữ liệu seed dùng chung.
    await page.goto(productUrl);
    await setPrices(page, [original], "E2E trả giá cũ");
  }
});
