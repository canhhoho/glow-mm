import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { approvalHashes } from "@/server/catalog/approval";
import { listBrandsAdmin, mergeBrands, renameBrand } from "@/server/catalog/brand-admin";
import { makeFixture } from "./fixtures";

// 21/11/2026 (audit #14): trang Thương hiệu — đổi tên, gộp thẳng (SP đã duyệt không phải duyệt lại).
describe("Quản lý thương hiệu", () => {
  it("gộp: chuyển mọi SP (kể cả đã duyệt), cập nhật dấu duyệt + bản đang sửa, xoá thương hiệu cũ", async () => {
    const f = await makeFixture();
    const typo = await prisma.brand.create({ data: { slug: `it-typo-${f.tag.toLowerCase()}`, name: `IT typo ${f.tag}` } });
    const approved = await prisma.product.create({
      data: {
        slug: `it-approved-${f.tag.toLowerCase()}`,
        brandId: typo.id,
        categoryId: f.categoryId,
        translations: { create: { locale: "en", name: `Approved ${f.tag}`, searchText: f.tag } },
        variants: { create: { sku: `IT-AP-${f.tag}`, label: "Std", priceMmk: 1000 } },
      },
    });
    const hash = (await approvalHashes(prisma, [approved.id])).get(approved.id)!;
    await prisma.product.update({ where: { id: approved.id }, data: { approvedAt: new Date(), approvedHash: hash, approvalStatus: "APPROVED" } });
    await prisma.productChangeRequest.create({ data: { productId: approved.id, content: { brandId: typo.id, brandName: "x", categoryId: f.categoryId }, createdById: f.userId } });
    await prisma.product.update({ where: { id: f.productId }, data: { brandId: typo.id } });

    const res = await mergeBrands({ fromId: typo.id, toId: f.brandId }, f.userId);
    expect(res.moved).toBe(2);
    expect(await prisma.brand.findUnique({ where: { id: typo.id } })).toBeNull();
    const after = await prisma.product.findUniqueOrThrow({ where: { id: approved.id } });
    expect(after.brandId).toBe(f.brandId);
    expect(after.approvedAt).not.toBeNull();
    expect(after.approvedHash).toBe((await approvalHashes(prisma, [approved.id])).get(approved.id));
    expect(after.approvedHash).not.toBe(hash);
    const cr = await prisma.productChangeRequest.findUniqueOrThrow({ where: { productId: approved.id } });
    expect(cr.content).toEqual({ brandId: f.brandId, categoryId: f.categoryId });
    expect(await prisma.auditLog.count({ where: { action: "brand.merge", entityId: f.brandId } })).toBe(1);
    await expect(mergeBrands({ fromId: f.brandId, toId: f.brandId }, f.userId)).rejects.toThrow();
  });

  it("đổi tên: cập nhật tên + mã; trùng thương hiệu khác thì chặn (dùng Gộp); danh sách đếm SP", async () => {
    const f = await makeFixture();
    const other = await prisma.brand.create({ data: { slug: `it-other-${f.tag.toLowerCase()}`, name: `IT other ${f.tag}` } });
    const renamed = await renameBrand({ id: f.brandId, name: `  IT  Fixed ${f.tag} ` }, f.userId);
    expect(renamed.name).toBe(`IT Fixed ${f.tag}`);
    expect(renamed.slug).toBe(`it-fixed-${f.tag.toLowerCase()}`);
    await expect(renameBrand({ id: f.brandId, name: other.name.toUpperCase() }, f.userId)).rejects.toThrow(/Gộp/);
    const rows = await listBrandsAdmin(`Fixed ${f.tag}`);
    expect(rows).toEqual([expect.objectContaining({ id: f.brandId, products: 1, activeProducts: 1, publishedProducts: 0 })]);
  });
});
