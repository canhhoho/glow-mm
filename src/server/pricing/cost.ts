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

/**
 * Vốn của biến thể để tính giá (P3, P24; D1): dòng phiếu RECEIVE **đã ghi sổ** mới nhất theo `postedAt`
 * (thứ tự phụ: phiếu, dòng — ổn định khi trùng giờ) có lô mang giá đúng loại tiền. Lô nhập lại ở phiếu sau
 * được xét theo lần ghi sổ đó, không theo ngày tạo lô. Giá mua 0 hợp lệ.
 *  - VND: PURCHASE dùng `unitCostVnd` cho công thức có cước/kg; LANDED giữ cách tính cũ không cước.
 *  - MMK (kho mua tại Myanmar): `unitCostMmk`.
 * Combo = tổng vốn thành phần × số lượng; thiếu vốn một thành phần → không tính được (null), không coi là 0.
 */
export async function variantCosts(tx: Tx, variantIds: string[], currency: CostCurrency = "VND", basis: "PURCHASE" | "LANDED" = "LANDED"): Promise<Map<string, VariantCost>> {
  const defs = await bundleDefs(tx, variantIds);
  const baseIds = new Set(variantIds.filter((id) => !defs.has(id)));
  for (const def of defs.values()) for (const c of def) baseIds.add(c.componentId);

  const lines = await tx.stockDocumentLine.findMany({
    where: {
      variantId: { in: [...baseIds] },
      qty: { gt: 0 },
      document: { type: "RECEIVE", status: "POSTED" },
      batch: currency === "VND" ? { unitCostVnd: { not: null } } : { unitCostMmk: { not: null } },
    },
    orderBy: [{ document: { postedAt: "desc" } }, { documentId: "desc" }, { id: "desc" }],
    select: {
      id: true,
      variantId: true,
      // P1-C: giá mua của CHÍNH lần nhập mới nhất (lô nhập nhiều lần có giá bình quân riêng ở Batch).
      unitCostVnd: true,
      unitCostMmk: true,
      document: { select: { id: true, code: true, postedAt: true } },
      batch: { select: { id: true, lotNo: true, unitCostVnd: true, landedCostVnd: true, unitCostMmk: true } },
    },
  });
  const base = new Map<string, NonNullable<VariantCost>>();
  for (const l of lines) {
    const b = l.batch;
    if (!b || base.has(l.variantId)) continue; // đã có dòng ghi sổ mới nhất
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
