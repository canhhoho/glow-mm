import { expect, test } from "@playwright/test";
import { login, openProductEdit, openProductSettings } from "./helpers";

// Bước 1 "Tạo sản phẩm" (QT1a): form 5 ô — tên · thương hiệu · danh mục · kho (khi > 1 kho) · phân loại. Giá đặt ở bước 3.

test("sao chép từ SP cũ: điền sẵn, không chép giá, tạo SP mới và giữ nguyên nguồn", async ({ page }) => {
  test.setTimeout(90_000);
  const sourceSlug = "sen-viet-sunscreen-spf50";
  await login(page, "admin@glow.local");
  await page.goto(`/admin/products?q=${sourceSlug}`);
  await page.getByRole("row", { name: new RegExp(sourceSlug) }).getByRole("link", { name: /^Sửa / }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[^/?]+$/);
  const originalUrl = page.url();
  const sourceId = new URL(originalUrl).pathname.split("/").pop()!;
  await openProductEdit(page);
  const originalName = await page.getByRole("textbox", { name: "Tên tiếng Anh", exact: true }).inputValue();
  await openProductSettings(page);
  const originalSku = await page.getByRole("textbox", { name: "SKU", exact: true }).first().inputValue();

  await page.goto("/admin/products/new");
  // Khối sao chép đóng sẵn trên trang Tạo mới.
  await page.locator("summary").filter({ hasText: "Sao chép từ sản phẩm cũ" }).click();
  await page.getByRole("combobox", { name: "Sản phẩm nguồn", exact: true }).selectOption(sourceId);
  await page.getByRole("button", { name: "Nạp thông tin", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`copyFrom=${sourceId}`));
  const form = page.getByTestId("product-create-form");
  const name = form.getByRole("textbox", { name: "Tên sản phẩm", exact: true });
  await expect(name).toHaveValue(originalName);
  // Không còn ô giá / slug / SKU / hiển thị ở bước 1.
  await expect(form.getByRole("spinbutton")).toHaveCount(0);
  await expect(form.getByRole("checkbox")).toHaveCount(0);
  await name.fill(`Copy ${originalName}`);
  await form.getByRole("button", { name: "Tạo sản phẩm", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[^/?]+\?created=1$/);
  expect(page.url().split("?")[0]).not.toBe(originalUrl.split("?")[0]);
  await expect(page.getByTestId("step-price-row").first()).toContainText("0");
  await expect(page.getByRole("textbox", { name: "Tên tiếng Anh", exact: true })).toHaveValue(`Copy ${originalName}`);

  await page.goto(originalUrl);
  await openProductEdit(page);
  await expect(page.getByRole("textbox", { name: "Tên tiếng Anh", exact: true })).toHaveValue(originalName);
  await openProductSettings(page);
  await expect(page.getByRole("textbox", { name: "SKU", exact: true }).first()).toHaveValue(originalSku);
});

test("tạo SP có phân loại: mã tự sinh, giá 0, thanh 5 bước chỉ tới Nhập kho", async ({ page }) => {
  const tag = Date.now();
  await login(page, "admin@glow.local");
  await page.goto("/admin/products/new");
  const form = page.getByTestId("product-create-form");
  await form.getByRole("textbox", { name: "Tên sản phẩm", exact: true }).fill(`Túi Đỏ Dior ${tag}`);
  await form.getByRole("combobox", { name: "Thương hiệu", exact: true }).fill(`E2E Brand ${tag}`);
  await form.getByRole("combobox", { name: "Danh mục", exact: true }).selectOption({ index: 1 });
  const labels = form.getByRole("textbox", { name: "Phân loại (màu / dung tích)", exact: true });
  await labels.fill("Đỏ");
  await labels.press("Enter");
  await labels.fill("Hồng,");
  await expect(form.getByTestId("variant-label-chip")).toHaveCount(2);
  await form.getByRole("button", { name: "Tạo sản phẩm", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[^/?]+\?created=1$/);

  const steps = page.getByTestId("product-steps");
  await expect(steps.getByTestId("step-create")).toHaveAttribute("data-state", "warn"); // chưa có ảnh/mô tả
  await expect(steps.getByTestId("step-stock")).toHaveAttribute("data-state", "todo");
  await expect(steps.getByRole("link", { name: /Nhập kho/ })).toHaveAttribute("aria-current", "step");
  await expect(steps.getByTestId("step-publish")).toHaveAttribute("data-state", "waiting");
  await expect(page.getByTestId("step-price-row")).toHaveCount(2);
  await expect(page.getByTestId("step-publish-block")).toContainText("Hoàn thành các bước trước");

  await openProductSettings(page);
  await expect(page.getByRole("textbox", { name: "Slug (URL)", exact: true })).toHaveValue(`tui-do-dior-${tag}`);
  const skus = page.getByRole("textbox", { name: "SKU", exact: true });
  await expect(skus.nth(0)).toHaveValue(new RegExp(`^TUI-DO-DIOR-${tag}-0[12]$`));
  await page.screenshot({ path: "test-results/screens/product-steps.png", fullPage: true });
});

test("tạo SP chỉ với tên Myanmar (thêm tên tiếng khác) và thương hiệu gõ mới", async ({ page }) => {
  const tag = Date.now();
  await login(page, "admin@glow.local");
  await page.goto("/admin/products/new");
  const form = page.getByTestId("product-create-form");
  await form.getByRole("button", { name: "+ Thêm Tên tiếng Myanmar", exact: true }).click();
  await form.getByRole("textbox", { name: "Tên tiếng Myanmar", exact: true }).fill(`ဆပ်ပြာ ${tag}`);
  await form.getByRole("combobox", { name: "Thương hiệu", exact: true }).fill(`E2E Brand ${tag}`);
  await expect(form.getByText("Thương hiệu mới — sẽ được tạo khi lưu")).toBeVisible();
  await form.getByRole("combobox", { name: "Danh mục", exact: true }).selectOption({ index: 1 });
  await page.screenshot({ path: "test-results/screens/product-form-new.png", fullPage: true });
  await form.getByRole("button", { name: "Tạo sản phẩm", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[^/?]+\?created=1$/);
  await expect(page.getByRole("status").filter({ hasText: "Đã tạo sản phẩm" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Tên tiếng Anh", exact: true })).toHaveValue(`ဆပ်ပြာ ${tag}`);
  await expect(page.getByRole("combobox", { name: "Thương hiệu", exact: true })).toHaveValue(`E2E Brand ${tag}`);
});

test("tạo combo bằng nút riêng: chọn thành phần cùng kho", async ({ page }) => {
  const tag = Date.now();
  await login(page, "admin@glow.local");
  await page.goto("/admin/products");
  // P3: tạo combo nằm trong menu "Tạo khác" (⋯) cạnh nút Thêm sản phẩm.
  await page.getByLabel("Tạo khác", { exact: true }).click();
  await page.getByRole("link", { name: "Tạo combo", exact: true }).click();
  // Danh sách SP trên DB test tích luỹ nặng → chuyển trang có thể > 5s.
  await expect(page).toHaveURL(/\/admin\/products\/new\?type=combo$/, { timeout: 30_000 });
  const form = page.getByTestId("product-create-form");
  await form.getByRole("textbox", { name: "Tên sản phẩm", exact: true }).fill(`Bộ E2E ${tag}`);
  await form.getByRole("combobox", { name: "Thương hiệu", exact: true }).fill(`E2E Brand ${tag}`);
  await form.getByRole("combobox", { name: "Danh mục", exact: true }).selectOption({ index: 1 });
  await expect(form.getByRole("textbox", { name: "Phân loại (màu / dung tích)" })).toHaveCount(0);
  await form.getByRole("combobox", { name: "Thành phần combo 1", exact: true }).selectOption({ index: 1 });
  await form.getByRole("spinbutton", { name: "Số lượng 1", exact: true }).fill("2");
  await form.getByRole("button", { name: "Tạo combo", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[^/?]+\?created=1$/, { timeout: 30_000 });
  await expect(page.getByTestId("step-price-row")).toHaveCount(1);
  await expect(page.getByTestId("product-edit").getByText("Thành phần combo", { exact: true }).first()).toBeVisible();
});

test("QT1b/QT2: tạo SP → nhập hàng từ bước 2 (điền sẵn, khối lượng) → tính giá SP này → duyệt → bước 5 bật được", async ({ page }) => {
  test.setTimeout(150_000);
  const tag = Date.now();
  await login(page, "admin@glow.local");
  await page.goto("/admin/products/new");
  const form = page.getByTestId("product-create-form");
  await form.getByRole("textbox", { name: "Tên sản phẩm", exact: true }).fill(`Flow ${tag}`);
  await form.getByRole("combobox", { name: "Thương hiệu", exact: true }).fill(`E2E Brand ${tag}`);
  await form.getByRole("combobox", { name: "Danh mục", exact: true }).selectOption({ index: 1 });
  const wh = form.getByRole("combobox", { name: "Kho", exact: true });
  if (await wh.count()) await wh.selectOption((await wh.locator("option", { hasText: "(THAM)" }).getAttribute("value"))!);
  await form.getByRole("button", { name: "Tạo sản phẩm", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[^/?]+\?created=1$/);
  const productUrl = page.url().split("?")[0];
  const sku = (await page.getByTestId("step-price-row").first().locator("td").first().innerText()).trim();
  // Bước 1 không còn ô giá / hoa hồng; khối lượng nằm ở "Thiết lập khác".
  await expect(page.getByTestId("product-edit").getByRole("spinbutton", { name: /^Giá/ })).toHaveCount(0);

  // Bước 2: "Nhập hàng" mở phiếu nhập chỉ với SP này, chọn sẵn kho; khối lượng nhập ở phiếu.
  await page.locator("#step-stock").getByRole("link", { name: "Nhập hàng" }).click();
  await expect(page).toHaveURL(/documents\/new\?type=RECEIVE&product=/);
  await expect(page.getByTestId("receive-product-scope")).toContainText(`Flow ${tag}`);
  await expect(page.getByLabel("Chọn vị trí nhận")).toHaveValue(/.+/);
  await page.getByRole("button", { name: "Tiếp tục nhập thông số", exact: true }).click();
  await page.getByLabel(`Số lượng ${sku}`, { exact: true }).fill("5");
  await page.getByLabel(`Số lô ${sku}`, { exact: true }).fill(`F${tag}`);
  await page.getByLabel(`Hạn dùng ${sku}`, { exact: true }).fill("2029-12-31");
  await page.getByLabel(`Giá mua/đv (VND) ${sku}`, { exact: true }).fill("100000");
  await page.getByLabel(`Khối lượng (g) ${sku}`, { exact: true }).fill("150");
  await page.getByRole("button", { name: "Lưu nháp" }).click();
  await expect(page).toHaveURL(/\/admin\/inventory\/documents\/(?!new(?:\?|$))[^/?]+$/, { timeout: 30_000 });
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Ghi sổ" }).click();
  await expect(page.getByText("Đã ghi sổ", { exact: true }).filter({ visible: true })).toBeVisible();

  await page.goto(productUrl);
  const steps = page.getByTestId("product-steps");
  await expect(steps.getByTestId("step-stock")).toHaveAttribute("data-state", /done|warn/);
  await expect(page.getByTestId("issue-NO_WEIGHT")).toHaveCount(0);
  await expect(page.getByTestId("step-price-row").first()).toContainText("150 g");
  await expect(steps.getByRole("link", { name: /Giá bán/ })).toHaveAttribute("aria-current", "step");

  // Bước 3: "Tính tự động" → trang Giá bán (tự động) chỉ SP này → bảng tính giá → áp dụng.
  await page.getByTestId("price-actions").getByRole("link", { name: "Tính tự động" }).click();
  await expect(page).toHaveURL(/\/admin\/selling-prices\?mode=auto&productId=/);
  await expect(page.getByTestId("pricing-product-scope")).toContainText(`Flow ${tag}`);
  await page.getByLabel("% lãi").fill("40");
  await page.getByLabel("Phí ship VN → MM (MMK/kg)").fill("8000");
  await page.getByRole("button", { name: "Xem trước" }).click();
  await expect(page).toHaveURL(/\/admin\/pricing\/runs\//, { timeout: 30_000 });
  await expect(page.getByRole("table").getByRole("checkbox")).toHaveCount(1);
  page.once("dialog", (d) => d.accept());
  await expect(page.getByRole("checkbox", { name: "Gửi duyệt ngay" })).toBeChecked();
  await page.getByRole("button", { name: "Áp dụng giá đã chọn" }).click();
  // Hết dòng chờ → bản chuyển "Đã áp dụng", form áp dụng biến mất.
  await expect(page.getByRole("row").filter({ hasText: sku })).toContainText("Đã áp", { timeout: 30_000 });
  // Kết quả gửi duyệt vẫn hiện trên trang bản tính giá sau khi form áp giá biến mất.
  await expect(page.getByTestId("batch-review")).toContainText("Đã gửi duyệt 1 sản phẩm");

  await page.goto(productUrl);
  await expect(page.getByTestId("step-price-row").first()).toContainText("Bảng tính giá");
  await expect(steps.getByTestId("step-price")).toHaveAttribute("data-state", "done");
  // §6.4: ô "Gửi duyệt ngay" bật sẵn khi áp giá → SP đủ điều kiện đã vào hàng chờ duyệt; bước 5 chờ đến khi duyệt.
  await expect(page.getByTestId("approval-status")).toHaveAttribute("data-label", "PENDING");
  await expect(steps.getByTestId("step-publish")).toHaveAttribute("data-state", "waiting");
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("launch-check").getByRole("button", { name: "Chỉ duyệt (chưa đăng)" }).click();
  await expect(page.getByTestId("approval-status")).toContainText("Đã duyệt bởi", { timeout: 15_000 });
  await expect(steps.getByTestId("step-review")).toHaveAttribute("data-state", "done");
  await expect(steps.getByTestId("step-publish")).toHaveAttribute("data-state", "todo");
  await expect(page.getByTestId("step-publish-block").getByRole("button", { name: "Bật hiển thị trên web" })).toBeVisible();
});
