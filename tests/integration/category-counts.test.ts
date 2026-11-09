import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { deleteCategory, listCategoriesAdmin } from "@/server/catalog/categories";
import { saleFixture } from "./fixtures";

describe("Số sản phẩm danh mục", () => {
  it("cộng tồn khả dụng của con vào cha; ngừng kinh doanh hiển thị 0 nhưng vẫn chặn xoá", async () => {
    const f = await saleFixture([{ lot: "CATEGORY", expiryInDays: 365, qty: 2 }]);
    const root = await prisma.category.create({ data: { slug: `root-${f.tag}` } });
    await prisma.category.update({ where: { id: f.categoryId }, data: { parentId: root.id } });
    const rows = () => listCategoriesAdmin(f.tag);
    try {
      let result = await rows();
      expect(result.find((c) => c.id === root.id)).toMatchObject({ managedProducts: 1, inStockProducts: 1, products: 0, children: 1 });
      expect(result.find((c) => c.id === f.categoryId)).toMatchObject({ managedProducts: 1, inStockProducts: 1 });
      await prisma.product.update({ where: { id: f.productId }, data: { archivedAt: new Date(), published: false } });
      result = await rows();
      expect(result.find((c) => c.id === root.id)).toMatchObject({ managedProducts: 0, inStockProducts: 0, children: 1 });
      expect(result.find((c) => c.id === f.categoryId)).toMatchObject({ managedProducts: 0, inStockProducts: 0, products: 1 });
      await expect(deleteCategory(f.categoryId, f.userId)).rejects.toThrow("Danh mục còn sản phẩm");
      await expect(deleteCategory(root.id, f.userId)).rejects.toThrow("Danh mục còn danh mục con");
    } finally {
      await prisma.product.update({ where: { id: f.productId }, data: { published: false } });
    }
  });
});
