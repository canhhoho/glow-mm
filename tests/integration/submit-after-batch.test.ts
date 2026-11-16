import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { commitCatalogImport, previewCatalogImport } from "@/server/catalog/catalog-import";
import { approveSubmitted, reviewProducts, submitProducts } from "@/server/catalog/review";
import { createDocument, postDocument } from "@/server/inventory/documents";
import { applyRun, createRate, previewRun } from "@/server/pricing/runs";
import { makeFixture, unpublishTestProducts, type Fixture } from "./fixtures";

afterAll(unpublishTestProducts);

// §6.4 — "Gửi duyệt ngay" (cùng transaction với lượt) / "Duyệt luôn" (sau commit, không tự đăng SP mới).

async function readyFixture() {
  const f = await makeFixture();
  await prisma.product.update({ where: { id: f.productId }, data: { slug: `it-${f.tag.toLowerCase()}` } });
  await prisma.variant.update({ where: { id: f.variantId }, data: { weightGrams: 100 } });
  const doc = await createDocument({ type: "RECEIVE", toId: f.mm.id, lines: [{ variantId: f.variantId, lotNo: "A", expiryDate: "2029-12-31", unitCostVnd: 100_000, qty: 3 }] }, f.userId);
  await postDocument(doc.id, f.userId);
  return f;
}
const state = (id: string) => prisma.product.findUniqueOrThrow({ where: { id }, select: { approvalStatus: true, approvalVersion: true, published: true, approvedAt: true } });
async function approvePublished(f: Fixture) {
  await submitProducts({ ids: [f.productId] }, f.userId);
  await reviewProducts({ decision: "approvePublish", items: [{ id: f.productId, version: (await state(f.productId)).approvalVersion }] }, f.userId);
}

describe("Gửi duyệt ngay / Duyệt luôn sau một lượt (§6.4)", () => {
  it("Excel: SP đang bán sửa tên → chờ duyệt cùng lượt; SP mới thiếu giá → liệt kê, lượt vẫn commit; duyệt luôn không đăng SP mới", async () => {
    const f = await readyFixture();
    await approvePublished(f);
    const cat = `it-${f.tag}`;
    const csv = [
      "sku,name,brand,category,weight_g",
      `IT-${f.tag},Renamed ${f.tag},,,`,
      `,New ${f.tag},IT ${f.tag},${cat},120`,
    ].join("\n");
    const preview = await previewCatalogImport({ csv });
    expect(preview.errors).toEqual([]);
    const res = await commitCatalogImport(preview.input, f.userId, { submit: true });
    expect(res.review?.submitted).toEqual([f.productId]);
    const enName = async () => (await prisma.productTranslation.findUniqueOrThrow({ where: { productId_locale: { productId: f.productId, locale: "en" } } })).name;
    const fresh = await prisma.product.findFirstOrThrow({ where: { translations: { some: { name: `New ${f.tag}` } } } });
    expect(res.review?.skipped).toEqual([expect.objectContaining({ id: fresh.id, issues: expect.arrayContaining([expect.objectContaining({ code: "PRICE_ZERO" })]) })]);
    expect(await state(f.productId)).toMatchObject({ approvalStatus: "PENDING", published: true });
    expect(await enName()).not.toBe(`Renamed ${f.tag}`); // chưa duyệt → khách vẫn thấy tên cũ
    expect(await state(fresh.id)).toMatchObject({ approvalStatus: "DRAFT", published: false });

    const approved = await approveSubmitted([f.productId], f.userId);
    expect(approved).toMatchObject([{ id: f.productId, ok: true }]);
    expect(await state(f.productId)).toMatchObject({ approvalStatus: "APPROVED", published: true });
    expect(await enName()).toBe(`Renamed ${f.tag}`);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { entityId: f.productId, action: "product.approve" }, orderBy: { createdAt: "desc" } });
    expect(log.data).toMatchObject({ selfApproved: true });
  });

  it("duyệt luôn SP mới chưa từng duyệt: đã duyệt nhưng KHÔNG đăng", async () => {
    const f = await readyFixture();
    const csv = ["sku,name,brand,category", `IT-${f.tag},Renamed ${f.tag},,`].join("\n");
    const preview = await previewCatalogImport({ csv });
    const res = await commitCatalogImport(preview.input, f.userId, { submit: true });
    expect(res.review?.submitted).toEqual([f.productId]);
    expect(await approveSubmitted(res.review!.submitted, f.userId)).toMatchObject([{ ok: true }]);
    expect(await state(f.productId)).toMatchObject({ approvalStatus: "APPROVED", published: false });
  });

  it("bảng tính giá: SP đã duyệt có giá mới → chờ duyệt; không chọn gửi → giữ nguyên như cũ", async () => {
    const f = await readyFixture();
    await approvePublished(f);
    const rate = await createRate({ mmkPerUsd: "2600", vndPerUsd: "26000" }, f.userId);
    const run = await previewRun({ locationId: f.mm.id, rateId: rate.id, marginPct: "50", shipMmkPerKg: 1000, roundTo: 1, variantIds: [f.variantId] }, f.userId);
    const res = await applyRun(run.id, [f.variantId], f.userId, new Date(), { submit: true });
    expect(res).toMatchObject({ applied: 1, review: { submitted: [f.productId], skipped: [] } });
    expect(await state(f.productId)).toMatchObject({ approvalStatus: "PENDING", published: true });

    const g = await readyFixture();
    await approvePublished(g);
    const run2 = await previewRun({ locationId: g.mm.id, rateId: rate.id, marginPct: "50", shipMmkPerKg: 1000, roundTo: 1, variantIds: [g.variantId] }, g.userId);
    const res2 = await applyRun(run2.id, [g.variantId], g.userId);
    expect(res2.review).toBeNull();
    expect(await state(g.productId)).toMatchObject({ approvalStatus: "DRAFT" });
  });
});
