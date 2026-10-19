import { expect, test } from "@playwright/test";
import { login } from "./helpers";

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
  await login(page, "kho@glow.local");
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

  // Tab vị trí.
  await page.getByRole("navigation", { name: "Vị trí kho" }).getByRole("link", { name: /Kho MM/ }).click();
  await expect(page).toHaveURL(/tab=MM_STOCK/);

  // Theo lô: 25 dòng/trang (DB test luôn có > 25 lô sau bộ integration + seed).
  await page.getByRole("link", { name: "Theo lô" }).click();
  await expect(page).toHaveURL(/\?tab=MM_STOCK&view=lots$/);
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
