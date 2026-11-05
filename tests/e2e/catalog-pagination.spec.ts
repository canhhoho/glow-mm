import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import pg from "pg";

test("D7 tìm kiếm phân trang giữ sort và lịch sử quay lại", async ({ page }) => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  const prefix = `e2epages${randomUUID().replaceAll("-", "")}`;
  await client.connect();
  try {
    await client.query('INSERT INTO "Product" (id,slug,"brandId","categoryId","stockLocationId",published,"createdAt","updatedAt") SELECT $1 || n, $1 || n, p."brandId", p."categoryId", p."stockLocationId", true, now() - n * interval \'1 day\', now() FROM "Product" p CROSS JOIN generate_series(1,65) n WHERE p.slug = $2', [prefix, "sen-viet-sunscreen-spf50"]);
    await client.query('INSERT INTO "Variant" (id,"productId",sku,label,"priceMmk",active,"isBundle") SELECT $1 || n, $1 || n, $1 || n, \'Test\', n, true, false FROM generate_series(1,65) n', [prefix]);
    await client.query('INSERT INTO "ProductTranslation" ("productId",locale,name,"searchText") SELECT $1 || n, \'en\', $1 || n, $1 FROM generate_series(1,65) n', [prefix]);
    await page.goto(`/en/search?q=${prefix}&sort=price_asc`);
    const links = page.getByRole("main").locator(`a[href*="/p/${prefix}"]`);
    await expect(links).toHaveCount(24);
    await expect(links.first()).toHaveAttribute("href", `/en/p/${prefix}1`);
    await page.getByRole("link", { name: "Next", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`q=${prefix}.*page=2|page=2.*q=${prefix}`));
    await expect(links.first()).toHaveAttribute("href", `/en/p/${prefix}25`);
    expect(new URL(page.url()).searchParams.get("sort")).toBe("price_asc");
    await page.goBack();
    await expect(links.first()).toHaveAttribute("href", `/en/p/${prefix}1`);
    await page.goForward();
    await expect(links.first()).toHaveAttribute("href", `/en/p/${prefix}25`);
  } finally {
    await client.query('DELETE FROM "ProductTranslation" WHERE "productId" LIKE $1', [`${prefix}%`]);
    await client.query('DELETE FROM "Variant" WHERE "productId" LIKE $1', [`${prefix}%`]);
    await client.query('DELETE FROM "Product" WHERE id LIKE $1', [`${prefix}%`]);
    await client.end();
  }
});
