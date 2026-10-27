import { expect, test, type Page } from "@playwright/test";
import { login, signInAtPrompt } from "./helpers";

// P15b: admin tắt một thị trấn ở "Địa bàn giao hàng" → checkout không còn thị trấn đó; bật lại → có lại.

async function setDala(page: Page, on: boolean) {
  await login(page, "admin@glow.local");
  await page.goto("/admin/settings/locations?q=Dala");
  const row = page.getByTestId("location-township").filter({ has: page.locator('input[value="township:tw-YGN-SYG-DLA"]') });
  await row.getByLabel("Dala active").setChecked(on);
  await page.getByRole("button", { name: "Lưu thay đổi" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Đã lưu \d+ thay đổi/ })).toBeVisible();
}

async function southTownships(page: Page) {
  await page.goto("/en/p/sen-viet-sunscreen-spf50");
  await page.getByRole("button", { name: "Add to cart" }).click();
  await page.getByRole("link", { name: "Checkout" }).click();
  await signInAtPrompt(page);
  await page.getByLabel("Deliver to").selectOption({ label: "A new address" });
  await page.getByLabel("State / Region").selectOption({ label: "Yangon" });
  await page.getByLabel("District").selectOption({ label: "Yangon (South)" });
  return page.getByLabel("Township").locator("option").allTextContents();
}

test("admin tắt thị trấn → checkout không còn; bật lại → có lại", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, "admin@glow.local");
  await page.goto("/admin/settings/locations");
  await expect(page.getByTestId("location-state")).toHaveCount(15);
  await page.getByRole("link", { name: /huyện ·/ }).filter({ hasText: "4 huyện" }).first().click();
  await expect(page.getByRole("heading", { level: 2 })).toBeVisible();

  await setDala(page, false);
  try {
    expect(await southTownships(page)).not.toContain("Dala");
  } finally {
    await setDala(page, true);
  }
  expect(await southTownships(page)).toContain("Dala");
});
