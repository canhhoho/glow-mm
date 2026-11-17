import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";

/**
 * Job e2e của CI chạy trên DB trắng (chỉ seed, không có dữ liệu của bộ integration) → tự nhập đủ lô để có trang 2.
 * Nhập vào khu Chờ kiểm tra (không bán được) qua phiếu nhập thật, không đụng tồn bán của SP seed.
 */
async function ensureLots(page: Page, min: number) {
  await page.goto("/admin/inventory?view=lots");
  const total = Number((await page.getByTestId("page-info").innerText()).split("/")[1]?.trim() ?? 0);
  if (total >= min) return;
  const tag = Date.now().toString(36).toUpperCase();
  const rows = Array.from({ length: min - total }, (_, i) => ["SV-SUN-50", "1", `PG${tag}-${i}`, "31/12/2029", "1000"].join("\t")).join("\n");
  await page.goto("/admin/inventory/documents/new?type=RECEIVE");
  await page.getByRole("checkbox", { name: "Chọn SV-SUN-50", exact: true }).check();
  await page.getByRole("button", { name: "Tiếp tục nhập thông số", exact: true }).click();
  await page.getByLabel("Áp kho này cho tất cả").selectOption({ label: "MM-QC — Chờ kiểm tra" });
  await page.getByRole("button", { name: "Dán từ Excel" }).click();
  await page.getByRole("textbox", { name: "Dán từ Excel" }).fill(rows);
  await page.getByRole("button", { name: "Điền vào bảng" }).click();
  await page.getByRole("button", { name: "Lưu nháp" }).click();
  await expect(page).toHaveURL(/\/admin\/inventory\/documents\/(?!new(?:\?|$))[^/?]+$/, { timeout: 30_000 });
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Ghi sổ" }).click();
  await expect(page.getByText("Đã ghi sổ", { exact: true }).filter({ visible: true })).toBeVisible({ timeout: 30_000 });
}

// P9c: trang Tồn kho trên mobile — ô số tổng, lọc, thẻ sản phẩm, xem lô, lịch sử lô, phân trang, tạo phiếu.

test("thủ kho: tìm SP → xem lô → lịch sử lô khớp tồn", async ({ page }) => {
  await login(page, "kho@glow.local");
  await page.goto("/admin/inventory?q=SV-SUN-50");
  await expect(page.getByTestId("tile-near")).toBeVisible();
  const card = page.getByTestId("stock-card").filter({ hasText: "SV-SUN-50" });
  await expect(card).toHaveCount(1);

  await card.getByText("Xem lô").click();
  const lot = card.getByTestId("lot-row").first();
  await expect(lot).toBeVisible();
  const lotNo = (await lot.locator("td").first().innerText()).trim();
  await lot.getByRole("link", { name: "Lịch sử" }).click();

  await expect(page).toHaveURL(/\/admin\/inventory\/batches\/[^/]+$/);
  await expect(page.getByRole("heading", { name: `Lô ${lotNo}` })).toBeVisible();
  await expect(page.getByTestId("ledger-row").first()).toBeVisible();
  // Tồn luỹ kế ở dòng ledger cuối = tổng tồn hiện tại theo vị trí.
  const last = await page.getByTestId("ledger-row").last().locator("td").nth(5).innerText();
  const balances = await page.getByTestId("balance-row").locator("td:last-child").allInnerTexts();
  expect(balances.reduce((s, x) => s + Number(x.replace(/,/g, "")), 0)).toBe(Number(last.replace(/,/g, "")));
});

test("ô số tổng + bộ lọc giữ trên URL; theo lô có phân trang", async ({ page }) => {
  test.setTimeout(90_000);
  await login(page, "kho@glow.local");
  await ensureLots(page, 30);
  await page.goto("/admin/inventory");
  await page.getByTestId("tile-blocked").click();
  await expect(page).toHaveURL(/expiry=blocked/);
  await expect(page.getByRole("combobox", { name: "Lọc theo hạn dùng" })).toHaveValue("blocked");

  await page.getByRole("combobox", { name: "Lọc theo loại tồn" }).selectOption("SELLABLE");
  await page.getByRole("button", { name: "Lọc", exact: true }).click();
  await expect(page).toHaveURL(/expiry=blocked/);
  await expect(page).toHaveURL(/stockType=SELLABLE/);

  await page.getByRole("link", { name: "Xoá lọc" }).click();
  await expect(page).toHaveURL(/\/admin\/inventory$/);

  // Tab theo kho (P24).
  await page.getByRole("navigation", { name: "Vị trí kho" }).getByRole("link", { name: /Kho Thắm/ }).click();
  await expect(page).toHaveURL(/tab=THAM/);

  // Theo lô: 25 dòng/trang (ensureLots bảo đảm > 25 dòng).
  await page.getByRole("link", { name: "Theo lô" }).click();
  await expect(page).toHaveURL(/\?tab=THAM&view=lots$/);
  await page.goto("/admin/inventory?view=lots");
  const info = page.getByTestId("page-info");
  await expect(info).toHaveText(/^1–25 \/ \d+$/);
  await page.getByRole("link", { name: "Sau ›" }).click();
  await expect(page).toHaveURL(/view=lots&page=2/);
  await expect(info).toHaveText(/^26–/);
});

test("nút Tạo phiếu chỉ hiện loại phiếu có quyền", async ({ page }) => {
  await login(page, "kho@glow.local");
  await page.goto("/admin/inventory");
  await page.getByText("Tạo phiếu").click();
  await page.getByRole("link", { name: "Nhập kho" }).click();
  await expect(page).toHaveURL(/\/admin\/inventory\/documents\/new\?type=RECEIVE$/);

  await login(page, "donhang@glow.local");
  await page.goto("/admin/inventory");
  await expect(page.getByTestId("tile-near")).toBeVisible();
  await expect(page.getByText("Tạo phiếu")).toHaveCount(0);
});
