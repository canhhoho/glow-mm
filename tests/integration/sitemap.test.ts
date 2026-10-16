import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { sitemapEntries } from "@/server/catalog/sitemap";
import { createCollection, deleteCollection } from "@/server/content/collections";
import { makeFixture } from "./fixtures";

describe("sitemapEntries", () => {
  it("chỉ gồm SP đang bán, danh mục có SP đang bán, bộ sưu tập đang hiện; có trang chủ + info", async () => {
    const shown = await makeFixture();
    const hidden = await makeFixture();
    await prisma.product.update({ where: { id: shown.productId }, data: { published: true } });
    const now = new Date();
    const open = await createCollection(
      { slug: `it-${shown.tag.toLowerCase()}-on`, nameMy: "x", nameEn: "x", active: true, showOnHome: false, startAt: null, endAt: null },
      shown.userId,
    );
    const off = await createCollection(
      { slug: `it-${shown.tag.toLowerCase()}-off`, nameMy: "x", nameEn: "x", active: false, showOnHome: false, startAt: null, endAt: null },
      shown.userId,
    );
    try {
      const paths = (await sitemapEntries(now)).map((e) => e.path);
      expect(paths).toContain("/");
      expect(paths).toContain("/info/shipping");
      expect(paths).toContain(`/p/it-${shown.tag}`);
      expect(paths).toContain(`/c/it-${shown.tag}`);
      expect(paths).not.toContain(`/p/it-${hidden.tag}`); // chưa đăng
      expect(paths).not.toContain(`/c/it-${hidden.tag}`); // không có SP đang bán
      expect(paths).toContain(`/collection/it-${shown.tag.toLowerCase()}-on`);
      expect(paths).not.toContain(`/collection/it-${shown.tag.toLowerCase()}-off`);
      expect(paths.some((p) => /\/(cart|checkout|order|track|search)/.test(p))).toBe(false);
    } finally {
      await deleteCollection(open.id, shown.userId);
      await deleteCollection(off.id, shown.userId);
    }
  });
});
