import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("thao tác hàng loạt chỉ lấy ô chọn của danh sách đang hiện", async ({ page }) => {
  await login(page, "admin@glow.local");
  await page.goto("/admin/orders");
  const box = page.locator("input[data-bulk-id]").filter({ visible: true }).first();
  const id = await box.getAttribute("data-bulk-id");
  // Next Activity có thể giữ DOM của trang trước. Ô ẩn đã chọn không thuộc danh sách hiện tại.
  await page.evaluate(() => {
    const hidden = document.createElement("input");
    hidden.type = "checkbox";
    hidden.dataset.bulkId = "hidden-previous-page";
    hidden.checked = true;
    hidden.style.display = "none";
    document.body.append(hidden);
    window.open = url => { (window as Window & { bulkPreview?: string }).bulkPreview = String(url); return null; };
  });
  await box.check();
  const bar = page.getByTestId("bulk-bar");
  await expect(bar.getByTestId("bulk-count")).toHaveText("Đã chọn 1 đơn");
  await bar.getByRole("button", { name: "In nhãn", exact: true }).click();
  const url = await page.evaluate(() => (window as Window & { bulkPreview?: string }).bulkPreview);
  expect(new URL(url!, page.url()).searchParams.get("ids")).toBe(id);
});
