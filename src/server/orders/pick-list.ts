/**
 * DT + D3-lite: phiếu lấy hàng gộp cho nhiều đơn — thuần, không DB (test bằng Vitest).
 * Đầu vào là từng dòng cần lấy (combo đã bung thành phần); đơn đã lập kế hoạch FEFO có `lot`.
 * Gộp: kho bán → SKU → lô (đơn chưa xác nhận / thiếu hàng: lô "—").
 */
export type PickRow = {
  orderCode: string;
  variantId: string;
  sku: string;
  name: string;
  location: { id: string; name: string };
  qty: number;
  lot?: { batchId: string; lotNo: string; expiryDate: Date | null };
};

export type PickLot = { batchId: string | null; lotNo: string | null; expiryDate: Date | null; qty: number; orders: { code: string; qty: number }[] };
export type PickLine = { variantId: string; sku: string; name: string; qty: number; lots: PickLot[] };
export type PickGroup = { location: { id: string; name: string }; lines: PickLine[]; totalQty: number };

export function buildPickList(rows: PickRow[]): PickGroup[] {
  const groups = new Map<string, { location: PickGroup["location"]; lines: Map<string, PickLine> }>();
  for (const r of rows) {
    if (r.qty <= 0) continue;
    const g = groups.get(r.location.id) ?? { location: r.location, lines: new Map<string, PickLine>() };
    groups.set(r.location.id, g);
    const line = g.lines.get(r.variantId) ?? { variantId: r.variantId, sku: r.sku, name: r.name, qty: 0, lots: [] };
    g.lines.set(r.variantId, line);
    line.qty += r.qty;
    const batchId = r.lot?.batchId ?? null;
    let lot = line.lots.find((l) => l.batchId === batchId);
    if (!lot) {
      lot = { batchId, lotNo: r.lot?.lotNo ?? null, expiryDate: r.lot?.expiryDate ?? null, qty: 0, orders: [] };
      line.lots.push(lot);
    }
    lot.qty += r.qty;
    const o = lot.orders.find((x) => x.code === r.orderCode);
    if (o) o.qty += r.qty;
    else lot.orders.push({ code: r.orderCode, qty: r.qty });
  }
  // Lô hết hạn trước lên trước (giống FEFO); dòng chưa có lô xếp cuối.
  const lotOrder = (a: PickLot, b: PickLot) =>
    (a.batchId == null ? 1 : 0) - (b.batchId == null ? 1 : 0) ||
    (a.expiryDate?.getTime() ?? Infinity) - (b.expiryDate?.getTime() ?? Infinity) ||
    (a.lotNo ?? "").localeCompare(b.lotNo ?? "");
  return [...groups.values()]
    .sort((a, b) => a.location.name.localeCompare(b.location.name))
    .map((g) => {
      const lines = [...g.lines.values()].sort((a, b) => a.sku.localeCompare(b.sku)).map((l) => ({ ...l, lots: l.lots.sort(lotOrder) }));
      return { location: g.location, lines, totalQty: lines.reduce((s, l) => s + l.qty, 0) };
    });
}
