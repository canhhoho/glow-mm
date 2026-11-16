import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";

const SKU = "SV-SUN-50";
const VARIANT = `${SKU} — Sunscreen SPF50 PA++++ (50ml)`;

async function postAndExpect(page: Page) {
  await page.getByRole("button", { name: "Lưu nháp" }).click();
  await expect(page).toHaveURL(/\/admin\/inventory\/documents\/(?!new(?:\?|$))[^/?]+$/);
  await expect(page.getByText("Nháp", { exact: true }).filter({ visible: true })).toBeVisible();
  page.once("dialog", (d) => d.accept()); // xác nhận ghi sổ
  await page.getByRole("button", { name: "Ghi sổ" }).click();
  await expect(page.getByText("Đã ghi sổ", { exact: true }).filter({ visible: true })).toBeVisible();
}

test("quản lý kho: nhận → chuyển chờ kiểm tra → xuất, tồn khớp theo lô và kho", async ({ page }) => {
  test.setTimeout(90_000); // ba phiếu liên tiếp; DB local có thể tích luỹ nhiều lô thử nghiệm
  const lot = `E2E${Date.now().toString(36).toUpperCase()}`;
  await login(page, "kho@glow.local");

  // 1) Nhập 10 vào Kho Thắm — kho của SP (bảng nhập nhanh: lọc SKU, điền dòng)
  await page.goto("/admin/inventory/documents/new?type=RECEIVE");
  await page.getByLabel("Chọn vị trí nhận").selectOption({ label: "THAM — Kho Thắm" });
  await page.getByLabel("Tìm SKU, tên sản phẩm").fill(SKU);
  await page.getByRole("checkbox", { name: `Chọn ${SKU}`, exact: true }).check();
  await page.getByRole("button", { name: "Tiếp tục nhập thông số", exact: true }).click();
  await page.getByLabel(`Số lượng ${SKU}`, { exact: true }).fill("10");
  await page.getByLabel(`Số lô ${SKU}`, { exact: true }).fill(lot);
  await page.getByLabel(`Hạn dùng ${SKU}`, { exact: true }).fill("2028-12-31");
  await page.getByLabel(`Giá mua/đv (VND) ${SKU}`, { exact: true }).fill("90000");
  await postAndExpect(page);

  // 2) Chuyển 4 sang khu chờ kiểm tra (chọn đúng lô vừa nhập)
  await page.goto("/admin/inventory/documents/new?type=TRANSFER");
  await page.getByLabel("Chọn vị trí xuất").selectOption({ label: "THAM — Kho Thắm" });
  await page.getByLabel("Chọn vị trí nhận").selectOption({ label: "MM-QC — Chờ kiểm tra" });
  await page.getByLabel("Biến thể").selectOption({ label: VARIANT });
  await page.getByLabel("Lô").selectOption({ label: `${lot} · 2028-12-31 · 10` });
  await page.getByLabel("Số lượng").fill("4");
  await postAndExpect(page);

  // 3) Xuất 1 ở Kho Thắm (hàng hỏng)
  await page.goto("/admin/inventory/documents/new?type=ISSUE");
  await page.getByLabel("Chọn vị trí xuất").selectOption({ label: "THAM — Kho Thắm" });
  await page.getByLabel("Lý do / ghi chú").fill("Hàng hỏng khi vận chuyển");
  await page.getByLabel("Biến thể").selectOption({ label: VARIANT });
  await page.getByLabel("Lô").selectOption({ label: `${lot} · 2028-12-31 · 6` });
  await page.getByLabel("Số lượng").fill("1");
  await postAndExpect(page);

  // 4) Tồn (xem theo lô): Kho Thắm còn 5, chờ kiểm tra 4
  await page.goto(`/admin/inventory?q=${lot}&view=lots`);
  const rows = page.getByRole("row").filter({ hasText: lot });
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: "Kho Thắm" })).toContainText("5");
  await expect(rows.filter({ hasText: "Chờ kiểm tra" })).toContainText("4");
});

test("phiếu kho: lỗi server giữ lựa chọn; ghi sổ cần xác nhận; huỷ nháp", async ({ page }) => {
  test.setTimeout(90_000); // gồm lỗi server, lưu nháp, huỷ-và-tạo-lại và hai hộp xác nhận
  await login(page, "kho@glow.local");
  await page.goto("/admin/inventory/documents");
  const statusTabs = page.getByRole("navigation", { name: "Trạng thái", exact: true });
  await expect(statusTabs.getByRole("link")).toHaveCount(2);
  await expect(statusTabs.getByRole("link", { name: "Đã ghi sổ", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(statusTabs.getByRole("link", { name: "Nháp", exact: true })).toHaveAttribute("href", /status=DRAFT$/);
  await page.getByText("Tạo phiếu", { exact: true }).click(); // menu tạo phiếu có cả ở danh sách phiếu
  await page.getByRole("link", { name: "Chuyển kho" }).click();
  // Form chuyển kho tải mọi lô — DB test tích luỹ nhiều lô nên có thể > 5s.
  await expect(page).toHaveURL(/type=TRANSFER$/, { timeout: 20_000 });

  // Vị trí đi = đến → server báo lỗi, các ô chọn giữ nguyên (không bị form reset về "—").
  const from = page.getByLabel("Chọn vị trí xuất");
  await from.selectOption({ label: "THAM — Kho Thắm" });
  await page.getByLabel("Chọn vị trí nhận").selectOption({ label: "THAM — Kho Thắm" });
  await page.getByLabel("Biến thể").selectOption({ label: VARIANT });
  await page.getByLabel("Số lượng").fill("1");
  await page.getByRole("button", { name: "Lưu nháp" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "khác nhau" })).toBeVisible({ timeout: 20_000 });
  await expect(from.locator("option:checked")).toHaveText("THAM — Kho Thắm");
  await expect(page.getByLabel("Biến thể").locator("option:checked")).toHaveText(VARIANT);

  await page.getByLabel("Chọn vị trí nhận").selectOption({ label: "MM-QC — Chờ kiểm tra" });
  await page.getByRole("button", { name: "Lưu nháp" }).click();
  // Next giữ trang danh sách phiếu ẩn trong DOM (có badge "Nháp"/"Đã huỷ" của phiếu khác) → chỉ xét phần tử đang hiện.
  const shown = (text: string | RegExp) => page.getByText(text, { exact: typeof text === "string" }).filter({ visible: true });
  await expect(shown("Nháp")).toBeVisible();
  const draftPath = new URL(page.url()).pathname;

  // Xem trước khi ghi sổ: số dòng, tăng/giảm, tồn hiện tại → dự kiến ở kho đi và kho đến.
  const preview = page.getByTestId("post-preview").filter({ visible: true });
  await expect(preview).toBeVisible();
  await expect(preview.getByTestId("preview-summary")).toContainText("1 dòng");
  await expect(preview.getByTestId("preview-row")).toHaveCount(2);
  await expect(preview).toContainText("Lưu nháp chưa đổi tồn kho");

  // Bấm "Ghi sổ" rồi từ chối hộp xác nhận → vẫn là nháp.
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "Ghi sổ" }).click();
  await expect(shown("Nháp")).toBeVisible();

  // "Huỷ và tạo lại" (#5): form mở sẵn dòng của phiếu nháp; lưu phiếu mới thì phiếu cũ thành "Đã huỷ".
  await page.getByRole("link", { name: "Huỷ và tạo lại" }).click();
  await expect(page).toHaveURL(/type=TRANSFER&from=/, { timeout: 20_000 });
  await expect(page.getByTestId("replacing-note")).toBeVisible();
  await expect(page.getByLabel("Biến thể").locator("option:checked")).toHaveText(VARIANT);
  await expect(page.getByLabel("Số lượng")).toHaveValue("1");
  await page.getByLabel("Số lượng").fill("2");
  await page.getByRole("button", { name: "Lưu nháp" }).click();
  await expect(page).toHaveURL(/\/admin\/inventory\/documents\/(?!new)[^/?]+$/, { timeout: 20_000 });
  const newPath = new URL(page.url()).pathname;
  expect(newPath).not.toBe(draftPath);
  await page.goto(draftPath);
  await expect(shown("Đã huỷ")).toBeVisible();
  await page.goto(newPath);
  await expect(shown("Nháp")).toBeVisible();

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Huỷ phiếu" }).click();
  await expect(shown("Đã huỷ")).toBeVisible();
  await expect(shown(/không ảnh hưởng tồn kho/)).toBeVisible();
  await expect(shown(/Phiếu đã ghi sổ/)).toHaveCount(0);
  await page.goto("/admin/inventory/documents?status=DRAFT");
  await expect(page.getByRole("link").filter({ hasText: "Đã huỷ" })).toHaveCount(0);
  await expect(page.locator(`a[href="${draftPath}"]`)).toHaveCount(0);
  await expect(page.locator(`a[href="${newPath}"]`)).toHaveCount(0);
});

test("phiếu nhập: dán từ Excel điền nhiều dòng, báo dòng lỗi, dòng thiếu hạn bị chặn", async ({ page }) => {
  test.setTimeout(60_000);
  const lot = `PX${Date.now().toString(36).toUpperCase()}`;
  await login(page, "kho@glow.local");
  await page.goto("/admin/inventory/documents/new?type=RECEIVE");
  await page.getByLabel("Chọn vị trí nhận").selectOption({ label: "THAM — Kho Thắm" });

  await page.getByRole("checkbox", { name: `Chọn ${SKU}`, exact: true }).check();
  await page.getByRole("button", { name: "Tiếp tục nhập thông số", exact: true }).click();
  // Chuyến hàng + cước tạm tính đang tắt (`lib/features.ts`).
  await expect(page.getByLabel("Cước tạm tính VN → MM (MMK/kg)")).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Chuyến hàng", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Dán từ Excel" }).click();
  await page.getByRole("textbox", { name: "Dán từ Excel" }).fill(
    `SKU\tSL\tLô\tHSD\tGiá\n${SKU}\t3\t${lot}\t31/12/2028\t90,000\n${SKU}\t2\t${lot}B\t\t90000\nKHONG-CO\t1\tX\t2028-01-01\t1`,
  );
  await page.getByRole("button", { name: "Điền vào bảng" }).click();
  await expect(page.getByText("Đã điền 2 dòng vào bảng.")).toBeVisible();
  await expect(page.getByText('Dòng 4: không có SKU "KHONG-CO"')).toBeVisible();
  await expect(page.getByText(/^2 dòng · tổng SL 5/)).toBeVisible();

  // Dòng lô thứ 2 thiếu hạn dùng → chặn ở client, không gửi.
  await page.getByRole("button", { name: "Lưu nháp" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "1 dòng thiếu" })).toBeVisible();
  await expect(page).toHaveURL(/type=RECEIVE$/);

  await page.getByLabel(`Hạn dùng ${SKU}`, { exact: true }).nth(1).fill("2029-06-30");
  await page.getByRole("button", { name: "Lưu nháp" }).click();
  await expect(page).toHaveURL(/\/admin\/inventory\/documents\/(?!new(?:\?|$))[^/?]+$/);
  await expect(page.getByText(lot, { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByText(`${lot}B`, { exact: true }).filter({ visible: true })).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Huỷ phiếu" }).click(); // không để lại tồn thử nghiệm
  await expect(page.getByText("Đã huỷ", { exact: true }).filter({ visible: true })).toBeVisible();
});

test("nhân viên đơn hàng không tạo được phiếu nhập kho", async ({ page }) => {
  await login(page, "donhang@glow.local");
  await page.goto("/admin/inventory/documents/new?type=RECEIVE");
  await expect(page).toHaveURL(/\/admin\?denied=1$/);
});

test("form chuyển kho: đổi kho xuất thì bỏ chọn lô không còn hàng ở kho mới và báo lại", async ({ page }) => {
  await login(page, "kho@glow.local");
  await page.goto("/admin/inventory/documents/new?type=TRANSFER");
  const from = page.getByLabel("Chọn vị trí xuất");
  await from.selectOption({ label: "THAM — Kho Thắm" });
  await page.getByLabel("Biến thể").selectOption({ label: VARIANT });
  const batch = page.locator('select[name="batch-0"]');
  expect(await batch.locator("option").count()).toBeGreaterThan(1); // có lô còn hàng ở Kho Thắm
  await batch.selectOption({ index: 1 });
  await expect(batch).not.toHaveValue("");

  // Thử lần lượt các kho xuất khác: ít nhất một kho không còn lô này → lô bị bỏ chọn kèm thông báo.
  const values = await from.locator("option").evaluateAll((os) => (os as HTMLOptionElement[]).map((o) => o.value).filter(Boolean));
  let cleared = false;
  for (const v of values) {
    await from.selectOption(v);
    if (await page.getByTestId("lots-cleared").isVisible()) {
      cleared = true;
      await expect(batch).toHaveValue("");
      break;
    }
    await from.selectOption({ label: "THAM — Kho Thắm" });
    await batch.selectOption({ index: 1 });
  }
  expect(cleared).toBe(true);
});
