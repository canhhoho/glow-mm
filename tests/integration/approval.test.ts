import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { listProductsAdmin, getProductForEdit } from "@/server/catalog/admin-queries";
import { commitCatalogImport, previewCatalogImport } from "@/server/catalog/catalog-import";
import { addProductImages, deleteProductImage, reorderProductImage } from "@/server/catalog/images";
import { saveProductPricing } from "@/server/catalog/product-pricing";
import { saveProduct, setProductsPublished } from "@/server/catalog/products";
import { discardChanges, productEditView, reviewCounts, reviewProducts, saveAndApprove, submitProducts } from "@/server/catalog/review";
import { createDocument, postDocument } from "@/server/inventory/documents";
import { applyRun, createRate, previewRun } from "@/server/pricing/runs";
import { makeFixture, unpublishTestProducts, type Fixture } from "./fixtures";

// Quy tắc khi BẬT giá tự động (khối lượng là lỗi chặn ở kho nhập VN); hành vi tắt: tests/unit/readiness-weight-off.test.ts.
vi.mock("@/lib/features", async (orig) => (await import("../support/features")).featuresWith(orig, { autoPricing: true }));


afterAll(unpublishTestProducts);

// P1-A — quy trình duyệt (kế hoạch admin bản sửa 5 §4): gửi duyệt tường minh, duyệt/đăng/từ chối có CAS phiên bản,
// SP đã duyệt sửa nội dung/giá/ảnh → bản đang sửa (khách vẫn thấy bản đã duyệt).

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

/** SP fixture đủ điều kiện mở bán (khối lượng, đã nhập kho, slug hợp lệ để lưu qua form). */
async function readyFixture() {
  const f = await makeFixture();
  await prisma.product.update({ where: { id: f.productId }, data: { slug: `it-${f.tag.toLowerCase()}` } });
  await prisma.variant.update({ where: { id: f.variantId }, data: { weightGrams: 100 } });
  const doc = await createDocument({ type: "RECEIVE", toId: f.mm.id, lines: [{ variantId: f.variantId, lotNo: "A", expiryDate: "2029-12-31", unitCostVnd: 100_000, qty: 3 }] }, f.userId);
  await postDocument(doc.id, f.userId);
  return f;
}
const state = (f: Fixture) =>
  prisma.product.findUniqueOrThrow({
    where: { id: f.productId },
    select: { approvedAt: true, approvedById: true, approvedHash: true, published: true, approvalStatus: true, approvalVersion: true, rejectionReason: true, firstPublishedAt: true },
  });
const version = async (f: Fixture) => (await state(f)).approvalVersion;
const formOf = async (f: Fixture) => (await getProductForEdit(f.productId))!;
const enName = async (f: Fixture) => (await prisma.productTranslation.findUniqueOrThrow({ where: { productId_locale: { productId: f.productId, locale: "en" } } })).name;
const price = async (f: Fixture) => (await prisma.variant.findUniqueOrThrow({ where: { id: f.variantId } })).priceMmk;
const hasCr = async (f: Fixture) => !!(await prisma.productChangeRequest.findUnique({ where: { productId: f.productId } }));

/** Đưa SP qua gửi duyệt + Duyệt & Đăng (SP mới). */
async function approvePublished(f: Fixture) {
  expect(await submitProducts({ ids: [f.productId] }, f.userId)).toMatchObject([{ ok: true }]);
  expect(await reviewProducts({ decision: "approvePublish", items: [{ id: f.productId, version: await version(f) }] }, f.userId)).toMatchObject([{ ok: true }]);
}

describe("Quy trình duyệt SP chưa từng duyệt", () => {
  it("đủ điều kiện không tự vào hàng đợi; gửi duyệt → Duyệt & Đăng lưu người, dấu vân tay, lần đăng đầu, audit", async () => {
    const f = await readyFixture();
    expect(await state(f)).toMatchObject({ approvalStatus: "DRAFT", approvedAt: null });
    expect(await setProductsPublished({ ids: [f.productId], published: true }, f.userId)).toMatchObject({ changed: 0, blocked: [{ issues: [{ code: "NOT_APPROVED" }] }] });

    await approvePublished(f);
    const s = await state(f);
    expect(s).toMatchObject({ approvalStatus: "APPROVED", approvedById: f.userId, published: true });
    expect(s.approvedHash).toMatch(/^[0-9a-f]{32}$/);
    expect(s.firstPublishedAt).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { entityId: f.productId, action: { in: ["product.submit", "product.approve", "product.publish"] } } })).toBe(3);
  });

  it("còn lỗi mở bán → không gửi duyệt được; DB chặn đăng bán khi chưa duyệt", async () => {
    const f = await makeFixture(); // thiếu khối lượng (kho VN)
    expect(await submitProducts({ ids: [f.productId] }, f.userId)).toMatchObject([{ ok: false, issues: [{ code: "NO_WEIGHT" }] }]);
    expect((await state(f)).approvalStatus).toBe("DRAFT");
    await expect(prisma.product.update({ where: { id: f.productId }, data: { published: true } })).rejects.toThrow(/Product_published_requires_approval/);
  });

  it("sửa khi đang chờ duyệt → tự về Nháp; duyệt bằng phiên bản cũ bị bỏ qua (không duyệt bản chưa xem)", async () => {
    const f = await readyFixture();
    await submitProducts({ ids: [f.productId] }, f.userId);
    const seen = await version(f);
    await saveProduct({ ...(await formOf(f)), en: { name: "Đổi tên", description: "", usage: "" } }, f.userId);
    expect(await state(f)).toMatchObject({ approvalStatus: "DRAFT" });
    expect(await version(f)).toBe(seen + 1);
    const [r] = await reviewProducts({ decision: "approve", items: [{ id: f.productId, version: seen }] }, f.userId);
    expect(r).toMatchObject({ ok: false, stateChanged: true });
    expect((await state(f)).approvedAt).toBeNull();

    // Sửa phần không cần duyệt (khối lượng) khi đang chờ duyệt → vẫn ở hàng đợi.
    await submitProducts({ ids: [f.productId] }, f.userId);
    const form = await formOf(f);
    await saveProduct({ ...form, variants: form.variants.map((v) => ({ ...v, weightGrams: 150 })) }, f.userId);
    expect((await state(f)).approvalStatus).toBe("PENDING");
  });

  it("từ chối bắt buộc lý do; sửa vẫn giữ Bị từ chối; gửi lại → chờ duyệt, xoá lý do", async () => {
    const f = await readyFixture();
    await submitProducts({ ids: [f.productId] }, f.userId);
    await expect(reviewProducts({ decision: "reject", items: [{ id: f.productId, version: await version(f) }], reason: "x" }, f.userId)).rejects.toThrow("ít nhất 5");
    expect(await reviewProducts({ decision: "reject", items: [{ id: f.productId, version: await version(f) }], reason: "Ảnh chưa đạt" }, f.userId)).toMatchObject([{ ok: true }]);
    expect(await state(f)).toMatchObject({ approvalStatus: "REJECTED", rejectionReason: "Ảnh chưa đạt" });
    await saveProduct({ ...(await formOf(f)), en: { name: "Sửa lại", description: "", usage: "" } }, f.userId);
    expect((await state(f)).approvalStatus).toBe("REJECTED");
    await submitProducts({ ids: [f.productId] }, f.userId);
    expect(await state(f)).toMatchObject({ approvalStatus: "PENDING", rejectionReason: null });
    expect(await reviewCounts()).toMatchObject({ pending: expect.any(Number) });
    expect((await listProductsAdmin({ brandId: f.brandId, status: "review" })).map((p) => p.id)).toEqual([f.productId]);
  });

  it("hai người duyệt cùng lúc: đúng một lần duyệt thành công", async () => {
    const f = await readyFixture();
    await submitProducts({ ids: [f.productId] }, f.userId);
    const items = [{ id: f.productId, version: await version(f) }];
    const [a, b] = await Promise.all([reviewProducts({ decision: "approve", items }, f.userId), reviewProducts({ decision: "approve", items }, f.userId)]);
    expect([a[0].ok, b[0].ok].sort()).toEqual([false, true]);
  });

  it("Lưu & Duyệt (người có quyền duyệt): một thao tác, ghi selfApproved", async () => {
    const f = await readyFixture();
    await saveAndApprove(await formOf(f), f.userId, { publish: true });
    expect(await state(f)).toMatchObject({ approvalStatus: "APPROVED", published: true });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: f.productId, action: "product.approve" } });
    expect(audit.data).toMatchObject({ selfApproved: true });
  });
});

describe("SP đã duyệt: bản đang sửa (khách vẫn thấy bản đã duyệt)", () => {
  it("sửa tên → bản đang sửa, live giữ nguyên; khối lượng ghi thẳng; gửi + duyệt thay đổi → áp vào live, vẫn đang bán", async () => {
    const f = await readyFixture();
    await approvePublished(f);
    const before = await enName(f);
    const form = await formOf(f);
    await saveProduct({ ...form, en: { ...form.en, name: "Tên mới" }, variants: form.variants.map((v) => ({ ...v, weightGrams: 120 })) }, f.userId);
    expect(await enName(f)).toBe(before); // khách vẫn thấy tên cũ
    expect((await prisma.variant.findUniqueOrThrow({ where: { id: f.variantId } })).weightGrams).toBe(120); // không cần duyệt
    expect(await state(f)).toMatchObject({ approvalStatus: "DRAFT", published: true });
    const view = (await productEditView(f.productId))!;
    expect(view.edit.en.name).toBe("Tên mới"); // form hiện bản đang sửa
    expect(view.changes).toEqual(expect.arrayContaining([{ kind: "name", locale: "en" }]));

    // Lưu lại đúng bản đang sửa → không tăng phiên bản.
    const v1 = await version(f);
    await saveProduct({ ...view.edit }, f.userId);
    expect(await version(f)).toBe(v1);

    await submitProducts({ ids: [f.productId] }, f.userId);
    expect(await reviewProducts({ decision: "approve", items: [{ id: f.productId, version: await version(f) }] }, f.userId)).toMatchObject([{ ok: true }]);
    expect(await enName(f)).toBe("Tên mới");
    expect(await hasCr(f)).toBe(false);
    expect(await state(f)).toMatchObject({ approvalStatus: "APPROVED", published: true });
  });

  it("đổi giá (Giá bán) → chờ duyệt, khách vẫn thấy giá cũ; giá hiệu lực chống ghi đè; duyệt → PriceHistory lý do gốc", async () => {
    const f = await readyFixture();
    await approvePublished(f);
    await saveProductPricing({ productId: f.productId, reason: "Tăng giá", variants: [{ id: f.variantId, priceMmk: 12_000, expectedPriceMmk: 10_000 }] }, f.userId);
    expect(await price(f)).toBe(10_000);
    // Form cũ (giá 10.000) không đè được giá đang chờ duyệt.
    await expect(saveProductPricing({ productId: f.productId, reason: "x", variants: [{ id: f.variantId, priceMmk: 13_000, expectedPriceMmk: 10_000 }] }, f.userId)).rejects.toThrow("vừa được đổi");
    await submitProducts({ ids: [f.productId] }, f.userId);
    await reviewProducts({ decision: "approve", items: [{ id: f.productId, version: await version(f) }] }, f.userId);
    expect(await price(f)).toBe(12_000);
    expect(await prisma.priceHistory.findMany({ where: { variantId: f.variantId }, select: { oldPriceMmk: true, newPriceMmk: true, reason: true } })).toEqual([
      { oldPriceMmk: 10_000, newPriceMmk: 12_000, reason: "manual: Tăng giá" },
    ]);
  });

  it("bảng tính giá trên SP đã duyệt → giá vào bản đang sửa (giữ runId); từ chối giữ live; huỷ thay đổi → về đã duyệt", async () => {
    const f = await readyFixture();
    await approvePublished(f);
    const rate = await createRate({ mmkPerUsd: "2600", vndPerUsd: "26000" }, f.userId);
    const run = await previewRun({ locationId: f.mm.id, rateId: rate.id, marginPct: "50", shipMmkPerKg: 1000, roundTo: 1, variantIds: [f.variantId] }, f.userId);
    const res = await applyRun(run.id, [f.variantId], f.userId);
    expect(res).toMatchObject({ applied: 1, awaitingApproval: 1 });
    expect(await price(f)).toBe(10_000);
    const cr = await prisma.productChangeRequest.findUniqueOrThrow({ where: { productId: f.productId } });
    expect(cr.prices).toMatchObject({ [f.variantId]: { reason: "bulk", runId: run.id, baseLivePrice: 10_000 } });

    await submitProducts({ ids: [f.productId] }, f.userId);
    await reviewProducts({ decision: "reject", items: [{ id: f.productId, version: await version(f) }], reason: "Giá quá cao" }, f.userId);
    expect(await price(f)).toBe(10_000);
    expect(await state(f)).toMatchObject({ approvalStatus: "REJECTED", published: true });

    await discardChanges({ id: f.productId }, f.userId);
    expect(await hasCr(f)).toBe(false);
    expect(await state(f)).toMatchObject({ approvalStatus: "APPROVED", rejectionReason: null });
  });

  it("ảnh: thêm / xoá vào bản đang sửa, khách chưa thấy; sắp xếp ghi thẳng; duyệt → áp", async () => {
    const f = await readyFixture();
    await addProductImages(f.productId, [{ data: PNG, mime: "image/png" }], f.userId);
    await addProductImages(f.productId, [{ data: PNG, mime: "image/png" }], f.userId);
    await approvePublished(f);
    const live = await prisma.productImage.findMany({ where: { productId: f.productId }, orderBy: { sortOrder: "asc" } });
    expect((await reorderProductImage(live[1].id, "up", f.userId)).moved).toBe(true); // không cần duyệt
    expect(await hasCr(f)).toBe(false);

    await addProductImages(f.productId, [{ data: PNG, mime: "image/png" }], f.userId);
    await deleteProductImage(live[0].id, f.userId);
    expect(await prisma.productImage.count({ where: { productId: f.productId } })).toBe(2);
    expect((await productEditView(f.productId))!.changes).toEqual([{ kind: "imagesAdded", count: 1 }, { kind: "imagesRemoved", count: 1 }]);

    await submitProducts({ ids: [f.productId] }, f.userId);
    await reviewProducts({ decision: "approve", items: [{ id: f.productId, version: await version(f) }] }, f.userId);
    const after = await prisma.productImage.findMany({ where: { productId: f.productId } });
    expect(after).toHaveLength(2);
    expect(after.map((i) => i.id)).not.toContain(live[0].id);
  });

  it("nhập Excel cập nhật SP đã duyệt: tên mới vào bản đang sửa, áp khi duyệt (Excel không còn cột giá)", async () => {
    const f = await readyFixture();
    await approvePublished(f);
    const sku = `IT-${f.tag}`;
    const csv = ["sku,name,brand,category", `${sku},Excel name,,`].join("\n");
    const preview = await previewCatalogImport({ csv });
    expect(preview.errors).toEqual([]);
    await commitCatalogImport(preview.input, f.userId);
    expect(await enName(f)).not.toBe("Excel name");
    expect(await price(f)).toBe(10_000);
    const view = (await productEditView(f.productId))!;
    expect(view.changes).toEqual(expect.arrayContaining([{ kind: "name", locale: "en" }]));
    await submitProducts({ ids: [f.productId] }, f.userId);
    await reviewProducts({ decision: "approve", items: [{ id: f.productId, version: await version(f) }] }, f.userId);
    expect(await enName(f)).toBe("Excel name");
    expect(await price(f)).toBe(10_000);
  });

});
