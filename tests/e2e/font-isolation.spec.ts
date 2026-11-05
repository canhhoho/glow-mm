import { expect, test } from "@playwright/test";

test("font storefront tách khỏi hai độ đậm của admin/CTV", async ({ page }) => {
  const fonts: string[] = [];
  page.on("request", request => { if (request.url().includes(".woff2")) fonts.push(request.url()); });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  expect(await page.locator("html").evaluate(el=>getComputedStyle(el).fontFamily)).toContain("storeMyanmarFont");
  expect(fonts.filter(url=>url.includes("myanmar_500"))).toHaveLength(0);
  for (const path of ["/admin/login", "/ctv/login"]) {
    await page.goto(path);
    expect(await page.locator("html").evaluate(el=>getComputedStyle(el).fontFamily)).toContain("staffMyanmarFont");
  }
});
