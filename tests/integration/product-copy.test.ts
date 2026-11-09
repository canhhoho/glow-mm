import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getProductForEdit } from "@/server/catalog/admin-queries";
import { deleteProductImage } from "@/server/catalog/images";
import { productCopyDraft } from "@/server/catalog/product-copy";
import { saveProduct } from "@/server/catalog/products";
import { saleFixture } from "./fixtures";

describe("Sao chép sản phẩm", () => {
  it("tạo sản phẩm/biến thể độc lập, giữ ảnh khi xoá ảnh gốc, không sao chép tồn kho", async () => {
    const f = await saleFixture([{ lot: "COPY", expiryInDays: 365, qty: 7 }]);
    const original = (await getProductForEdit(f.productId))!;
    const file = await prisma.fileObject.create({ data: {
      driver: "LOCAL", visibility: "PUBLIC", key: `copy-test/${f.tag}.png`,
      url: `/api/files/copy-test/${f.tag}.png`, mime: "image/png", size: 1,
    } });
    const image = await prisma.productImage.create({ data: {
      productId: original.id, fileId: file.id, alt: "Original image", sortOrder: 2,
    } });
    const draft = productCopyDraft(original);
    expect(draft).toMatchObject({ id: "", slug: "", published: false });
    expect(draft.variants[0]).toMatchObject({ id: "", sku: "", priceMmk: 0, affiliateCommissionMmk: null });
    // Editing the draft must not mutate the source data in memory either.
    draft.en.name = "New product";
    expect(original.en.name).not.toBe(draft.en.name);

    const copy = await saveProduct({
      ...draft, id: undefined, copyFromId: original.id, slug: `copy-${f.tag.toLowerCase()}`,
      my: { ...draft.my, name: "ကုန်ပစ္စည်း" },
      variants: draft.variants.map((v, i) => ({ ...v, id: undefined, sku: `COPY-${f.tag}-${i}` })),
    }, f.userId);
    const result = await prisma.product.findUniqueOrThrow({ where: { id: copy.id }, include: {
      images: true, variants: { include: { batches: true, reservations: true, orderItems: true } },
    } });
    expect(copy.id).not.toBe(original.id);
    expect(result.published).toBe(false);
    expect(result.images).toEqual([expect.objectContaining({ fileId: file.id, alt: image.alt, sortOrder: 2 })]);
    expect(result.images[0].id).not.toBe(image.id);
    expect(result.variants[0].id).not.toBe(f.variantId);
    expect(result.variants[0].batches).toEqual([]);
    expect(result.variants[0].reservations).toEqual([]);
    expect(result.variants[0].orderItems).toEqual([]);
    expect(await getProductForEdit(original.id)).toEqual(original);
    expect(await prisma.stockBalance.aggregate({ where: { batch: { variantId: f.variantId } }, _sum: { qty: true } })).toMatchObject({ _sum: { qty: 7 } });

    await expect(deleteProductImage(image.id, f.userId)).resolves.toMatchObject({ fileDeleted: false });
    expect(await prisma.fileObject.findUnique({ where: { id: file.id } })).not.toBeNull();
    expect(await prisma.productImage.count({ where: { productId: copy.id, fileId: file.id } })).toBe(1);
    await saveProduct((await getProductForEdit(copy.id))!, f.userId);
    expect(await prisma.productImage.count({ where: { productId: copy.id } })).toBe(1);
  });

  it("không cho áp dụng nguồn sao chép lên sản phẩm đang sửa", async () => {
    await expect(saveProduct({
      id: "existing", copyFromId: "source", slug: "copy", brandId: "brand", categoryId: "category",
      my: { name: "ကုန်ပစ္စည်း" }, en: { name: "Product" },
      variants: [{ sku: "COPY", label: "50ml", priceMmk: 1 }],
    }, "admin")).rejects.toThrow(/Chỉ sao chép/);
  });

  it("nguồn đã xoá thì báo lỗi, không tạo sản phẩm dở dang", async () => {
    const before = await prisma.product.count();
    await expect(saveProduct({
      copyFromId: "missing-copy-source", slug: "missing-copy", brandId: "brand", categoryId: "category",
      my: { name: "ကုန်ပစ္စည်း" }, en: { name: "Product" },
      variants: [{ sku: "MISSING-COPY", label: "50ml", priceMmk: 1 }],
    }, "admin")).rejects.toThrow(/nguồn không còn tồn tại/);
    expect(await prisma.product.count()).toBe(before);
  });
});
