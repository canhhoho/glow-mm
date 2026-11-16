import { expect, test, type Locator, type Page } from "@playwright/test";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import pg from "pg";

export const PASSWORD = process.env.SEED_STAFF_PASSWORD!;

/**
 * Xoá bộ đếm chống dò mật khẩu (10 lần đăng nhập/phút/IP) trên DB test —
 * bộ E2E đổi vai trò nhiều lần trong một phút. Chỉ chạy với DATABASE_URL của .env.test (glow_test).
 */
async function resetLoginRateLimit() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('DELETE FROM "rateLimit"');
    await client.query('DELETE FROM "customerRateLimit"');
    await client.query('DELETE FROM "appRateLimit"');
  } finally {
    await client.end();
  }
}

/** Đăng nhập admin bằng tài khoản seed (*@glow.local). Xoá phiên cũ trước để đổi vai trò được. */
export async function login(page: Page, email: string, password = PASSWORD) {
  await resetLoginRateLimit();
  await page.context().clearCookies();
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  // Dashboard stream số liệu từ DB test tích lũy; chờ nội dung, không chỉ HTTP 200 của shell.
  await expect(page.getByTestId("role")).toBeVisible({ timeout: 20_000 });
}

/** Đăng nhập cổng CTV (P10c) bằng CTV seed; ép giao diện tiếng Việt (mặc định của cổng CTV là tiếng Myanmar). */
export async function loginCtv(page: Page, email = "ctv@glow.local", password = PASSWORD) {
  await resetLoginRateLimit();
  await page.context().clearCookies();
  const base = test.info().project.use.baseURL ?? process.env.APP_URL;
  await page.context().addCookies([{ name: "CTV_LOCALE", value: "vi", url: `${base}/ctv` }]);
  await page.goto("/ctv/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.getByTestId("ctv-user")).toBeVisible();
}

/** Menu admin; trên mobile mở ngăn kéo (nút ☰) trước nếu đang đóng. */
export async function openAdminNav(page: Page) {
  const nav = page.getByRole("navigation", { name: "Admin" });
  const toggle = page.getByRole("button", { name: "Mở menu" });
  if ((await toggle.isVisible()) && (await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await expect(nav).toBeVisible();
  return nav;
}

/** Trang SP (bước 1): mở khối "Sửa thông tin sản phẩm" nếu đang đóng (SP đã đăng bán thì đóng sẵn). */
export async function openProductEdit(page: Page) {
  const summary = page.locator("summary:visible").filter({ hasText: "Sửa thông tin sản phẩm" });
  if (!(await summary.evaluate((el) => el.parentElement?.hasAttribute("open")))) await summary.click();
}

/** Form SP: mở khối "Thiết lập khác" (slug, SKU, kho, hạn dùng) nếu đang đóng. */
export async function openProductSettings(page: Page) {
  if (await page.locator("summary:visible").filter({ hasText: "Sửa thông tin sản phẩm" }).count()) await openProductEdit(page);
  // :visible — sau khi lưu, Next giữ trang trước ở dạng ẩn nên có thể có 2 form trong DOM.
  const summary = page.locator("summary:visible").filter({ hasText: "Thiết lập khác" });
  if (!(await summary.evaluate((el) => el.parentElement?.hasAttribute("open")))) await summary.click();
}

/** Trang chi tiết đơn: mở khối thu gọn (`order-return` | `order-deliveries` | `order-documents` | `order-history`) nếu đang đóng. */
export async function openOrderSection(page: Page, testId: "order-return" | "order-deliveries" | "order-documents" | "order-history") {
  const summary = page.getByTestId(testId).filter({ visible: true }).locator("summary");
  if (!(await summary.evaluate((el) => el.parentElement?.hasAttribute("open")))) await summary.click();
}

/** Trang SP: mở tab (info | stock | price | history) giữ nguyên các tham số khác (vd. `from`). Đã ở đúng tab thì bỏ qua. */
export async function openProductTab(page: Page, tab: "info" | "stock" | "price" | "history") {
  const url = new URL(page.url());
  if ((url.searchParams.get("tab") ?? "info") === tab && !url.hash) return;
  if (tab === "info") url.searchParams.delete("tab");
  else url.searchParams.set("tab", tab);
  url.hash = "";
  await page.goto(url.toString());
}

/** Tab Giá bán của trang SP: giá ĐANG BÁN của từng biến thể (theo thứ tự trên trang). */
export async function livePrices(page: Page): Promise<number[]> {
  await openProductTab(page, "price");
  return (await page.getByTestId("step-price-value").filter({ visible: true }).allInnerTexts()).map((t) => Number(t.replace(/\D/g, "")));
}

/** Trang SP bước 3: SKU của từng biến thể (theo thứ tự trên trang). */
export async function variantSkus(page: Page): Promise<string[]> {
  await openProductTab(page, "price");
  return page.getByTestId("step-price-row").filter({ visible: true }).locator("td:first-child span.font-mono").allInnerTexts();
}

/**
 * Đặt giá TRỰC TIẾP cho các biến thể của SP đang mở (16/11): bước 3 không còn form giá; giá nhập thẳng đi qua Excel
 * (trang Giá bán thủ công của kho VND tính theo công thức, và đặt hoa hồng cố định — không dùng để trả giá seed).
 * `prices[i]` = biến thể thứ i; bỏ trống = giữ nguyên. Không "Gửi duyệt ngay". Quay lại trang SP khi xong.
 */
export async function setPrices(page: Page, prices: (number | string | undefined)[]) {
  const productUrl = page.url();
  const skus = await variantSkus(page);
  const rows = prices.flatMap((p, i) => (p !== undefined ? [[skus[i], String(p)]] : []));
  // Cột tên / thương hiệu / danh mục bắt buộc có mặt ở dòng tiêu đề (để trống với SKU có sẵn).
  const csv = ["sku,name_en,brand,category,price_mmk", ...rows.map(([sku, price]) => `${sku},,,,${price}`)].join("\n");
  // Mọi file đã xác nhận được ghi dấu (nhập lại đúng file bị chặn) — DB test: xoá dấu để file giống hệt lần chạy trước không bị chặn.
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('DELETE FROM "CatalogOpeningImport"');
  } finally {
    await client.end();
  }
  await page.goto("/admin/products/import");
  await page.getByLabel("File Excel nhập sản phẩm", { exact: true }).setInputFiles({ name: `gia-${Date.now()}.csv`, mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByRole("button", { name: "Xem trước", exact: true }).click();
  const preview = page.getByTestId("catalog-import-preview");
  await expect(preview).toBeVisible({ timeout: 30_000 });
  const submit = preview.getByRole("checkbox", { name: "Gửi duyệt ngay" });
  if (await submit.count()) await submit.uncheck();
  await preview.getByRole("button", { name: "Xác nhận nhập", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Đã nhập" })).toBeVisible({ timeout: 30_000 });
  await page.goto(productUrl);
}

/**
 * P1-A: SP đã duyệt → thay đổi nội dung / giá / ảnh nằm ở bản đang sửa. Trên trang SP: Gửi duyệt → Duyệt thay đổi
 * (có xác nhận), chờ đến khi không còn bản đang sửa.
 */
export async function approveChanges(page: Page) {
  const check = page.getByTestId("launch-check").filter({ visible: true });
  const status = check.getByTestId("approval-status");
  // Không có bản đang sửa (thay đổi trùng giá trị đang bán) → không có gì để duyệt.
  if ((await status.getAttribute("data-change")) === "") return;
  // §6.4: lượt nhập Excel / áp bảng tính giá có thể đã "Gửi duyệt ngay" → bỏ bước gửi.
  if ((await status.getAttribute("data-change")) !== "PENDING") {
    await check.getByRole("button", { name: "Gửi duyệt", exact: true }).click();
    await expect(status).toHaveAttribute("data-change", "PENDING", { timeout: 15_000 });
  }
  page.once("dialog", (d) => d.accept());
  await check.getByRole("button", { name: "Duyệt thay đổi", exact: true }).click();
  await expect(status).toHaveAttribute("data-change", "", { timeout: 15_000 });
}

/** Open a top-level accordion without changing the state of other menu groups. */
export async function openAdminGroup(page: Page, label: string) {
  const nav = await openAdminNav(page);
  const summary = nav.locator(":scope > details > summary").filter({ has: page.getByText(label, { exact: true }) });
  if (!(await summary.evaluate(el => el.parentElement?.hasAttribute("open")))) await summary.click();
  return nav;
}

/** PNG đặc một màu size×size (đủ lớn để bộ tối ưu ảnh/next/image và trình duyệt giải mã bình thường). */
export function solidPng(size: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => [232, 101, 122]).flat())]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Link trong email mới nhất gửi tới `to` (EMAIL_DRIVER=outbox — playwright.config đặt EMAIL_OUTBOX_DIR tuyệt đối). */
export async function emailLink(to: string, since = 0): Promise<string> {
  const dir = process.env.EMAIL_OUTBOX_DIR!;
  let found: string | undefined;
  await expect
    .poll(
      async () => {
        const files = (await readdir(dir).catch(() => [] as string[]))
          .filter((f) => f.endsWith(`-${to}.json`) && Number(f.split("-")[0]) >= since)
          .sort();
        found = files.at(-1);
        return !!found;
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  const mail = JSON.parse(await readFile(path.join(dir, found!), "utf8")) as { text: string };
  return mail.text.match(/https?:\/\/\S+/)![0];
}

export const CUSTOMER_PASSWORD = "e2e-customer-pass-1";

/** Đăng ký khách mới bằng email (giao diện tiếng Anh) + mở link xác minh → đã đăng nhập, đang ở `next`. */
export async function registerCustomer(page: Page, next = "/en/account") {
  await resetLoginRateLimit();
  const email = `e2e-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@glow.local`;
  const since = Date.now();
  await page.goto(`/en/register?next=${encodeURIComponent(next)}`);
  // Mặc định là form SĐT (P17); form email nằm trong mục "Register with email instead".
  await page.getByText("Register with email instead").click();
  const form = page.locator("details");
  await form.getByLabel("Full name").fill("Ma E2E");
  await form.getByLabel("Email").fill(email);
  await form.getByLabel("Password", { exact: true }).fill(CUSTOMER_PASSWORD);
  await form.getByLabel("Confirm password").fill(CUSTOMER_PASSWORD);
  await form.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(`We sent a confirmation link to ${email}`)).toBeVisible();
  await page.goto(await emailLink(email, since));
  // Link xác minh → /login (đã có phiên) → trang `next` (chuyển hướng phía client sau khi trang stream xong).
  await page.waitForURL((u) => u.pathname === next);
  return email;
}

/** Đăng nhập khách bằng email trên /en/login. */
export async function loginCustomer(page: Page, email: string, password = CUSTOMER_PASSWORD, next = "/en/account") {
  await resetLoginRateLimit();
  await page.goto(`/en/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

/**
 * Đang ở trang đăng nhập khách do bị chặn (vd bấm Checkout khi chưa đăng nhập — P14c): đăng nhập bằng khách seed
 * rồi chờ quay lại trang đích (`?next=`). Giỏ hàng + cookie CTV giữ nguyên qua bước này.
 */
export async function signInAtPrompt(page: Page, email = "khach@glow.local", password = PASSWORD) {
  await resetLoginRateLimit();
  await expect(page).toHaveURL(/\/login\?next=/);
  const next = decodeURIComponent(new URL(page.url()).searchParams.get("next")!);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => u.pathname === next);
}

/** Chọn địa chỉ VTP 3 cấp (P15) trong form storefront tiếng Anh — mặc định Yangon → Yangon (West) → Kamaryut. */
export async function pickAddress(scope: Page | Locator, path = { state: "Yangon", district: "Yangon (West)", township: "Kamaryut" }) {
  await scope.getByLabel("State / Region").selectOption({ label: path.state });
  await scope.getByLabel("District").selectOption({ label: path.district });
  await scope.getByLabel("Township").selectOption({ label: path.township });
}

/** Như trên cho form tạo đơn admin / cổng CTV (giao diện tiếng Việt, tên địa danh tiếng Anh như VTP). */
export async function pickAddressAdmin(scope: Page | Locator, path = { state: "Yangon", district: "Yangon (West)", township: "Kamaryut" }) {
  await scope.getByLabel("Vùng / Bang").selectOption({ label: path.state });
  await scope.getByLabel("Huyện").selectOption({ label: path.district });
  await scope.getByLabel("Thị trấn").selectOption({ label: path.township });
}
