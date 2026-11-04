import { describe, expect, it, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { toCsv } from "@/lib/csv";
import { PRODUCT_CSV_COLUMNS, STOCK_CSV_COLUMNS } from "@/server/catalog/products";
import { commitOpening, previewOpening } from "@/server/catalog/opening";
import { createDocument, postDocument, resolveBatchExpiry } from "@/server/inventory/documents";
import { availableToSell } from "@/server/orders/availability";
import { createOrder } from "@/server/orders/orders";
import { transitionOrder } from "@/server/orders/transitions";
import { remitCod } from "@/server/orders/cod";
import { makeFixture, saleFixture, admin, orderInput, unpublishTestProducts } from "./fixtures";

afterAll(unpublishTestProducts);
const csv = (cols: readonly string[], row: Record<string, string | number>) => toCsv([[...cols], cols.map((c) => row[c] ?? "")]);
async function openingFixture() {
  const f = await makeFixture();
  await prisma.exchangeRate.create({ data: { mmkPerVnd: "0.2", createdById: f.userId } });
  const slug = `opening-${f.tag.toLowerCase()}`, sku = `OPEN-${f.tag}`;
  return { f, slug, sku, input: {
    products: csv(PRODUCT_CSV_COLUMNS, { product_slug: slug, sku, variant_label: "1 unit", name_my: "ပစ္စည်း", name_en: "Opening product", brand: "Opening brand", category: `it-${f.tag}`, price_mmk: 30000, weight_g: 80, expiry_policy: "NONE" }),
    stock: csv(STOCK_CSV_COLUMNS, { sku, lot_no: "OPEN", qty: 4, unit_cost_vnd: 100000, inbound_unit_vnd: 5000, selling_fee_mmk: 1000, expiry_status: "NONE" }),
    locationCode: f.mm.code,
  } };
}

describe("First stock import", () => {
  it("previews without writes; commits products and drafts once, values posted stock at the reviewed rate", async () => {
    const { f, input, sku, slug } = await openingFixture();
    const preview = await previewOpening(input);
    expect(preview.errors).toEqual([]);
    expect(preview.rows[0]).toMatchObject({ sku, qty: 4, cost: 21000, fee: 1000, profit: 8000, expiryStatus: "NONE", location: f.mm.code });
    expect(await prisma.product.findUnique({ where: { slug } })).toBeNull();
    const results = await Promise.allSettled([commitOpening(preview.input, f.userId), commitOpening(preview.input, f.userId)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const result = results.find((r) => r.status === "fulfilled")!;
    if (result.status !== "fulfilled") throw new Error("No import result");
    const product = await prisma.product.findUniqueOrThrow({ where: { slug }, include: { variants: true } });
    expect(product).toMatchObject({ published: false, requiresExpiry: false });
    const variantId = product.variants[0].id;
    expect((await availableToSell(prisma, [variantId], { now: new Date(), blockDays: 90 })).get(variantId)).toBe(0);
    await prisma.exchangeRate.create({ data: { mmkPerVnd: "0.3", createdById: f.userId } });
    await postDocument(result.value.documents[0].id, f.userId);
    const batch = await prisma.batch.findFirstOrThrow({ where: { variantId } });
    expect(batch).toMatchObject({ expiryStatus: "NONE", expiryDate: null, landedCostVnd: 105000, landedCostMmk: 21000 });
    expect((await availableToSell(prisma, [variantId], { now: new Date(), blockDays: 90 })).get(variantId)).toBe(4);
  });
  it("rejects bad stock and changed rates without creating products or drafts", async () => {
    const { f, input, slug } = await openingFixture();
    const preview = await previewOpening(input);
    await expect(commitOpening({ ...preview.input, stock: input.stock.replace(",4,", ",-1,") }, f.userId)).rejects.toThrow();
    expect(await prisma.product.findUnique({ where: { slug } })).toBeNull();
    await prisma.exchangeRate.create({ data: { mmkPerVnd: "0.4", createdById: f.userId } });
    await expect(commitOpening(preview.input, f.userId)).rejects.toThrow("Tỷ giá");
    expect(await prisma.product.findUnique({ where: { slug } })).toBeNull();
  });
  it("unknown batches remain blocked until a real expiry is confirmed", async () => {
    const f = await makeFixture();
    const doc = await createDocument({ type: "RECEIVE", toId: f.mm.id, lines: [{ variantId: f.variantId, lotNo: "U", expiryStatus: "UNKNOWN", unitCostVnd: 100, qty: 5 }] }, f.userId);
    await postDocument(doc.id, f.userId);
    const opts = { now: new Date(), blockDays: 90 };
    expect((await availableToSell(prisma, [f.variantId], opts)).get(f.variantId)).toBe(0);
    const batch = await prisma.batch.findFirstOrThrow({ where: { variantId: f.variantId } });
    const expiryDate = new Date(Date.now() + 400 * 86400000).toISOString().slice(0, 10);
    await resolveBatchExpiry({ batchId: batch.id, expiryDate }, f.userId);
    expect((await availableToSell(prisma, [f.variantId], opts)).get(f.variantId)).toBe(5);
    await expect(resolveBatchExpiry({ batchId: batch.id, expiryDate }, f.userId)).rejects.toThrow("Chỉ cập nhật");
    await expect(createDocument({ type: "RECEIVE", toId: f.mm.id, lines: [{ variantId: f.variantId, lotNo: "N", expiryStatus: "NONE", unitCostVnd: 100, qty: 1 }] }, f.userId)).rejects.toThrow("yêu cầu quản lý");
  });
});

describe("COD collection and remittance", () => {
  it("completion records collection only; reconciliation checks role, totals, duplicate submissions and audit", async () => {
    const f = await saleFixture([{ lot: "COD", expiryInDays: 400, qty: 3 }]);
    const order = await createOrder(orderInput(f, 1), { userId: f.userId });
    await transitionOrder(order.id, "confirmCod", admin(f));
    await transitionOrder(order.id, "ship", admin(f), { fromLocationId: f.mm.id, carrier: "VTP" });
    const completed = await transitionOrder(order.id, "complete", admin(f));
    expect(completed.codCollectedAt).not.toBeNull();
    expect(completed.codRemittedAt).toBeNull();
    const payload = { orderId: order.id, receivedMmk: order.totalMmk - 500, feeMmk: 500, reference: "BANK-COD-01" };
    await expect(remitCod(payload, { userId: f.userId, role: "ORDER_STAFF" })).rejects.toThrow("Không có quyền");
    await expect(remitCod({ ...payload, feeMmk: 0 }, admin(f))).rejects.toThrow("phải bằng");
    const results = await Promise.allSettled([remitCod(payload, admin(f)), remitCod(payload, admin(f))]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.order.findUnique({ where: { id: order.id } })).toMatchObject({ status: "COMPLETED", paymentStatus: "PAID", codRemittedMmk: order.totalMmk - 500, codCarrierFeeMmk: 500, codRemittanceRef: "BANK-COD-01" });
    expect(await prisma.auditLog.count({ where: { entityId: order.id, action: "order.cod-remit" } })).toBe(1);
  });
});
