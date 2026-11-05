import { expect, test } from "@playwright/test";
import pg from "pg";
import { login, pickAddress, signInAtPrompt } from "./helpers";

test("D5 hành trình thật ghi đủ phiên, tải lại không nhân đôi purchase", async ({ page }) => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  let orderId: string | undefined;
  try {
    await page.goto("/en/p/sen-viet-sunscreen-spf50");
    await expect(page.locator("html")).toHaveAttribute("data-analytics", "on");
    await page.getByRole("button", { name: "Add to cart" }).click();
    await page.getByRole("link", { name: "Checkout" }).click();
    await signInAtPrompt(page);
    await page.getByLabel("Full name").fill("Analytics Test");
    await page.getByLabel("Phone number").fill("09 7812 3456");
    await pickAddress(page);
    await page.getByLabel("Address (house no., street, ward)").fill("Test street");
    await page.getByText("Cash on delivery", { exact: true }).click();
    await page.getByRole("button", { name: "Place order" }).click();
    await expect(page.getByTestId("order-code")).toBeVisible();
    const code = (await page.getByTestId("order-code").innerText()).trim();
    orderId = (await client.query('SELECT id FROM "Order" WHERE code = $1', [code])).rows[0].id;
    await page.reload();
    const session = await page.evaluate(() => sessionStorage.getItem("tc-analytics-session"));
    await expect.poll(async () => (await client.query('SELECT DISTINCT name FROM "AnalyticsEvent" WHERE "sessionId" = $1', [session])).rows.map((r) => r.name)).toEqual(expect.arrayContaining(["view_item", "add_to_cart", "view_cart", "begin_checkout", "login_required", "login_success", "purchase"]));
    expect(Number((await client.query('SELECT COUNT(*) FROM "AnalyticsEvent" WHERE name = $1 AND "orderId" = $2', ["purchase", orderId])).rows[0].count)).toBe(1);
    await login(page, "admin@glow.local");
    await page.goto("/admin/reports/analytics");
    await expect(page.getByRole("heading", { name: "Hành vi mua hàng" })).toBeVisible();
    await expect(page.getByTestId("analytics-purchase")).toBeVisible();
    await page.goto(`/admin/orders/${orderId}`);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Huỷ đơn" }).click();
    await expect(page.getByTestId("order-status")).toContainText("Đã huỷ");
  } finally {
    await client.end();
  }
});
