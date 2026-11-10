/**
 * Tóm tắt "Thay đổi so với bản đang bán" của bản đang sửa (thuần → unit test). Dùng cho trang SP, cột "Thay đổi"
 * ở hàng đợi duyệt và nhật ký duyệt.
 */

export type ChangeItem =
  | { kind: "name" | "description"; locale: "my" | "en" }
  | { kind: "category" }
  | { kind: "brand" }
  | { kind: "variantNew"; sku: string }
  | { kind: "variantLabel"; sku: string; to: string }
  | { kind: "variantActive"; sku: string; active: boolean }
  | { kind: "combo"; sku: string }
  | { kind: "price"; sku: string; from: number; to: number }
  | { kind: "imagesAdded"; count: number }
  | { kind: "imagesRemoved"; count: number };

type Text = { name: string; description: string };
type V = { id?: string; sku: string; label: string; active: boolean; isBundle: boolean; components: { componentId: string; qty: number }[] };

export type SummaryLive = { brandId: string; categoryId: string; my: Text; en: Text; variants: (V & { id: string; priceMmk: number })[] };
export type SummaryChanges = {
  content: { brandId?: string; brandName?: string; categoryId: string; my: Text; en: Text; variants: V[] } | null;
  prices: Record<string, { priceMmk: number; baseLivePrice: number }>;
  images: { add: unknown[]; remove: unknown[] };
};

const same = (a: string | null | undefined, b: string | null | undefined) => (a ?? "").trim() === (b ?? "").trim();
const comboKey = (v: V) => (v.isBundle ? [...v.components].map((c) => `${c.componentId}×${c.qty}`).sort().join(",") : "");

export function summarizeChanges(live: SummaryLive, cr: SummaryChanges): ChangeItem[] {
  const out: ChangeItem[] = [];
  const c = cr.content;
  if (c) {
    for (const locale of ["my", "en"] as const) {
      if (!same(c[locale].name, live[locale].name)) out.push({ kind: "name", locale });
      if (!same(c[locale].description, live[locale].description)) out.push({ kind: "description", locale });
    }
    if (c.categoryId !== live.categoryId) out.push({ kind: "category" });
    if ((c.brandId && c.brandId !== live.brandId) || (!c.brandId && c.brandName)) out.push({ kind: "brand" });
    const byId = new Map(live.variants.map((v) => [v.id, v]));
    for (const v of c.variants) {
      const cur = v.id ? byId.get(v.id) : undefined;
      if (!cur) {
        out.push({ kind: "variantNew", sku: v.sku });
        continue;
      }
      if (!same(v.label, cur.label)) out.push({ kind: "variantLabel", sku: cur.sku, to: v.label });
      if (v.active !== cur.active) out.push({ kind: "variantActive", sku: cur.sku, active: v.active });
      if (comboKey(v) !== comboKey(cur)) out.push({ kind: "combo", sku: cur.sku });
    }
  }
  const skuOf = new Map(live.variants.map((v) => [v.id, v.sku]));
  for (const [variantId, p] of Object.entries(cr.prices)) {
    out.push({ kind: "price", sku: skuOf.get(variantId) ?? variantId, from: p.baseLivePrice, to: p.priceMmk });
  }
  if (cr.images.add.length) out.push({ kind: "imagesAdded", count: cr.images.add.length });
  if (cr.images.remove.length) out.push({ kind: "imagesRemoved", count: cr.images.remove.length });
  return out;
}
