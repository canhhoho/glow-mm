import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createDocument, postDocument } from "@/server/inventory/documents";
import { batchDetail, parseStockFilter, stockByVariant, stockLots, stockSummary } from "@/server/inventory/overview";
import { createOrder } from "@/server/orders/orders";
import { deleteProducts } from "@/server/catalog/product-delete";
import { blockedBatchWhere, sellableBatchWhere } from "@/server/inventory/fefo";
import { isoDay, makeFixture, orderInput, saleFixture, unpublishTestProducts, type SaleFixture } from "./fixtures";

// P9b: số liệu trang Tồn kho khớp sổ kho. Mọi truy vấn lọc theo mã fixture (q = tag) vì DB test dùng chung.

afterAll(unpublishTestProducts);

async function post(f: SaleFixture, input: Record<string, unknown>) {
  const doc = await createDocument(input, f.userId);
  await postDocument(doc.id, f.userId);
}

/**
 * Kho MM: A (400 ngày) 10 → 1 sang Chờ KT; B (120 ngày, cận hạn) 5; C (30 ngày, ngừng bán) 4; A tester 2.
 * Kho VN: D (500 ngày) 8 → 3 sang Đang vận chuyển. Đơn web giữ 2. A có giá vốn 1.000 MMK, lô khác chưa phân bổ.
 * Combo = 2 × biến thể này.
 */
async function scenario() {
  const f = await saleFixture([
    { lot: "A", expiryInDays: 400, qty: 10 },
    { lot: "B", expiryInDays: 120, qty: 5 },
    { lot: "C", expiryInDays: 30, qty: 4 },
  ], { cost: false });
  const v = f.variantId;
  const receive = (toId: string, lotNo: string, days: number, qty: number, stockType = "SELLABLE") =>
    post(f, { type: "RECEIVE", toId, lines: [{ variantId: v, lotNo, expiryDate: isoDay(days), unitCostVnd: 100_000, qty, stockType }] });
  await receive(f.mm.id, "A", 400, 2, "TESTER");
  await receive(f.vn.id, "D", 500, 8);
  const lot = async (lotNo: string) => prisma.batch.findUniqueOrThrow({ where: { variantId_lotNo: { variantId: v, lotNo } } });
  const [a, c, d] = [await lot("A"), await lot("C"), await lot("D")];
  await post(f, { type: "TRANSFER", fromId: f.vn.id, toId: f.transit.id, lines: [{ variantId: v, batchId: d.id, qty: 3 }] });
  await post(f, { type: "TRANSFER", fromId: f.mm.id, toId: f.qc.id, lines: [{ variantId: v, batchId: a.id, qty: 1 }] });
  await prisma.batch.update({ where: { id: a.id }, data: { landedCostMmk: 1000 } }); // giá vốn (không phải số lượng)
  await createOrder(orderInput(f, 2), { userId: null });
  const combo = await prisma.variant.create({
    data: {
      productId: f.productId,
      sku: `IT-${f.tag}-CB`,
      label: "Combo",
      priceMmk: 18000,
      isBundle: true,
      bundleItems: { create: { componentId: v, qty: 2 } },
    },
  });
  return { f, a, c, d, combo };
}

const filter = (tag: string, extra: Record<string, string> = {}) => parseStockFilter({ q: tag, ...extra });

describe("Trang Tồn kho — số liệu khớp sổ kho", () => {
  it("theo sản phẩm: cột VN / đang VC / MM / tester / chờ KT / đang giữ / còn bán; combo; khớp ledger", async () => {
    const { f, combo } = await scenario();
    const page = await stockByVariant(filter(f.tag));
    expect(page.total).toBe(2);
    const [row, bundle] = page.rows; // IT-tag < IT-tag-CB
    expect(row.variantId).toBe(f.variantId);
    expect(row.cols).toMatchObject({ vn: 5, inbound: 3, mm: 18, tester: 2, quarantine: 1, valueMmk: 12_000, unvalued: true });
    expect(row.cols!.earliest?.lotNo).toBe("C");
    expect(row.lotCount).toBe(4);
    expect(row.reserved).toBe(2);
    expect(row.available).toBe(9 + 5 - 2); // A + B ở kho bán; C ngừng bán; trừ giữ hàng

    // Combo: không có dòng tồn, còn bán = số bộ ghép được.
    expect(bundle).toMatchObject({ variantId: combo.id, isBundle: true, cols: null, available: 6 });

    // Tổng các cột = tổng ledger của biến thể (mọi vị trí, mọi loại tồn).
    const ledger = await prisma.stockLedger.aggregate({ where: { batch: { variantId: f.variantId } }, _sum: { qtyDelta: true } });
    const c = row.cols!;
    expect(c.vn + c.inbound + c.mm + c.tester + c.quarantine).toBe(ledger._sum.qtyDelta);
  });

  it("ô số tổng theo phạm vi fixture", async () => {
    const { f } = await scenario();
    const s = await stockSummary({ q: f.tag });
    expect(s).toMatchObject({
      sellableUnits: 14,
      heldUnits: 2,
      // P1-B: ô "Bán được" = khả dụng như storefront (bằng cột "còn bán" theo SP).
      availableUnits: 9 + 5 - 2,
      sellableVariants: 1,
      valueMmk: 12_000,
      unvaluedUnits: 5 + 4 + 8,
      inbound: { units: 3, lots: 1 },
      near: { units: 5, lots: 1 },
      blocked: { units: 4, lots: 1 },
      byLocationType: { VN_STOCK: 5, IN_TRANSIT: 3, CUSTOMS: 0, MM_STOCK: 20, QUARANTINE: 1 },
      variants: 1,
      lots: 4,
    });
  });

  it("lọc tab vị trí / hạn dùng / loại tồn; theo lô có phân trang", async () => {
    const { f, a, c, d } = await scenario();
    const lots = await stockLots(filter(f.tag));
    expect(lots.total).toBe(7);
    expect(lots.pageCount).toBe(1);
    expect((await stockLots(filter(f.tag, { page: "2" }))).rows).toEqual([]);

    const only = async (extra: Record<string, string>) =>
      (await stockLots(filter(f.tag, extra))).rows.map((r) => [r.batchId, r.locationCode, r.stockType, r.qty]);
    expect(await only({ tab: "IN_TRANSIT" })).toEqual([[d.id, f.transit.code, "SELLABLE", 3]]);
    expect(await only({ tab: "QUARANTINE" })).toEqual([[a.id, f.qc.code, "SELLABLE", 1]]);
    expect(await only({ expiry: "blocked" })).toEqual([[c.id, f.mm.code, "SELLABLE", 4]]);
    expect(await only({ expiry: "expired" })).toEqual([]);
    expect(await only({ stockType: "TESTER" })).toEqual([[a.id, f.mm.code, "TESTER", 2]]);
    expect((await only({ expiry: "near" })).map((r) => r[0])).toHaveLength(1);

    // Theo sản phẩm có lọc → chỉ biến thể có dòng tồn khớp (combo không còn).
    const byVariant = await stockByVariant(filter(f.tag, { tab: "MM_STOCK" }));
    expect(byVariant.rows.map((r) => r.variantId)).toEqual([f.variantId]);

    // Giá trị lạ trên URL → mặc định.
    expect(parseStockFilter({ tab: "x y!", expiry: "?", stockType: "nope", page: "-3" })).toEqual({ tab: "all", page: 1 });
    // P24: tab = mã kho → lọc theo kho.
    expect(parseStockFilter({ tab: f.mm.code }).tab).toBe(f.mm.code);
  });

  it("lịch sử lô: tồn luỹ kế khớp tồn hiện tại theo vị trí", async () => {
    const { f, a } = await scenario();
    const detail = (await batchDetail(a.id))!;
    expect(detail.batch.lotNo).toBe("A");
    expect(detail.entries.map((e) => e.document.type)).toEqual(["RECEIVE", "RECEIVE", "TRANSFER", "TRANSFER"]);
    expect(detail.total).toBe(9 + 2 + 1);
    expect(detail.entries.at(-1)!.balanceAfter).toBe(detail.total);
    expect(detail.batch.balances.reduce((s, b) => s + b.qty, 0)).toBe(detail.total);
    expect(detail.batch.balances.map((b) => [b.location.code, b.stockType, b.qty]).sort()).toEqual(
      [
        [f.mm.code, "SELLABLE", 9],
        [f.mm.code, "TESTER", 2],
        [f.qc.code, "SELLABLE", 1],
      ].sort(),
    );
    expect(await batchDetail("khong-co")).toBeNull();
  });
});

describe("R5: lô bị chặn = phần bù của lô bán được", () => {
  it("blockedBatchWhere (Tồn kho + badge menu) và sellableBatchWhere chia hết các lô, không trùng", async () => {
    const f = await saleFixture([
      { lot: "A", expiryInDays: 400, qty: 1 },
      { lot: "C", expiryInDays: 30, qty: 1 },
    ]);
    await post(f, { type: "RECEIVE", toId: f.mm.id, lines: [{ variantId: f.variantId, lotNo: "U", expiryStatus: "UNKNOWN", unitCostVnd: 100, qty: 1 }] });
    const g = await makeFixture();
    await prisma.product.update({ where: { id: g.productId }, data: { requiresExpiry: false } });
    const doc = await createDocument({ type: "RECEIVE", toId: g.mm.id, lines: [{ variantId: g.variantId, lotNo: "N", expiryStatus: "NONE", unitCostVnd: 100, qty: 1 }] }, g.userId);
    await postDocument(doc.id, g.userId);

    const now = new Date();
    const lots = (where: object) =>
      prisma.batch
        .findMany({ where: { variantId: { in: [f.variantId, g.variantId] }, ...where }, select: { lotNo: true } })
        .then((r) => r.map((b) => b.lotNo).sort());
    expect(await lots(blockedBatchWhere(now, 90))).toEqual(["C", "U"]);
    expect(await lots(sellableBatchWhere(now, 90))).toEqual(["A", "N"]);
  });
});

describe("SP ngừng kinh doanh ở trang Tồn kho (bấm Xoá nhưng có lịch sử)", () => {
  const ids = async (f: { tag: string }, extra: Record<string, string> = {}) => {
    const page = await stockByVariant(filter(f.tag, extra));
    return page.rows.map((r) => ({ sku: r.sku, archived: r.archived }));
  };

  it("còn tồn → vẫn ở Tất cả kèm nhãn; hết tồn → chỉ ở Lịch sử; đang giữ hàng → vẫn hiện", async () => {
    // Còn tồn.
    const withStock = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 2 }]);
    expect(await ids(withStock)).toEqual([{ sku: `IT-${withStock.tag}`, archived: false }]);
    expect(await deleteProducts([withStock.productId], withStock.userId)).toEqual({ deleted: 0, archived: 1 });
    expect(await ids(withStock)).toEqual([{ sku: `IT-${withStock.tag}`, archived: true }]);
    expect(await ids(withStock, { status: "archived" })).toEqual([{ sku: `IT-${withStock.tag}`, archived: true }]);
    expect(await ids(withStock, { status: "history" })).toEqual([]);

    // Đã xuất hết rồi ngừng kinh doanh → không còn ở Tất cả, chỉ ở Lịch sử hết tồn.
    const empty = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 1 }]);
    await post(empty, { type: "ISSUE", fromId: empty.mm.id, reason: "IT xuất hết", lines: [{ variantId: empty.variantId, qty: 1 }] });
    expect(await deleteProducts([empty.productId], empty.userId)).toEqual({ deleted: 0, archived: 1 });
    expect(await ids(empty)).toEqual([]);
    expect(await ids(empty, { status: "archived" })).toEqual([]);
    expect(await ids(empty, { status: "history" })).toEqual([{ sku: `IT-${empty.tag}`, archived: true }]);

    // Hết tồn nhưng còn giữ hàng cho đơn chưa xử lý → vẫn hiện (không giấu đơn đang chờ).
    const held = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 1 }]);
    await post(held, { type: "ISSUE", fromId: held.mm.id, reason: "IT xuất hết", lines: [{ variantId: held.variantId, qty: 1 }] });
    await deleteProducts([held.productId], held.userId);
    const other = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 1 }]);
    const order = await createOrder(orderInput(other, 1), { userId: null });
    await prisma.reservation.create({ data: { orderId: order.id, variantId: held.variantId, qty: 1, status: "ACTIVE" } });
    expect(await ids(held)).toEqual([{ sku: `IT-${held.tag}`, archived: true }]);
    expect(await ids(held, { status: "archived" })).toEqual([{ sku: `IT-${held.tag}`, archived: true }]);
    expect(await ids(held, { status: "history" })).toEqual([]);

    // Bộ lọc lạ → mặc định; theo lô cũng mang cờ ngừng kinh doanh.
    expect(parseStockFilter({ status: "xoa" }).status).toBeUndefined();
    const lots = await stockLots(filter(withStock.tag));
    expect(lots.rows.map((r) => r.archived)).toEqual([true]);
  });
});
