import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getProductForEdit } from "@/server/catalog/admin-queries";
import { deleteProducts } from "@/server/catalog/product-delete";
import { createProduct } from "@/server/catalog/product-create";
import { loadReadiness, loadReadinessErrors } from "@/server/catalog/readiness";
import { saveProduct } from "@/server/catalog/products";
import { makeFixture, markApproved, unpublishTestProducts, type Fixture } from "./fixtures";

/** Thành phần combo đã tắt / ngừng kinh doanh (#6, docs/ban-do-nghiep-vu-admin.md). */

afterAll(unpublishTestProducts);

/** Combo cùng kho với thành phần (mỗi fixture có kho riêng → dùng kho của `part`). */
async function comboOf(part: Fixture) {
  const f = await makeFixture();
  const combo = await createProduct(
    { kind: "combo", nameEn: `Set ${f.tag}`, brandId: f.brandId, categoryId: f.categoryId, stockLocationId: part.mm.id, defaultLabel: "Set", components: [{ componentId: part.variantId, qty: 1 }] },
    f.userId,
  );
  return { f, combo };
}
const codes = async (productId: string) => (await loadReadiness(prisma, [productId])).get(productId)!.errors.map((e) => e.code);

describe("Thành phần combo đã tắt / ngừng KD", () => {
  it("lỗi COMPONENT_INACTIVE chặn mở bán; combo vẫn lưu được và giữ thành phần cũ; thêm thành phần tắt MỚI bị từ chối", async () => {
    const part = await makeFixture();
    const { f, combo } = await comboOf(part);
    expect(await codes(combo.id)).not.toContain("COMPONENT_INACTIVE");

    await prisma.variant.update({ where: { id: part.variantId }, data: { active: false } });
    expect(await codes(combo.id)).toContain("COMPONENT_INACTIVE");
    // Đường nhanh (badge / tab Chờ hoàn thiện) trả cùng lỗi với đường đầy đủ.
    const fast = await loadReadinessErrors(prisma, [combo.id]);
    expect(fast.get(combo.id)).toEqual((await loadReadiness(prisma, [combo.id])).get(combo.id)!.errors);

    // Combo đang hiển thị vẫn lưu được (không tự ẩn, không mất cấu hình).
    await prisma.variant.updateMany({ where: { productId: combo.id }, data: { priceMmk: 20_000 } }); // PRICE_ZERO luôn chặn lưu SP đang hiển thị
    await markApproved(combo.id, { published: true });
    const form = (await getProductForEdit(combo.id))!;
    await expect(saveProduct({ ...form }, f.userId)).resolves.toBeTruthy();
    expect((await prisma.bundleItem.findMany({ where: { bundle: { productId: combo.id } } })).map((b) => b.componentId)).toEqual([part.variantId]);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: combo.id } })).published).toBe(true);

    // Chọn MỚI một thành phần đã tắt: từ chối, ở cả đường tạo combo.
    await expect(
      createProduct(
        { kind: "combo", nameEn: `New ${f.tag}`, brandId: f.brandId, categoryId: f.categoryId, stockLocationId: part.mm.id, defaultLabel: "Set", components: [{ componentId: part.variantId, qty: 1 }] },
        f.userId,
      ),
    ).rejects.toThrow(/đã tắt hoặc ngừng kinh doanh/);
  });

  it("thành phần thuộc SP ngừng KD (đã bấm Xoá nhưng là thành phần combo) cũng bị báo lỗi mở bán", async () => {
    const part = await makeFixture();
    const { combo } = await comboOf(part);
    expect(await deleteProducts([part.productId], part.userId)).toEqual({ deleted: 0, archived: 1 });
    expect(await codes(combo.id)).toContain("COMPONENT_INACTIVE");
  });
});
