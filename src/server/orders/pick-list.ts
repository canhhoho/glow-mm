/**
 * DT: phiếu lấy hàng gộp cho nhiều đơn — thuần, không DB (test bằng Vitest).
 * Combo bung thành từng thành phần (kho trừ theo thành phần). Chưa ghi lô: lô FEFO chốt lúc bàn giao (D3-lite sẽ in lô).
 */
export type PickOrderItem = {
  variantId: string;
  sku: string;
  name: string;
  qty: number;
  location: { id: string; name: string };
  /** Có = combo; mỗi thành phần × số lượng trên một combo. */
  components?: { variantId: string; sku: string; name: string; qty: number }[];
};
export type PickOrder = { id: string; code: string; items: PickOrderItem[] };

export type PickLine = { variantId: string; sku: string; name: string; qty: number; orders: { code: string; qty: number }[] };
export type PickGroup = { location: { id: string; name: string }; lines: PickLine[]; totalQty: number };

export function buildPickList(orders: PickOrder[]): PickGroup[] {
  const groups = new Map<string, { location: PickGroup["location"]; lines: Map<string, PickLine> }>();
  const add = (location: PickGroup["location"], v: { variantId: string; sku: string; name: string }, qty: number, code: string) => {
    if (qty <= 0) return;
    const g = groups.get(location.id) ?? { location, lines: new Map<string, PickLine>() };
    groups.set(location.id, g);
    const line = g.lines.get(v.variantId) ?? { variantId: v.variantId, sku: v.sku, name: v.name, qty: 0, orders: [] };
    g.lines.set(v.variantId, line);
    line.qty += qty;
    const o = line.orders.find((x) => x.code === code);
    if (o) o.qty += qty;
    else line.orders.push({ code, qty });
  };
  for (const order of orders) {
    for (const item of order.items) {
      if (item.components?.length) for (const c of item.components) add(item.location, c, c.qty * item.qty, order.code);
      else add(item.location, item, item.qty, order.code);
    }
  }
  return [...groups.values()]
    .sort((a, b) => a.location.name.localeCompare(b.location.name))
    .map((g) => {
      const lines = [...g.lines.values()].sort((a, b) => a.sku.localeCompare(b.sku));
      return { location: g.location, lines, totalQty: lines.reduce((s, l) => s + l.qty, 0) };
    });
}
