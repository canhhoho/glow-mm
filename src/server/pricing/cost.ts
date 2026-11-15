import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { Tx } from "@/server/inventory/ledger";
import { bundleDefs } from "@/server/orders/availability";

/**
 * Lô đã thực nhập: có dòng phiếu RECEIVE đã ghi sổ, số lượng dương. Lô được tạo ngay khi lập phiếu nháp
 * và không bị xoá khi huỷ phiếu → phiếu nháp/huỷ không được là nguồn giá mua.
 */
export const postedReceiveBatch = {
  documentLines: { some: { qty: { gt: 0 }, document: { type: "RECEIVE", status: "POSTED" } } },
} satisfies Prisma.BatchWhereInput;

/**
 * Điều kiện chung của một dòng phiếu nhập được dùng làm **nguồn giá mua** (sửa luồng giá 16/11, A1):
 * phiếu RECEIVE đã ghi sổ, SL dương, hàng **bán được** (không phải Tester/quà), không nhập vào khu chờ kiểm tra.
 * Điều kiện kho (vào đúng kho bán của SP, hoặc kho chưa bán như VN/đang đi đường) không viết được bằng
 * Prisma → lọc thêm bằng `isSourceForProduct` sau khi đọc.
 */
export const receiptSourceLine = {
  qty: { gt: 0 },
  stockType: "SELLABLE",
  document: { type: "RECEIVE", status: "POSTED", postedAt: { not: null }, to: { type: { not: "QUARANTINE" } } },
} satisfies Prisma.StockDocumentLineWhereInput;

/** Lô có ít nhất một dòng nhập hợp lệ làm nguồn giá (cho danh sách "thiếu giá mua"). */
export const postedSourceBatch = { documentLines: { some: receiptSourceLine } } satisfies Prisma.BatchWhereInput;

/** Phiếu vào kho bán khác kho của SP → không phải nguồn giá của SP này. */
export function isSourceForProduct(to: { id: string; sellable: boolean } | null, productLocationId: string | null) {
  if (!to) return false;
  return to.sellable ? to.id === productLocationId : true;
}

/** Dòng phiếu nhập đã ghi sổ được chọn làm nguồn giá mua (D1: truy được lô + phiếu + ngày ghi sổ). */
export type CostSource = { lineId: string; batchId: string; lotNo: string; documentId: string; documentCode: string; postedAt: Date | null };

/**
 * `costVnd`: giá trị vốn theo loại tiền đang tính (VND, hoặc MMK với kho mua MMK — giữ tên cũ).
 * Biến thể thường có `source`; combo có `components` (mỗi thành phần × số lượng, kèm nguồn).
 */
export type VariantCost = {
  costVnd: number;
  landed: boolean;
  source?: CostSource;
  components?: { componentId: string; qty: number; cost: number; source: CostSource }[];
} | null;
export type CostCurrency = "VND" | "MMK";

/** Một lần nhập hợp lệ của biến thể (trang Giá bán: chọn lô / lần nhập làm cơ sở). */
export type ReceiptSource = CostSource & { qty: number; unitCostVnd: number | null; unitCostMmk: number | null; expiryDate: Date | null };

const sourceSelect = {
  id: true,
  variantId: true,
  qty: true,
  // P1-C: giá mua của CHÍNH lần nhập (lô nhập nhiều lần có giá bình quân riêng ở Batch).
  unitCostVnd: true,
  unitCostMmk: true,
  document: { select: { id: true, code: true, postedAt: true, to: { select: { id: true, sellable: true } } } },
  batch: { select: { id: true, lotNo: true, unitCostVnd: true, landedCostVnd: true, unitCostMmk: true, expiryDate: true } },
} satisfies Prisma.StockDocumentLineSelect;

async function productLocations(tx: Tx, variantIds: string[]) {
  const owners = await tx.variant.findMany({ where: { id: { in: variantIds } }, select: { id: true, product: { select: { stockLocationId: true } } } });
  return new Map(owners.map((v) => [v.id, v.product.stockLocationId]));
}

/**
 * Mọi lần nhập hợp lệ làm nguồn giá của các biến thể (mới nhất trước). Lô nhập nhiều lần → mỗi lần một dòng,
 * giá của chính lần nhập đó (không bình quân).
 */
export async function receiptSources(tx: Tx, variantIds: string[]): Promise<Map<string, ReceiptSource[]>> {
  if (variantIds.length === 0) return new Map();
  const [lines, loc] = await Promise.all([
    tx.stockDocumentLine.findMany({
      where: { variantId: { in: variantIds }, ...receiptSourceLine },
      orderBy: [{ document: { postedAt: "desc" } }, { documentId: "desc" }, { id: "desc" }],
      select: sourceSelect,
    }),
    productLocations(tx, variantIds),
  ]);
  const out = new Map<string, ReceiptSource[]>();
  for (const l of lines) {
    const b = l.batch;
    if (!b || !isSourceForProduct(l.document.to, loc.get(l.variantId) ?? null)) continue;
    const list = out.get(l.variantId) ?? [];
    list.push({
      lineId: l.id,
      batchId: b.id,
      lotNo: b.lotNo,
      documentId: l.document.id,
      documentCode: l.document.code,
      postedAt: l.document.postedAt,
      qty: l.qty,
      // Dòng phiếu cũ (trước P1-C) không lưu giá → dùng giá của lô.
      unitCostVnd: l.unitCostVnd ?? (l.unitCostMmk == null ? b.unitCostVnd : null),
      unitCostMmk: l.unitCostMmk ?? (l.unitCostVnd == null ? b.unitCostMmk : null),
      expiryDate: b.expiryDate,
    });
    out.set(l.variantId, list);
  }
  return out;
}

/**
 * Vốn của biến thể để tính giá (P3, P24; D1; A1 16/11): mặc định là lần nhập hợp lệ **đã ghi sổ mới nhất**
 * (theo `postedAt`, rồi phiếu, dòng), hoặc đúng lần nhập được chọn trong `sourceLineIds` (lô làm cơ sở).
 * Chỉ nhận dòng hàng bán được, vào đúng kho bán của SP (hoặc kho chưa bán), mang giá đúng loại tiền.
 * Giá mua 0 hợp lệ.
 *  - VND: PURCHASE dùng giá mua của chính lần nhập; LANDED giữ cách tính cũ (vốn về kho của lô).
 *  - MMK (kho mua tại Myanmar): giá mua MMK của lần nhập.
 * Combo = tổng vốn thành phần × số lượng; thiếu vốn một thành phần → không tính được (null), không coi là 0.
 * Lần nhập được chọn không hợp lệ (khác biến thể / tester / kho khác / sai loại tiền) → không tính được.
 */
export async function variantCosts(
  tx: Tx,
  variantIds: string[],
  currency: CostCurrency = "VND",
  basis: "PURCHASE" | "LANDED" = "LANDED",
  opts: { sourceLineIds?: Map<string, string> } = {},
): Promise<Map<string, VariantCost>> {
  const defs = await bundleDefs(tx, variantIds);
  const baseIds = new Set(variantIds.filter((id) => !defs.has(id)));
  for (const def of defs.values()) for (const c of def) baseIds.add(c.componentId);

  const [lines, loc] = await Promise.all([
    tx.stockDocumentLine.findMany({
      where: {
        variantId: { in: [...baseIds] },
        ...receiptSourceLine,
        batch: currency === "VND" ? { unitCostVnd: { not: null } } : { unitCostMmk: { not: null } },
      },
      orderBy: [{ document: { postedAt: "desc" } }, { documentId: "desc" }, { id: "desc" }],
      select: sourceSelect,
    }),
    productLocations(tx, [...baseIds]),
  ]);
  const chosen = opts.sourceLineIds;
  const base = new Map<string, NonNullable<VariantCost>>();
  for (const l of lines) {
    const b = l.batch;
    if (!b || base.has(l.variantId)) continue; // đã có dòng được dùng
    if (!isSourceForProduct(l.document.to, loc.get(l.variantId) ?? null)) continue;
    const want = chosen?.get(l.variantId);
    if (want && want !== l.id) continue;
    const source: CostSource = { lineId: l.id, batchId: b.id, lotNo: b.lotNo, documentId: l.document.id, documentCode: l.document.code, postedAt: l.document.postedAt };
    base.set(
      l.variantId,
      currency === "VND"
        ? { costVnd: basis === "PURCHASE" ? (l.unitCostVnd ?? b.unitCostVnd!) : (b.landedCostVnd ?? l.unitCostVnd ?? b.unitCostVnd!), landed: basis === "LANDED" && b.landedCostVnd != null, source }
        : { costVnd: l.unitCostMmk ?? b.unitCostMmk!, landed: true, source },
    );
  }

  const result = new Map<string, VariantCost>();
  for (const id of variantIds) {
    const def = defs.get(id);
    if (!def) {
      result.set(id, base.get(id) ?? null);
      continue;
    }
    const parts = def.map((c) => ({ ...c, cost: base.get(c.componentId) }));
    result.set(
      id,
      def.length > 0 && parts.every((p) => p.cost)
        ? {
            costVnd: parts.reduce((s, p) => s + p.cost!.costVnd * p.qty, 0),
            landed: parts.every((p) => p.cost!.landed),
            components: parts.map((p) => ({ componentId: p.componentId, qty: p.qty, cost: p.cost!.costVnd, source: p.cost!.source! })),
          }
        : null,
    );
  }
  return result;
}
