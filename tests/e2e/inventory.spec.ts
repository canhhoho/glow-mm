import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";

const VARIANT = "SV-SUN-50 — Sunscreen SPF50 PA++++ (50ml)";

async function postAndExpect(page: Page) {
  await page.getByRole("button", { name: "Lưu nháp" }).click();
  await expect(page).toHaveURL(/\/admin\/inventory\/documents\/(?!new(?:\?|$))[^/?]+$/);
  await expect(page.getByText("Nháp", { exact: true }).filter({ visible: true })).toBeVisible();
  page.once("dialog", (d) => d.accept()); // xác nhận ghi sổ
  await page.getByRole("button", { name: "Ghi sổ" }).click();
  await expect(page.getByText("Đã ghi sổ", { exact: true }).filter({ visible: true })).toBeVisible();
}

test("quản lý kho: nhận → chuyển → xuất, tồn khớp theo lô và vị trí", async ({ page }) => {
  test.setTimeout(90_000); // ba phiếu liên tiếp; DB local có thể tích luỹ nhiều lô thử nghiệm
  const lot = `E2E${Date.now().toString(36).toUpperCase()}`;
  await login(page, "kho@glow.local");

  // 1) Nhập 10 vào kho VN
  await page.goto("/admin/inventory/documents/new?type=RECEIVE");
  await page.getByLabel("Chọn vị trí nhận").selectOption({ label: "VN-STOCK — Kho VN" });
  await page.getByLabel("Biến thể").selectOption({ label: VARIANT });
  await page.getByLabel("Số lô").fill(lot);
  await page.getByLabel("Hạn dùng").fill("2028-12-31");
  await page.getByLabel("Giá mua/đv (VND)").fill("90000");
  await page.getByLabel("Số lượng").fill("10");
  await postAndExpect(page);

  // 2) Chuyển 4 sang kho Yangon (chọn đúng lô vừa nhập)
  await page.goto("/admin/inventory/documents/new?type=TRANSFER");
  await page.getByLabel("Chọn vị trí xuất").selectOption({ label: "VN-STOCK — Kho VN" });
  await page.getByLabel("Chọn vị trí nhận").selectOption({ label: "MM-STOCK — Kho Yangon" });
  await page.getByLabel("Biến thể").selectOption({ label: VARIANT });
  await page.getByLabel("Lô").selectOption({ label: `${lot} · 2028-12-31 · 10` });
  await page.getByLabel("Số lượng").fill("4");
  await postAndExpect(page);

  // 3) Xuất 1 ở kho Yangon (hàng hỏng)
  await page.goto("/admin/inventory/documents/new?type=ISSUE");
  await page.getByLabel("Chọn vị trí xuất").selectOption({ label: "MM-STOCK — Kho Yangon" });
  await page.getByLabel("Lý do / ghi chú").fill("Hàng hỏng khi vận chuyển");
  await page.getByLabel("Biến thể").selectOption({ label: VARIANT });
  await page.getByLabel("Lô").selectOption({ label: `${lot} · 2028-12-31 · 4` });
  await page.getByLabel("Số lượng").fill("1");
  await postAndExpect(page);

  // 4) Tồn (xem theo lô): VN còn 6, Yangon còn 3
  await page.goto(`/admin/inventory?q=${lot}&view=lots`);
  const rows = page.getByRole("row").filter({ hasText: lot });
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: "VN-STOCK" })).toContainText("6");
  await expect(rows.filter({ hasText: "MM-STOCK" })).toContainText("3");
});

test("phiếu kho: lỗi server giữ lựa chọn; ghi sổ cần xác nhận; huỷ nháp", async ({ page }) => {
  test.setTimeout(60_000); // gồm lỗi server, lưu nháp và hai hộp xác nhận
  await login(page, "kho@glow.local");
  await page.goto("/admin/inventory/documents");
  await page.getByText("Tạo phiếu", { exact: true }).click(); // menu tạo phiếu có cả ở danh sách phiếu
  await page.getByRole("link", { name: "Chuyển kho" }).click();
  await expect(page).toHaveURL(/type=TRANSFER$/);

  // Vị trí đi = đến → server báo lỗi, các ô chọn giữ nguyên (không bị form reset về "—").
  const from = page.getByLabel("Chọn vị trí xuất");
  await from.selectOption({ label: "MM-STOCK — Kho Yangon" });
  await page.getByLabel("Chọn vị trí nhận").selectOption({ label: "MM-STOCK — Kho Yangon" });
  await page.getByLabel("Biến thể").selectOption({ label: VARIANT });
  await page.getByLabel("Số lượng").fill("1");
  await page.getByRole("button", { name: "Lưu nháp" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "khác nhau" })).toBeVisible({ timeout: 20_000 });
  await expect(from.locator("option:checked")).toHaveText("MM-STOCK — Kho Yangon");
  await expect(page.getByLabel("Biến thể").locator("option:checked")).toHaveText(VARIANT);

  await page.getByLabel("Chọn vị trí nhận").selectOption({ label: "VN-STOCK — Kho VN" });
  await page.getByRole("button", { name: "Lưu nháp" }).click();
  // Next giữ trang danh sách phiếu ẩn trong DOM (có badge "Nháp"/"Đã huỷ" của phiếu khác) → chỉ xét phần tử đang hiện.
  const shown = (text: string | RegExp) => page.getByText(text, { exact: typeof text === "string" }).filter({ visible: true });
  await expect(shown("Nháp")).toBeVisible();

  // Bấm "Ghi sổ" rồi từ chối hộp xác nhận → vẫn là nháp.
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "Ghi sổ" }).click();
  await expect(shown("Nháp")).toBeVisible();

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Huỷ phiếu" }).click();
  await expect(shown("Đã huỷ")).toBeVisible();
  await expect(shown(/không ảnh hưởng tồn kho/)).toBeVisible();
  await expect(shown(/Phiếu đã ghi sổ/)).toHaveCount(0);
});

test("nhân viên đơn hàng không tạo được phiếu nhập kho", async ({ page }) => {
  await login(page, "donhang@glow.local");
  await page.goto("/admin/inventory/documents/new?type=RECEIVE");
  await expect(page).toHaveURL(/\/admin\?denied=1$/);
});
