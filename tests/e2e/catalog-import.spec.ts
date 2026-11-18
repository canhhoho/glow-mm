import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { readSheet } from "read-excel-file/node";
import { CATALOG_HEADER_ROW, CATALOG_LIST_SHEET, CATALOG_SHEET, sheetHeaderKey } from "../../src/lib/catalog-sheet";
import { toCsv } from "../../src/lib/csv";
import { addCatalogSheet } from "../support/catalog-workbook";
import { livePrices, login, openProductEdit, openProductSettings, openProductTab, setPrices } from "./helpers";

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

test("file nhiều sheet: chọn đúng sheet, đổi sheet thì bỏ bản xem trước cũ", async ({ page }) => {
  await login(page, "admin@glow.local");
  await page.goto("/admin/products/import");
  const template = (await download(page, "Tải file mẫu trống")).bytes;
  const base = { brand: "Sen Việt", category: "skincare" };
  const first = fillCatalogTemplate(template, [{ ...base, name: "Dữ liệu đợt đầu" }]);
  const secondName = `Sản phẩm đợt sau ${Date.now()}`;
  const second = fillCatalogTemplate(template, [{ ...base, name: secondName, warehouse_code: "THAM", qty: 4, unit_cost: "100.000" }]);
  const sheetName = "Đợt 2 & bổ sung";
  await page.getByLabel("File Excel nhập sản phẩm", { exact: true }).setInputFiles({
    name: "nhieu-sheet.xlsx", mimeType: XLSX, buffer: Buffer.from(addCatalogSheet(first, second, sheetName)),
  });

  const sheets = page.getByRole("combobox", { name: "Sheet nhập dữ liệu" });
  const previewButton = page.getByRole("button", { name: "Xem trước", exact: true });
  const preview = page.getByTestId("catalog-import-preview");
  await expect(sheets).toBeVisible();
  await expect(sheets.locator("option")).toHaveText(["Chọn sheet", CATALOG_SHEET, sheetName]);
  await expect(sheets.locator(`option[value="${CATALOG_LIST_SHEET}"]`)).toHaveCount(0);
  await expect(previewButton).toBeDisabled();

  await sheets.selectOption(CATALOG_SHEET);
  await previewButton.click();
  await expect(preview).toContainText("Dữ liệu đợt đầu");
  await sheets.selectOption(sheetName);
  await expect(preview).toHaveCount(0);
  await previewButton.click(); // Cùng file, không cần chọn lại.
  await expect(preview).toContainText(`Xem trước sheet: ${sheetName}`);
  await expect(preview).toContainText(secondName);
  await expect(preview).not.toContainText("Dữ liệu đợt đầu");
  await preview.getByRole("button", { name: "Xác nhận nhập", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Đã nhập: 1 SP mới");
  await expect(page.getByRole("link", { name: /kiểm tra và ghi sổ/ })).toBeVisible();
});

test("file lỗi vẫn hiện Xác nhận nhập; sửa file và xem trước lại thì mở nút", async ({ page }) => {
  await login(page, "admin@glow.local");
  await page.goto("/admin/products/import");
  const template = await download(page, "Tải file mẫu trống");
  const product = { name: `Preview only ${Date.now()}`, brand: "Sen Việt", category: "skincare" };
  await upload(page, "loi.xlsx", fillCatalogTemplate(template.bytes, [{ ...product, category: `missing-${Date.now()}` }]));
  const preview = page.getByTestId("catalog-import-preview");
  const confirm = preview.getByRole("button", { name: "Xác nhận nhập", exact: true });
  await expect(confirm).toBeVisible();
  await expect(confirm).toBeDisabled();
  await expect(preview).toContainText("Chưa thể xác nhận vì file còn lỗi");

  await upload(page, "da-sua.xlsx", fillCatalogTemplate(template.bytes, [product]));
  await expect(confirm).toBeVisible();
  await expect(confirm).toBeEnabled();
  await expect(preview).not.toContainText("Chưa thể xác nhận vì file còn lỗi");
  // Chỉ kiểm tra xem trước, không ghi sản phẩm/tồn vào DB.
});

test("mẫu một sheet: tạo SP hai biến thể kèm tồn + nội dung → xác nhận → ghi sổ → giá → duyệt → đăng → khách thấy đúng", async ({ page }) => {
  test.setTimeout(240_000);
  const suffix = Date.now();
  const name = `Excel imported ${suffix}`;
  await login(page, "admin@glow.local");
  await page.goto("/admin/products/import");
  const template = await download(page, "Tải file mẫu trống");
  expect(template.name).toBe("mau-nhap-san-pham.xlsx");
  const filled = fillCatalogTemplate(template.bytes, [
    {
      name, brand: "Sen Việt", category: "skincare", variant_label: "50 ml", weight_g: 90,
      description_my: "Excel ဖြင့် ထည့်သွင်းသည်။", description_en: "Imported through the Excel browser flow.",
      usage_my: "နေ့စဉ် လိမ်းပါ။", usage_en: "Apply every morning.", ingredients: "Aqua, Zinc Oxide", storage_note: "Keep below 30°C", pao_months: 12,
      warehouse_code: "THAM", qty: "3", expiry_date: "31/03/2028", unit_cost: "100.000",
    },
    { name, brand: "Sen Việt", category: "skincare", variant_label: "100 ml", weight_g: 140, warehouse_code: "THAM" },
  ]);
  await upload(page, "nhap.xlsx", filled);
  const preview = page.getByTestId("catalog-import-preview");
  await expect(preview.getByTestId("catalog-import-summary")).toHaveText("2 dòng: 2 tạo mới · 0 cập nhật · 0 không đổi · 0 lỗi");
  // Trang nhập chỉ hiện thông tin SP: không có cột Nhập kho (giá mua, lô… xem ở phiếu nhập nháp).
  await expect(preview.getByRole("columnheader", { name: "Nhập kho" })).toHaveCount(0);
  await expect(preview.getByRole("row").filter({ hasText: "50 ml" })).not.toContainText("100,000");
  await expect(preview.getByRole("row").filter({ hasText: "50 ml" })).toContainText("90");
  await expect(preview.getByRole("alert")).toHaveCount(0);
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
  await expect(page).toHaveURL(/\/admin\/products\/[^/?]+(?:\?from=.*)?$/);
  // Đợt 3: một ô tên; bảng phân loại luôn hiện (SKU + khối lượng từng dòng); kho bán gán khi ghi sổ phiếu nhập.
  await expect(page.getByRole("textbox", { name: "Tên sản phẩm", exact: true })).toHaveValue(name);
  await expect(page.getByRole("textbox", { name: "Phân loại (dung tích/màu)", exact: true })).toHaveCount(2);
  await expect(page.getByRole("spinbutton", { name: "Khối lượng (g)", exact: true }).first()).toHaveValue("90");
  // Hiển thị trên web ở bước 5 (khối riêng), SP nhập từ Excel luôn ẩn (giá 0 → chờ các bước trước).
  await expect(page.getByTestId("step-publish-block")).toContainText("Hoàn thành các bước trước");
  await openProductSettings(page);
  await expect(page.getByRole("textbox", { name: "Slug (URL)", exact: true })).toHaveValue(`excel-imported-${suffix}`);

  // File không điền giá bán → SKU mới giá 0 (lưu nháp) → bước 4 báo lỗi giá theo SKU, bước 5 chưa bật được.
  const check = page.getByTestId("launch-check");
  const sku = await page.getByRole("textbox", { name: "SKU", exact: true }).first().inputValue();
  await expect(check.getByTestId("issue-PRICE_ZERO")).toContainText(sku);
  await expect(page.getByTestId("product-steps").getByTestId("step-price")).toHaveAttribute("data-state", "todo");
  await expect(page.getByTestId("step-publish-block")).toContainText("Hoàn thành các bước trước");
  await expect(page.getByTestId("step-publish-block").getByRole("button", { name: "Bật hiển thị trên web" })).toHaveCount(0);
  // 16/11: bước 3 dẫn về trang Giá bán (Excel không còn cột giá) → test đặt giá trực tiếp; thiếu ảnh chỉ là lưu ý.
  await openProductTab(page, "price");
  await expect(page.getByTestId("price-actions").getByRole("link", { name: "Đặt giá" })).toHaveAttribute("href", /\/admin\/selling-prices\/manual\?productId=/);
  await expect(page.getByTestId("step-price-row")).toHaveCount(2);
  await setPrices(page, [27000, 42000]);
  // P1-A: đủ điều kiện không tự vào hàng đợi → bấm Gửi duyệt; người duyệt "Chỉ duyệt" (có xác nhận) → vẫn ẩn.
  await expect(page.getByTestId("product-steps").getByTestId("step-review")).toHaveAttribute("data-state", "todo");
  await expect(check.getByTestId("approval-status")).toHaveAttribute("data-label", "DRAFT");
  await check.getByRole("button", { name: "Gửi duyệt", exact: true }).click();
  await expect(check.getByTestId("approval-status")).toHaveAttribute("data-label", "PENDING", { timeout: 15_000 });
  page.once("dialog", (d) => d.accept());
  await check.getByRole("button", { name: "Chỉ duyệt (chưa đăng)" }).click();
  await expect(check.getByTestId("approval-status")).toContainText("Đã duyệt bởi", { timeout: 15_000 });
  await expect(check).toContainText("Đủ điều kiện");
  await expect(page.getByTestId("step-publish-block")).toContainText("Đang ẩn khỏi web");
  await check.getByTestId("readiness-warnings").locator("summary").click();
  await expect(check.getByTestId("issue-NO_IMAGE")).toContainText("Cảnh báo");
  expect(await livePrices(page)).toEqual([27000, 42000]);
  await page.screenshot({ path: "test-results/screens/product-price-step.png", fullPage: true });

  // Bước 5: đăng → khách thấy đúng dữ liệu đã nhập từ Excel (tiếng Anh + tiếng Myanmar mặc định).
  const publish = page.getByTestId("step-publish-block");
  page.once("dialog", (d) => d.accept());
  await publish.getByRole("button", { name: "Bật hiển thị trên web" }).click();
  await expect(publish).toContainText("Đang hiển thị trên web", { timeout: 15_000 });
  const slug = `excel-imported-${suffix}`;
  await page.goto(`/en/p/${slug}`);
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1 })).toHaveText(name);
  await expect(main).toContainText("Sen Việt");
  await expect(main).toContainText("27,000");
  for (const text of ["50 ml", "100 ml", "Imported through the Excel browser flow.", "Apply every morning.", "Aqua, Zinc Oxide", "Keep below 30°C", "Use within 12 months after opening"]) {
    await expect(main).toContainText(text);
  }
  // Hạn dùng đang tắt (`FEATURES.expiry`, 17/11/2026): trang SP không hiện hạn của lô khách sẽ nhận.
  await expect(main).not.toContainText("2028-03-31");
  await page.screenshot({ path: "test-results/screens/catalog-import-storefront-en.png", fullPage: true });
  // Một tên cho mọi ngôn ngữ: trang tiếng Myanmar dùng cùng tên; mô tả/cách dùng Myanmar vẫn riêng.
  await page.goto(`/p/${slug}`);
  await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toHaveText(name);
  await expect(page.getByRole("main")).toContainText("Excel ဖြင့် ထည့်သွင်းသည်။");
  await expect(page.getByRole("main")).toContainText("နေ့စဉ် လိမ်းပါ။");
});

test("file SP hiện có: cùng cột với mẫu, một cột tên, không còn cột giá; file cũ có cột giá → lưu ý, không đổi giá", async ({ page }) => {
  test.setTimeout(150_000);
  const slug = "sen-viet-sunscreen-spf50";
  await login(page, "admin@glow.local");
  await page.goto(`/admin/products?q=${slug}`);
  await page.getByRole("row", { name: new RegExp(slug) }).getByRole("link", { name: /^Sửa / }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[^/?]+(?:\?from=.*)?$/);
  await openProductEdit(page);
  const name = await page.getByRole("textbox", { name: "Tên sản phẩm", exact: true }).inputValue();
  const sku = await page.getByRole("textbox", { name: "SKU", exact: true }).first().inputValue();
  const [original] = await livePrices(page);

  await page.goto("/admin/products/import");
  const blank = await download(page, "Tải file mẫu trống");
  const current = await download(page, "Tải danh sách sản phẩm hiện có (để cập nhật)");
  expect(current.name).toMatch(/^san-pham-hien-co-\d{8}\.xlsx$/);
  const header = async (bytes: Uint8Array) => (await readSheet(Buffer.from(bytes), CATALOG_SHEET))[CATALOG_HEADER_ROW - 1].map(sheetHeaderKey);
  const keys = await header(current.bytes);
  // Tiêu đề ở dòng 1, file mẫu và file SP hiện có cùng bộ cột; không còn tên Myanmar / giá / hoa hồng / "Có hạn dùng".
  expect(keys).toEqual(await header(blank.bytes));
  expect(keys).toContain("name");
  for (const gone of ["name_my", "name_en", "price_mmk", "affiliate_commission_mmk", "has_expiry"]) expect(keys).not.toContain(gone);
  const rows = await readSheet(Buffer.from(current.bytes), CATALOG_SHEET);
  const mine = rows.find((r) => r[keys.indexOf("sku")] === sku)!;
  expect(mine[keys.indexOf("name")]).toBe(name);

  // CSV kiểu cũ có cột giá: chỉ lưu ý, dòng "Không đổi" (không xác nhận — không ghi gì).
  await upload(page, "gia-cu.csv", Buffer.from(toCsv([["sku", "brand", "category", "price_mmk"], [sku, "", "", String(original + 1000)]])));
  const preview = page.getByTestId("catalog-import-preview");
  await expect(preview.getByTestId("catalog-import-summary")).toHaveText("1 dòng: 0 tạo mới · 0 cập nhật · 1 không đổi · 0 lỗi");
  await expect(preview.getByRole("row").filter({ hasText: sku })).toContainText("Không đổi");
  await expect(preview).toContainText("không còn nhập qua Excel");
});
