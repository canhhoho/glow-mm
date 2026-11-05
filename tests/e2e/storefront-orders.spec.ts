import { expect, test, type Page } from "@playwright/test";
import Rabbit from "rabbit-node";
import { login, pickAddress, signInAtPrompt } from "./helpers";

const PRODUCT = "/en/p/sen-viet-sunscreen-spf50";
async function addToCartAndCheckout(page: Page, method: "Cash on delivery" | "Bank transfer", phone: string, failFirst = false) {
  await page.goto(PRODUCT);
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page).toHaveURL(/\/en\/cart$/);
  await expect(page.getByTestId("cart-line")).toHaveCount(1);
  await expect(page.getByTestId("cart-count")).toHaveText("1");

  // Đặt hàng bắt buộc tài khoản (P14c): Checkout → đăng nhập → quay lại checkout, giỏ còn nguyên.
  await page.getByRole("link", { name: "Checkout" }).click();
  await signInAtPrompt(page);
  await page.getByLabel("Full name").fill("Ma Thandar");
  await page.getByLabel("Phone number").fill(failFirst ? "12345" : phone);
  await pickAddress(page);
  await page.getByLabel("Address (house no., street, ward)").fill("No. 7, Pyay Road");
  await page.getByText(method, { exact: true }).click();
  await page.getByRole("button", { name: "Place order" }).click();
  if (failFirst) {
    // Server báo lỗi → các ô khách vừa nhập (kể cả địa chỉ chọn và cách thanh toán) phải còn nguyên (DQ).
    await expect(page.getByText("Please enter a valid Myanmar mobile number")).toBeVisible();
    await expect(page.locator('input[name="phone"]')).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator('input[name="phone"]')).toHaveAttribute("aria-describedby", "checkout-phone-error");
    await expect(page.getByLabel("Full name")).toHaveValue("Ma Thandar");
    await expect(page.getByLabel("Address (house no., street, ward)")).toHaveValue("No. 7, Pyay Road");
    await expect(page.getByLabel("Township").locator("option:checked")).toHaveText("Kamaryut");
    await expect(page.getByRole("radio", { name: new RegExp(method) })).toBeChecked();
    await page.getByLabel("Phone number").fill(phone);
    await page.getByRole("button", { name: "Place order" }).click();
  }

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
  await page.getByRole("main").getByRole("searchbox").fill(Rabbit.uni2zg("နေကာခရင်မ်"));
  await page.getByRole("button", { name: "ရှာမည်" }).click();
  await expect(page).toHaveURL(/\/search\?q=/);
  await expect(page.locator('a[href="/p/sen-viet-sunscreen-spf50"]')).toBeVisible();

  const { code } = await addToCartAndCheckout(page, "Cash on delivery", "09 7812 3456");
  await expect(page.getByText(/Pay .* in cash when you receive/)).toBeVisible();

  await login(page, "donhang@glow.local");
  await openAdminOrder(page, code);
  await expect(page.getByText("Khách tự đặt").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByTestId("order-account")).toContainText("khach@glow.local");
  await page.getByRole("button", { name: "Xác nhận đơn" }).click();
  await expect(page.getByTestId("order-status")).toContainText("Chuẩn bị giao");
  await cancelInAdmin(page); // nhả hàng để lần chạy sau vẫn còn tồn
});

test("khách chuyển khoản → nhân viên xác nhận đã nhận tiền; tra đơn bằng mã + SĐT", async ({ page, browser }) => {
  const { code, url } = await addToCartAndCheckout(page, "Bank transfer", "09 4511 2233", true);
  await expect(page.getByTestId("bank-instructions")).not.toBeEmpty();
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await expect(page.getByText("No receipt is required.", { exact: false })).toBeVisible();

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

  await other.close();
  await login(page, "donhang@glow.local");
  await openAdminOrder(page, code);
  await expect(page.getByRole("button", { name: "Duyệt", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Đã nhận tiền", exact: true }).click();
  await expect(page.getByTestId("order-status")).toContainText("Chuẩn bị giao");
  await expect(page.getByTestId("order-status")).toContainText("Đã thanh toán");
  await cancelInAdmin(page);
});
