import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("Giá bán (desktop): bảng theo kho và quy đổi ngầm ngay trên danh sách", async ({ page }) => {
  test.setTimeout(90_000);
  await login(page, "admin@glow.local");
  await page.goto("/admin/selling-prices?q=SV-SUN-50");
  const vnd = page.getByTestId("manual-vnd");
  // 8 cột, đúng thứ tự (18/11/2026: tách "Lô nguồn" khỏi "Giá mua"); không còn cột trung gian "Giá mua + lãi (MMK)".
  await expect(vnd.locator("thead th")).toHaveText(["Sản phẩm", "Giá mua (VND)", "Lô nguồn", "Lãi (VND)", "Vận chuyển (MMK)", "CTV (MMK)", "Giá bán (MMK)", "Thao tác"]);
  await expect(vnd.getByRole("columnheader", { name: "Giá mua + lãi (MMK)" })).toHaveCount(0);
  await expect(vnd.locator("tbody tr").first().locator("td")).toHaveCount(8);
  await expect(page.getByTestId("price-pick")).toHaveCount(0);
  await expect(page.getByTestId("manual-formula")).toHaveCount(0);
  // Tỷ giá trên thanh cấu hình ngang phía trên bảng; ô gửi duyệt + nút Lưu cùng một hàng dưới bảng.
  const bar = vnd.getByTestId("manual-toolbar");
  await expect(bar.getByTestId("manual-rate")).toBeVisible();
  const tableBox = (await vnd.locator("table").boundingBox())!;
  expect((await bar.boundingBox())!.y).toBeLessThan(tableBox.y);
  const save = vnd.getByRole("button", { name: /^Lưu giá/ });
  const submitNow = vnd.getByLabel("Gửi duyệt ngay");
  const [saveBox, checkBox] = [(await save.boundingBox())!, (await submitNow.boundingBox())!];
  expect(Math.abs(saveBox.y - checkBox.y)).toBeLessThan(saveBox.height);
  expect(saveBox.x).toBeGreaterThan(checkBox.x);
  const line = vnd.getByTestId("manual-row").first();
  // Nút icon bút chì: nhãn truy cập + tooltip; bấm bằng bàn phím → ô Lãi được focus.
  const edit = line.getByRole("button", { name: /^Sửa giá / });
  await expect(edit).toHaveAttribute("title", "Sửa giá");
  await edit.focus();
  await page.keyboard.press("Enter");
  await expect(line.getByRole("spinbutton", { name: /^Lãi/ })).toBeFocused();
  // Lỗi nhập: báo ngay dưới ô, giá bán "—" kèm lý do (không hiện 0).
  await line.getByRole("spinbutton", { name: /^Lãi/ }).fill("-5");
  await expect(line.getByText("Nhập số nguyên ≥ 0")).toBeVisible();
  await expect(line.getByTestId("manual-final")).toHaveText("—");
  await expect(line).toContainText("Điền lãi, vận chuyển, CTV");
  await page.screenshot({ path: "test-results/screens/selling-prices-manual-error.png", fullPage: true });
  await line.getByRole("spinbutton", { name: /^Lãi/ }).fill("30000");
  await line.getByRole("spinbutton", { name: /^Vận chuyển/ }).fill("800");
  await line.getByRole("spinbutton", { name: /^CTV/ }).fill("0");
  await expect(line.getByTestId("manual-final")).not.toHaveText("—");
  await expect(line.getByRole("spinbutton")).toHaveCount(3);
  await expect(page).toHaveURL(/selling-prices\?q=/);
  await page.screenshot({ path: "test-results/screens/selling-prices-manual-desktop.png", fullPage: true });
});
