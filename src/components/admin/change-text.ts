import type { ChangeItem } from "@/server/catalog/change-summary";
import { fmtInt } from "@/lib/format";

type T = (key: string, values?: Record<string, string | number>) => string;

/** Một dòng "Thay đổi so với bản đang bán" (namespace Products) — dùng chung trang SP và hàng đợi duyệt. */
export function changeItemText(t: T, c: ChangeItem): string {
  switch (c.kind) {
    case "name":
    case "description":
      return t(`review.item.${c.kind}`, { locale: c.locale });
    case "category":
    case "brand":
      return t(`review.item.${c.kind}`);
    case "variantNew":
    case "combo":
      return t(`review.item.${c.kind}`, { sku: c.sku });
    case "variantLabel":
      return t("review.item.variantLabel", { sku: c.sku, to: c.to });
    case "variantActive":
      return t("review.item.variantActive", { sku: c.sku, active: String(c.active) });
    case "price":
      return t("review.item.price", { sku: c.sku, from: fmtInt(c.from), to: fmtInt(c.to) });
    case "imagesAdded":
    case "imagesRemoved":
      return t(`review.item.${c.kind}`, { count: c.count });
  }
}
