/**
 * Tham số "đặt giá cho một nhóm SKU" của trang Giá bán (21/11/2026, audit #21 — gộp route `/selling-prices/manual`):
 * `ids` (SKU đã chọn, tối đa 200), `productId` (mọi SKU của một SP) hoặc `scope=rate` (tính lại theo tỷ giá mới).
 */
export type PriceFocus = { ids: string[]; productId?: string; scope?: "rate" };

type Raw = Record<string, string | string[] | undefined>;
const list = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []).filter((x) => /^[a-z0-9]{1,40}$/i.test(x)).slice(0, 200);

export function parsePriceFocus(sp: Raw): PriceFocus | null {
  if (sp.scope === "rate") return { ids: [], scope: "rate" };
  const ids = list(sp.ids);
  const productId = list(sp.productId)[0];
  return ids.length || productId ? { ids, productId } : null;
}

/** Query string cho link vào trang Giá bán (`/admin/selling-prices?…`). */
export function focusQuery(f: Partial<PriceFocus>): string {
  const p = new URLSearchParams();
  if (f.scope === "rate") p.set("scope", "rate");
  else {
    for (const id of new Set(f.ids ?? [])) p.append("ids", id);
    if (f.productId) p.set("productId", f.productId);
  }
  return p.toString();
}
