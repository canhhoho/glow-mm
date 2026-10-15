import { expect, test, type Page } from "@playwright/test";
import Rabbit from "rabbit-node";
import { login } from "./helpers";

const PRODUCT = "/en/p/sen-viet-sunscreen-spf50";
// PNG 1×1 tối thiểu làm "biên lai".
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082",
  "hex",
);

async function addToCartAndCheckout(page: Page, method: "Cash on delivery" | "Bank transfer", phone: string) {
  await page.goto(PRODUCT);
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page).toHaveURL(/\/en\/cart$/);
  await expect(page.getByTestId("cart-line")).toHaveCount(1);
  await expect(page.getByTestId("cart-count")).toHaveText("1");

  await page.getByRole("link", { name: "Checkout" }).click();
  await page.getByLabel("Full name").fill("Ma Thandar");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Township").selectOption({ index: 1 });
  await page.getByLabel("Address (house no., street, ward)").fill("No. 7, Pyay Road");
  await page.getByText(method, { exact: true }).click();
  await page.getByRole("button", { name: "Place order" }).click();

  await expect(page).toHaveURL(/\/en\/order\/OD-/);
  await expect(page.getByText("Thank you! Your order has been placed.")).toBeVisible();
  await expect(page.getByTestId("order-status")).toHaveText("Waiting for confirmation");
  await expect(page.getByTestId("cart-count")).toHaveCount(0);
  return { code: (await page.getByTestId("order-code").textContent())!.trim(), url: page.url() };
}

async function openAdminOrder(page: Page, code: string) {
  await page.goto(`/admin/orders?q=${code}`);
  await page.getByRole("link", { name: code }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(code);
}

async function cancelInAdmin(page: Page) {
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Huỷ đơn" }).click();
  await expect(page.getByTestId("order-status")).toContainText("Đã huỷ");
}

test("khách đặt COD trên web → nhân viên gọi xác nhận", async ({ page }) => {
  // Tìm kiếm tiếng Myanmar ra đúng sản phẩm.
  await page.goto("/search?q=နေကာ");
  await expect(page.locator('a[href="/p/sen-viet-sunscreen-spf50"]')).toBeVisible();
  // Gõ bằng font Zawgyi (máy cũ) vẫn ra đúng sản phẩm.
  await page.getByRole("searchbox").fill(Rabbit.uni2zg("နေကာခရင်မ်"));
  await page.getByRole("button", { name: "ရှာမည်" }).click();
  await expect(page).toHaveURL(/\/search\?q=/);
  await expect(page.locator('a[href="/p/sen-viet-sunscreen-spf50"]')).toBeVisible();

  const { code } = await addToCartAndCheckout(page, "Cash on delivery", "09 7812 3456");
  await expect(page.getByText(/Pay .* in cash when you receive/)).toBeVisible();

  await login(page, "donhang@glow.local");
  await openAdminOrder(page, code);
  await expect(page.getByText("Khách tự đặt").filter({ visible: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Đã gọi xác nhận COD" }).click();
  await expect(page.getByTestId("order-status")).toContainText("Đã xác nhận COD");
  await cancelInAdmin(page); // nhả hàng để lần chạy sau vẫn còn tồn
});

test("khách chuyển khoản → upload biên lai → nhân viên duyệt; tra đơn bằng mã + SĐT", async ({ page, browser }) => {
  const { code, url } = await addToCartAndCheckout(page, "Bank transfer", "09 4511 2233");
  await expect(page.getByTestId("bank-instructions")).not.toBeEmpty();
  await page.getByLabel("Upload transfer receipt").setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("button", { name: "Send receipt" }).click();
  await expect(page.getByText("Receipt received — we will confirm soon.")).toBeVisible();
  await expect(page.getByLabel("Upload transfer receipt")).toHaveCount(0);

  // Trình duyệt khác: không có cookie đơn → phải tra bằng mã + SĐT.
  const other = await browser.newContext();
  const guest = await other.newPage();
  await guest.goto(url);
  await expect(guest).toHaveURL(/\/en\/track\?code=/);
  await guest.getByLabel("Phone number used for the order").fill("09 9999 9999");
  await guest.getByRole("button", { name: "Find order" }).click();
  await expect(guest.getByRole("alert").filter({ hasText: "No order matches" })).toBeVisible();
  await guest.getByLabel("Phone number used for the order").fill("+95 9 4511 2233");
  await guest.getByRole("button", { name: "Find order" }).click();
  await expect(guest.getByTestId("order-code")).toHaveText(code);

  // Biên lai là file riêng tư: khách lạ không tải được.
  await login(page, "donhang@glow.local");
  await openAdminOrder(page, code);
  const proofUrl = await page.getByRole("link", { name: "Xem file" }).getAttribute("href");
  expect((await page.request.get(proofUrl!)).status()).toBe(200);
  expect((await guest.request.get(proofUrl!)).status()).toBe(404);
  await other.close();

  await page.getByRole("button", { name: "Duyệt" }).click();
  await expect(page.getByTestId("order-status")).toContainText("Đã nhận tiền");
  await cancelInAdmin(page);
});
