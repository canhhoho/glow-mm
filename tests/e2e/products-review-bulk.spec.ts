import { expect, test } from "@playwright/test";
import { approveChanges, login, priceInputs, setPrices } from "./helpers";

// P2: hàng đợi "Chờ duyệt" trên danh sách SP — cột Thay đổi + duyệt hàng loạt theo phiên bản đang hiển thị.
const SLUG = "sen-viet-sunscreen-spf50";

test("đổi giá SP đang bán → gửi duyệt → danh sách Chờ duyệt hiện thay đổi → duyệt hàng loạt", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, "admin@glow.local");
  await page.goto(`/admin/products?q=${SLUG}`);
  await page.getByRole("row", { name: new RegExp(SLUG) }).getByRole("link", { name: /^Sửa / }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[^/?]+$/);
  const productUrl = page.url();
  const original = Number(await (await priceInputs(page)).first().inputValue());
  const next = original + 100 * (1 + (Date.now() % 9));

  try {
    await setPrices(page, [next], "E2E duyệt hàng loạt");
    const check = page.getByTestId("launch-check").filter({ visible: true });
    await check.getByRole("button", { name: "Gửi duyệt", exact: true }).click();
    await expect(check.getByTestId("approval-status")).toHaveAttribute("data-change", "PENDING", { timeout: 15_000 });

    await page.goto(`/admin/products?status=review&q=${SLUG}`);
    const row = page.getByRole("row", { name: new RegExp(SLUG) });
    await expect(row.getByTestId("queue-changes")).toContainText(`→ ${next.toLocaleString("en-US")}`);
    await row.getByRole("checkbox").check();
    page.once("dialog", (d) => d.accept());
    await page.getByTestId("bulk-review").getByRole("button", { name: "Duyệt", exact: true }).click();
    await expect(page.getByTestId("bulk-done")).toContainText("Đã duyệt 1 SP", { timeout: 15_000 });

    await page.goto(productUrl);
    await expect(page.getByTestId("launch-check").filter({ visible: true }).getByTestId("approval-status")).toHaveAttribute("data-change", "");
    await expect((await priceInputs(page)).first()).toHaveValue(String(next));
  } finally {
    await page.goto(productUrl);
    await setPrices(page, [original], "E2E trả giá cũ");
    await approveChanges(page);
  }
});
