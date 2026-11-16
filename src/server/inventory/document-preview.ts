/**
 * Xem trước ảnh hưởng của phiếu kho trước khi ghi sổ — thuần. Tính theo cấp (vị trí × biến thể × loại tồn): tồn hiện tại,
 * thay đổi, tồn dự kiến. Chỉ để người dùng kiểm tra; không thay kiểm tra lại phía server khi ghi sổ (khoá dòng, FEFO, giữ hàng).
 */
export type PreviewDoc = {
  /** RETURN (khách trả hàng → khu chờ kiểm tra) tăng tồn ở vị trí nhận như nhập. */
  type: "RECEIVE" | "RETURN" | "TRANSFER" | "ISSUE" | "ADJUST";
  fromId: string | null;
  toId: string | null;
  lines: { variantId: string; qty: number; stockType: string }[];
};

export type PreviewEffect = { locationId: string; variantId: string; stockType: string; before: number; delta: number; after: number };

export const balanceKey = (locationId: string, variantId: string, stockType: string) => `${locationId}|${variantId}|${stockType}`;

export function previewDocument(doc: PreviewDoc, current: Map<string, number>) {
  const deltas = new Map<string, { locationId: string; variantId: string; stockType: string; delta: number }>();
  const add = (locationId: string | null, l: PreviewDoc["lines"][number], delta: number) => {
    if (!locationId || delta === 0) return;
    const key = balanceKey(locationId, l.variantId, l.stockType);
    const prev = deltas.get(key);
    if (prev) prev.delta += delta;
    else deltas.set(key, { locationId, variantId: l.variantId, stockType: l.stockType, delta });
  };
  for (const l of doc.lines) {
    if (doc.type === "RECEIVE" || doc.type === "RETURN") add(doc.toId, l, l.qty);
    else if (doc.type === "ISSUE") add(doc.fromId, l, -l.qty);
    else if (doc.type === "TRANSFER") {
      add(doc.fromId, l, -l.qty);
      add(doc.toId, l, l.qty);
    } else add(doc.toId, l, l.qty); // ADJUST: số âm giảm, dương tăng, tại vị trí điều chỉnh
  }
  const effects: PreviewEffect[] = [...deltas.values()]
    .filter((d) => d.delta !== 0)
    .map((d) => {
      const before = current.get(balanceKey(d.locationId, d.variantId, d.stockType)) ?? 0;
      return { ...d, before, after: before + d.delta };
    });
  return {
    lineCount: doc.lines.length,
    increase: effects.filter((e) => e.delta > 0).reduce((s, e) => s + e.delta, 0),
    decrease: effects.filter((e) => e.delta < 0).reduce((s, e) => s - e.delta, 0),
    effects,
    /** Dự kiến âm = không đủ tồn (server sẽ chặn khi ghi sổ). */
    short: effects.filter((e) => e.after < 0),
  };
}
