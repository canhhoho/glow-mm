import { expect, test, type Page } from "@playwright/test";
import { login, loginCtv, pickAddress, signInAtPrompt } from "./helpers";

// P11c: khách đặt qua link CTV cấp dưới LINN → MAUNG (cấp trên) thấy hoa hồng tuyến dưới ở /ctv/team,
// không thấy thông tin khách; admin chi trả cho MAUNG có phần "tuyến dưới".

const HOLD_LABEL = "Hoa hồng đến hạn sau khi đơn hoàn thành (ngày)";

async function setHoldDays(page: Page, days: number) {
  await page.goto("/admin/settings");
  await page.getByLabel(HOLD_LABEL).fill(String(days));
  await page.getByRole("button", { name: "Lưu cài đặt" }).click();
  await expect(page.getByRole("status")).toHaveText("Đã lưu");
}

test("tuyến dưới: đơn của CTV cấp dưới → cấp trên thấy hoa hồng tầng trên, không thấy khách; admin chi trả", async ({ page }) => {
  test.setTimeout(120_000);
  const customer = `Ma Team ${Date.now().toString(36).slice(-4)}`;

  await page.goto("/en/p/sen-viet-sunscreen-spf50?ref=LINN");
  await page.getByRole("button", { name: "Add to cart" }).click();
  await page.getByRole("link", { name: "Checkout" }).click();
  await signInAtPrompt(page);
  await page.getByLabel("Full name").fill(customer);
  await page.getByLabel("Phone number").fill("09 7812 6666");
  await pickAddress(page);
  await page.getByLabel("Address (house no., street, ward)").fill("No. 1, Team Road");
  await page.getByText("Cash on delivery", { exact: true }).click();
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page).toHaveURL(/\/en\/order\/OD-/);
  const code = (await page.getByTestId("order-code").textContent())!.trim();

  // Cấp trên MAUNG: thấy LINN trong tuyến dưới, có hoa hồng chờ, không thấy tên khách.
  await loginCtv(page);
  await page.getByRole("link", { name: "Tuyến dưới" }).click();
  await expect(page.getByTestId("ctv-invite-link")).toHaveText(/\/ctv\/join\?inv=MAUNG$/);
  await expect(page.getByTestId("ctv-team-member").filter({ hasText: "LINN" })).toBeVisible();
  await expect(page.getByTestId("ctv-team-pending")).toContainText(/[1-9][\d,]* MMK/);
  await expect(page.getByText(customer)).toHaveCount(0);

  // Admin: đơn hiện cấp trên; hạn giữ 0 → MAUNG có phần tuyến dưới đến hạn, ghi nhận chi trả.
  await login(page, "admin@glow.local");
  await page.goto(`/admin/orders?q=${code}`);
  await page.getByRole("link", { name: code }).click();
  await expect(page.getByTestId("order-upline")).toContainText("MAUNG");
  // Đi hết luồng để đơn hoàn tất.
  await page.getByRole("button", { name: "Xác nhận đơn" }).click();
  await expect(page.getByTestId("order-status")).toContainText("Chuẩn bị giao");
  const from = page.getByLabel("Kho xuất");
  if (await from.count()) await from.selectOption({ label: "MM-STOCK — Kho Yangon" });
  await page.getByLabel("Đơn vị vận chuyển").fill("Royal Express");
  await page.getByRole("button", { name: "Đã bàn giao vận chuyển" }).click();
  await expect(page.getByTestId("order-status")).toContainText("Đang giao");
  await page.getByRole("button", { name: "Giao thành công · Đã thu tiền" }).click();
  await expect(page.getByTestId("order-status")).toContainText("Hoàn tất");

  await setHoldDays(page, 0);
  try {
    await page.goto("/admin/affiliates?q=MAUNG");
    await page.getByTestId("affiliate-row").getByRole("link").first().click();
    await expect(page.getByTestId("team-order").filter({ hasText: code })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: code }).filter({ hasText: "tuyến dưới" })).toBeVisible();
    const before = await page.getByTestId("payout-row").count();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Ghi nhận đã trả" }).click();
    await expect(page.getByTestId("payout-row")).toHaveCount(before + 1);
  } finally {
    await setHoldDays(page, 7);
  }
});
