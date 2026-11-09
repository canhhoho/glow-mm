import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { approvalCounts, approveProduct } from "@/server/catalog/approval";
import { saveProductPricing } from "@/server/catalog/product-pricing";
import { getProductForEdit, listProductsAdmin } from "@/server/catalog/admin-queries";
import { saveProduct, setProductsPublished } from "@/server/catalog/products";
import { reorderProductImage } from "@/server/catalog/images";
import { loadReadiness } from "@/server/catalog/readiness";
import { createDocument, postDocument } from "@/server/inventory/documents";
import { applyRun, previewRun } from "@/server/pricing/runs";
import { makeFixture, unpublishTestProducts, type Fixture } from "./fixtures";

afterAll(unpublishTestProducts);

// QT2 — bước 4 Duyệt: lưu vết, tự huỷ duyệt khi nội dung/giá/ảnh đổi, chặn đăng bán khi chưa duyệt.

/** SP fixture đủ điều kiện mở bán (có khối lượng, đã nhập kho), slug hợp lệ để lưu lại qua form. */
async function readyFixture() {
  const f = await makeFixture();
  await prisma.product.update({ where: { id: f.productId }, data: { slug: `it-${f.tag.toLowerCase()}` } });
  await prisma.variant.update({ where: { id: f.variantId }, data: { weightGrams: 100 } });
  const doc = await createDocument({ type: "RECEIVE", toId: f.mm.id, lines: [{ variantId: f.variantId, lotNo: "A", expiryDate: "2029-12-31", unitCostVnd: 100_000, qty: 3 }] }, f.userId);
  await postDocument(doc.id, f.userId);
  return f;
}
const state = (f: Fixture) => prisma.product.findUniqueOrThrow({ where: { id: f.productId }, select: { approvedAt: true, approvedById: true, approvedHash: true, published: true } });
const errorsOf = async (f: Fixture) => (await loadReadiness(prisma, [f.productId])).get(f.productId)!.errors.map((e) => e.code);

describe("Duyệt sản phẩm (QT2)", () => {
  it("chưa duyệt → không bật hiển thị được; duyệt lưu người + dấu vân tay + audit; còn lỗi bước trước thì không duyệt được", async () => {
    const f = await readyFixture();
    expect(await errorsOf(f)).toEqual(["NOT_APPROVED"]);
    expect(await setProductsPublished({ ids: [f.productId], published: true }, f.userId)).toMatchObject({ changed: 0, blocked: [{ issues: [{ code: "NOT_APPROVED" }] }] });

    await prisma.variant.update({ where: { id: f.variantId }, data: { priceMmk: 0 } });
    await expect(approveProduct({ id: f.productId }, f.userId)).rejects.toThrow(/Còn lỗi/);
    await prisma.variant.update({ where: { id: f.variantId }, data: { priceMmk: 10_000 } });

    await approveProduct({ id: f.productId }, f.userId);
    expect(await state(f)).toMatchObject({ approvedById: f.userId, approvedHash: expect.any(String) });
    expect(await prisma.auditLog.count({ where: { action: "product.approve", entityId: f.productId } })).toBe(1);
    await expect(approveProduct({ id: f.productId }, f.userId)).rejects.toThrow(/đã được duyệt/);
    expect(await errorsOf(f)).toEqual([]);
    expect(await setProductsPublished({ ids: [f.productId], published: true }, f.userId)).toMatchObject({ changed: 1, blocked: [] });
  });

  it("tự huỷ duyệt: sửa giá tay / bảng tính giá / form / ảnh → cần duyệt lại; lưu không đổi gì thì giữ duyệt", async () => {
    const f = await readyFixture();
    const reapprove = async () => {
      await approveProduct({ id: f.productId }, f.userId);
      expect((await state(f)).approvedAt).not.toBeNull();
    };
    const expectReset = async (count: number) => {
      const s = await state(f);
      expect(s.approvedAt).toBeNull();
      expect(s.approvedHash).not.toBeNull(); // "cần duyệt lại", không phải "chưa duyệt"
      expect(await prisma.auditLog.count({ where: { action: "product.approval_reset", entityId: f.productId } })).toBe(count);
    };
    // Lần lưu đầu chép tên còn thiếu (fixture chỉ có tên tiếng Anh) → lưu trước khi duyệt.
    await saveProduct((await getProductForEdit(f.productId))!, f.userId);
    await reapprove();
    // Lưu form không đổi nội dung → vẫn duyệt.
    await saveProduct((await getProductForEdit(f.productId))!, f.userId);
    expect((await state(f)).approvedAt).not.toBeNull();

    await saveProductPricing({ productId: f.productId, reason: "test", variants: [{ id: f.variantId, priceMmk: 12_000 }] }, f.userId);
    await expectReset(1);

    await reapprove();
    const edit = (await getProductForEdit(f.productId))!;
    await saveProduct({ ...edit, en: { ...edit.en, description: "Changed" } }, f.userId);
    await expectReset(2);

    await reapprove();
    const rate = await prisma.exchangeRate.create({ data: { mmkPerVnd: "0.2", createdById: f.userId } });
    const run = await previewRun({ locationId: f.mm.id, rateId: rate.id, marginPct: "30", shipMmkPerKg: 8_000, variantIds: [f.variantId] }, f.userId);
    await applyRun(run.id, [f.variantId], f.userId);
    await expectReset(3);

    // Ảnh: đổi thứ tự ảnh (hàm thật) → cần duyệt lại.
    const images = [];
    for (const n of [1, 2]) {
      const file = await prisma.fileObject.create({ data: { driver: "LOCAL", visibility: "PUBLIC", key: `approval/${f.tag}-${n}.png`, url: `/api/files/approval/${f.tag}-${n}.png`, mime: "image/png", size: 1 } });
      images.push(await prisma.productImage.create({ data: { productId: f.productId, fileId: file.id, sortOrder: n } }));
    }
    await reapprove();
    await reorderProductImage(images[1].id, "up", f.userId);
    await expectReset(4);
  });

  it("SP đang hiển thị sửa sau khi duyệt: vẫn hiển thị (không tự ẩn), lưu được; danh sách + dashboard đếm 'cần duyệt lại'", async () => {
    const f = await readyFixture();
    await approveProduct({ id: f.productId }, f.userId);
    await setProductsPublished({ ids: [f.productId], published: true }, f.userId);
    await saveProductPricing({ productId: f.productId, reason: "test", variants: [{ id: f.variantId, priceMmk: 15_000 }] }, f.userId);
    expect(await state(f)).toMatchObject({ approvedAt: null, published: true });
    expect(await errorsOf(f)).toEqual(["NOT_APPROVED"]);
    const edit = (await getProductForEdit(f.productId))!;
    await saveProduct({ ...edit, en: { ...edit.en, name: "Renamed" } }, f.userId); // không bị chặn

    expect((await listProductsAdmin({ brandId: f.brandId, status: "reapprove" })).map((p) => p.id)).toEqual([f.productId]);
    expect((await listProductsAdmin({ brandId: f.brandId, status: "toApprove" })).map((p) => p.id)).toEqual([]);
    expect((await approvalCounts()).reapprove).toBeGreaterThanOrEqual(1);
  });
});
