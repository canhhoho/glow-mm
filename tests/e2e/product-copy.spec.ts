import { expect, test } from "@playwright/test";
import { login, openProductEdit, openProductSettings, openProductTab } from "./helpers";

// Bước 1 "Tạo sản phẩm" (QT1a): form 5 ô — tên · thương hiệu · danh mục · kho (khi > 1 kho) · phân loại. Giá đặt ở bước 3.

test("sao chép từ SP cũ: điền sẵn, không chép giá, tạo SP mới và giữ nguyên nguồn", async ({ page }) => {
  test.setTimeout(90_000);
  const sourceSlug = "sen-viet-sunscreen-spf50";
  await login(page, "admin@glow.local");
  await page.goto(`/admin/products?q=${sourceSlug}`);
  await page.getByRole("row", { name: new RegExp(sourceSlug) }).getByRole("link", { name: /^Sửa / }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[^/?]+(?:\?from=.*)?$/);
  const originalUrl = page.url();
  const sourceId = new URL(originalUrl).pathname.split("/").pop()!;
  await openProductEdit(page);
  const originalName = await page.getByRole("textbox", { name: "Tên sản phẩm", exact: true }).inputValue();
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
  await openProductTab(page, "price");
  await expect(page.getByTestId("step-price-row").first()).toContainText("0");
  await openProductTab(page, "info");
  await expect(page.getByRole("textbox", { name: "Tên sản phẩm", exact: true })).toHaveValue(`Copy ${originalName}`);

  await page.goto(originalUrl);
  await openProductEdit(page);
  await expect(page.getByRole("textbox", { name: "Tên sản phẩm", exact: true })).toHaveValue(originalName);
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
  const labels = form.getByRole("textbox", { name: "Phân loại (dung tích/màu)", exact: true });
  await labels.fill("Đỏ");
  await labels.press("Enter");
  await labels.fill("Hồng,");
  await expect(form.getByTestId("variant-label-chip")).toHaveCount(2);
  await form.getByRole("button", { name: "Tạo sản phẩm", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[^/?]+\?created=1$/);

  const steps = page.getByTestId("product-steps");
  await expect(steps.getByTestId("step-create")).toHaveAttribute("data-state", "warn"); // chưa có ảnh/mô tả
  await expect(steps.getByTestId("step-stock")).toHaveAttribute("data-state", "todo");
  // 19/11/2026: bước 2 đổi tên "Kho bán & hàng" (đã nhập hàng hoặc bán đặt trước); SP mới chưa có kho → bước hiện tại.
  await expect(steps.getByRole("link", { name: /Kho bán & hàng/ })).toHaveAttribute("aria-current", "step");
  await expect(steps.getByTestId("step-publish")).toHaveAttribute("data-state", "waiting");
  await openProductTab(page, "price");
  await expect(page.getByTestId("step-price-row")).toHaveCount(2);
  // Cùng nhãn "Phân loại (dung tích/màu)" ở tab giá, form sửa và danh sách (dữ liệu tạo → lưu → hiển thị khớp).
  await expect(page.locator(`td[data-label="Phân loại (dung tích/màu)"]`)).toHaveText(["Đỏ", "Hồng"]);
  await expect(page.getByTestId("step-publish-block")).toContainText("Hoàn thành các bước trước");

  await openProductTab(page, "info");
  await openProductSettings(page);
  await expect(page.getByRole("textbox", { name: "Slug (URL)", exact: true })).toHaveValue(`tui-do-dior-${tag}`);
  const skus = page.getByRole("textbox", { name: "SKU", exact: true });
  // SKU tự sinh ngắn (18/11/2026): 3 chữ đầu + chữ cái đầu các từ + mã số (tối đa 8 ký tự); trùng → thêm -2.
  await expect(skus.nth(0)).toHaveValue(new RegExp(`^TUI-DD${String(tag).slice(0, 8)}-0[12](-\\d+)?$`));
  const variantLabels = page.getByRole("textbox", { name: "Phân loại (dung tích/màu)", exact: true });
  await expect(variantLabels).toHaveCount(2);
  await expect(variantLabels.nth(0)).toHaveValue("Đỏ");
  await expect(variantLabels.nth(1)).toHaveValue("Hồng");
  await expect(page.getByRole("button", { name: "Thêm phân loại", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/screens/product-steps.png", fullPage: true });

  await page.goto(`/admin/products?q=${tag}`);
  const listCell = page.locator(`td[data-label="Phân loại (dung tích/màu)"]`);
  await expect(listCell).toHaveCount(1);
  await expect(listCell).toContainText("+1 phân loại khác");
  await page.screenshot({ path: "test-results/screens/product-list-variant.png", fullPage: true });
});

test("tạo SP: một ô tên (gõ chữ Myanmar được) và thương hiệu gõ mới", async ({ page }) => {
  const tag = Date.now();
  await login(page, "admin@glow.local");
  await page.goto("/admin/products/new");
  const form = page.getByTestId("product-create-form");
  // Đợt 3 (16/11/2026): không còn ô tên riêng từng ngôn ngữ.
  await expect(form.getByRole("textbox", { name: "Tên tiếng Myanmar", exact: true })).toHaveCount(0);
  await form.getByRole("textbox", { name: "Tên sản phẩm", exact: true }).fill(`ဆပ်ပြာ ${tag}`);
  await form.getByRole("combobox", { name: "Thương hiệu", exact: true }).fill(`E2E Brand ${tag}`);
  await expect(form.getByText("Thương hiệu mới — sẽ được tạo khi lưu")).toBeVisible();
  await form.getByRole("combobox", { name: "Danh mục", exact: true }).selectOption({ index: 1 });
  await page.screenshot({ path: "test-results/screens/product-form-new.png", fullPage: true });
  await form.getByRole("button", { name: "Tạo sản phẩm", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[^/?]+\?created=1$/);
  await expect(page.getByRole("status").filter({ hasText: "Đã tạo sản phẩm" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Tên sản phẩm", exact: true })).toHaveValue(`ဆပ်ပြာ ${tag}`);
  await expect(page.getByRole("combobox", { name: "Thương hiệu", exact: true })).toHaveValue(`E2E Brand ${tag}`);
  // Một phân loại: để trống ô phân loại khi tạo → một dòng "Tiêu chuẩn".
  const variantLabels = page.getByRole("textbox", { name: "Phân loại (dung tích/màu)", exact: true });
  await expect(variantLabels).toHaveCount(1);
  await expect(variantLabels).toHaveValue("Tiêu chuẩn");
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
  await expect(form.getByRole("textbox", { name: "Phân loại (dung tích/màu)" })).toHaveCount(0);
  await form.getByRole("combobox", { name: "Thành phần combo 1", exact: true }).selectOption({ index: 1 });
  await form.getByRole("spinbutton", { name: "Số lượng 1", exact: true }).fill("2");
  await form.getByRole("button", { name: "Tạo combo", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[^/?]+\?created=1$/, { timeout: 30_000 });
  await openProductTab(page, "price");
  await expect(page.getByTestId("step-price-row")).toHaveCount(1);
  await openProductTab(page, "info");
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
  await openProductTab(page, "price");
  const sku = (await page.getByTestId("step-price-row").first().locator("td").first().innerText()).trim();
  // Bước 1 không còn ô giá / hoa hồng; khối lượng nằm ở "Thiết lập khác".
  await expect(page.getByTestId("product-edit").getByRole("spinbutton", { name: /^Giá/ })).toHaveCount(0);

  // Bước 2: "Nhập hàng" mở phiếu nhập chỉ với SP này, chọn sẵn kho; khối lượng nhập ở phiếu.
  await openProductTab(page, "stock");
  await page.locator("#step-stock").getByRole("link", { name: "Nhập hàng" }).click();
  await expect(page).toHaveURL(/documents\/new\?type=RECEIVE&product=/);
  await expect(page.getByTestId("receive-product-scope")).toContainText(`Flow ${tag}`);
  await page.getByRole("button", { name: "Tiếp tục nhập thông số", exact: true }).click();
  await expect(page.getByLabel(`Kho ${sku}`, { exact: true })).toHaveValue(/.+/); // gợi ý kho bán hàng nhập VN, đổi được ở đây
  await page.getByLabel(`Số lượng ${sku}`, { exact: true }).fill("5");
  await page.getByLabel(`Số lô ${sku}`, { exact: true }).fill(`F${tag}`);
  await page.getByLabel(`Giá mua/đv (VND) ${sku}`, { exact: true }).fill("100000");
  await page.getByLabel(`Khối lượng (g) ${sku}`, { exact: true }).fill("150");
  await page.getByRole("button", { name: "Lưu nháp" }).click();
  await expect(page).toHaveURL(/\/admin\/inventory\/documents\/(?!new(?:\?|$))[^/?]+$/, { timeout: 30_000 });
  await expect(page.getByTestId("post-preview")).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Ghi sổ" }).click();
  await expect(page.getByText("Đã ghi sổ", { exact: true }).filter({ visible: true })).toBeVisible();
  // Phiếu nhập đã ghi sổ: người có quyền giá thấy giá mua / tỷ giá / phí về kho của lần nhập; xem trước biến mất.
  await expect(page.getByTestId("line-cost").first()).toContainText("100,000 VND");
  await expect(page.getByTestId("post-preview")).toHaveCount(0);

  await page.goto(productUrl);
  const steps = page.getByTestId("product-steps");
  await expect(steps.getByTestId("step-stock")).toHaveAttribute("data-state", /done|warn/);
  await expect(page.getByTestId("issue-NO_WEIGHT")).toHaveCount(0);
  await openProductTab(page, "price");
  await expect(page.getByTestId("step-price-row").first()).toContainText("150 g");
  await expect(steps.getByRole("link", { name: /Giá bán/ })).toHaveAttribute("aria-current", "step");

  // Bước 3: "Đặt giá" → trang Giá bán thủ công chỉ SP này → lãi + vận chuyển + CTV → lưu (giá tự động đang tắt).
  await expect(page.getByTestId("price-actions").getByRole("link", { name: "Tính tự động" })).toHaveCount(0);
  await page.getByTestId("price-actions").getByRole("link", { name: "Đặt giá" }).click();
  await expect(page).toHaveURL(/\/admin\/selling-prices\/manual\?productId=/);
  const vnd = page.getByTestId("manual-vnd");
  const line = vnd.getByTestId("manual-row").first();
  await expect(line).toContainText("100,000"); // giá mua NCC của lần nhập vừa ghi sổ
  await line.getByRole("button", { name: "Sửa giá" }).click(); // 17/11/2026: chỉ dòng bấm "Sửa giá" mới sửa/lưu
  await line.getByRole("spinbutton", { name: /^Lãi/ }).fill("40000");
  await line.getByRole("spinbutton", { name: /^Vận chuyển/ }).fill("1200");
  await line.getByRole("spinbutton", { name: /^CTV/ }).fill("1000");
  await expect(vnd.getByRole("checkbox", { name: "Gửi duyệt ngay" })).toBeChecked();
  await vnd.getByRole("button", { name: /^Lưu giá/ }).click();
  await expect(vnd.getByText(/Đã áp dụng 1 giá/)).toBeVisible({ timeout: 30_000 });

  await page.goto(productUrl);
  await openProductTab(page, "price");
  await expect(page.getByTestId("step-price-row").first()).toContainText("Sửa tay");
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

  // SP một loại (nhãn hệ thống "Tiêu chuẩn" do admin tạo): web khách không hiện chữ tiếng Việt này, không bắt chọn loại.
  await page.getByTestId("step-publish-block").getByRole("button", { name: "Bật hiển thị trên web" }).click();
  await expect(page.getByTestId("step-publish-block")).toContainText("Đang hiển thị trên web", { timeout: 15_000 });
  const slug = `flow-${tag}`;
  for (const path of [`/en/p/${slug}`, `/p/${slug}`, `/vi/p/${slug}`]) {
    await page.goto(path);
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 1 })).toHaveText(`Flow ${tag}`);
    await expect(main.getByTestId("single-variant")).toBeVisible();
    await expect(main.getByRole("radio")).toHaveCount(0);
    await expect(main).not.toContainText("Tiêu chuẩn");
  }
  await page.screenshot({ path: "test-results/screens/storefront-single-variant-vi.png", fullPage: true });
  await page.goto(`/en/p/${slug}`);
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page).toHaveURL(/\/en\/cart$/); // thêm giỏ xong tự chuyển sang giỏ
  await expect(page.getByRole("main")).toContainText(`Flow ${tag}`);
  await expect(page.getByRole("main")).not.toContainText("Tiêu chuẩn");
});
