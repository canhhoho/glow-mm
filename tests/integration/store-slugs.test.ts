import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { storeSlugExists } from "@/server/catalog/store-slugs";
import { makeFixture } from "./fixtures";

describe("storeSlugExists (proxy 404)", () => {
  it("sản phẩm chỉ có khi đã đăng và còn biến thể active; danh mục theo slug", async () => {
    const f = await makeFixture();
    const slug = `it-${f.tag}`;
    expect(await storeSlugExists("c", slug)).toBe(true);
    expect(await storeSlugExists("c", `${slug}-x`)).toBe(false);

    expect(await storeSlugExists("p", slug)).toBe(false); // chưa đăng
    await prisma.variant.update({ where: { id: f.variantId }, data: { active: false } });
    await prisma.product.update({ where: { id: f.productId }, data: { published: true } });
    expect(await storeSlugExists("p", slug)).toBe(false); // không còn biến thể bán
    await prisma.variant.update({ where: { id: f.variantId }, data: { active: true } });
    expect(await storeSlugExists("p", slug)).toBe(true);
  });
});
