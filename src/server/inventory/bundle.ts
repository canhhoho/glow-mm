/**
 * Combo (bundle): bán combo = trừ kho từng thành phần. Thuần, không phụ thuộc DB.
 */

export type BundleDef = { componentId: string; qty: number }[];

/**
 * Quy đổi danh sách {variantId, qty} (có thể chứa combo) thành nhu cầu theo biến thể thành phần.
 * Biến thể thường giữ nguyên; combo được thay bằng thành phần × số lượng. Gộp các dòng trùng.
 */
export function expandBundles(
  items: { variantId: string; qty: number }[],
  bundles: Map<string, BundleDef>,
): Map<string, number> {
  const need = new Map<string, number>();
  const add = (id: string, q: number) => need.set(id, (need.get(id) ?? 0) + q);
  for (const it of items) {
    if (!Number.isInteger(it.qty) || it.qty <= 0) throw new Error("Số lượng phải là số nguyên dương");
    const def = bundles.get(it.variantId);
    if (!def) {
      add(it.variantId, it.qty);
      continue;
    }
    if (def.length === 0) throw new Error(`Combo ${it.variantId} chưa có thành phần`);
    for (const c of def) {
      if (bundles.has(c.componentId)) throw new Error("Combo lồng combo không được hỗ trợ");
      add(c.componentId, c.qty * it.qty);
    }
  }
  return need;
}

/** Số combo tối đa có thể bán từ tồn khả dụng của các thành phần. */
export function bundleAvailability(def: BundleDef, availableByVariant: Map<string, number>): number {
  if (def.length === 0) return 0;
  return Math.min(...def.map((c) => Math.floor((availableByVariant.get(c.componentId) ?? 0) / c.qty)));
}
