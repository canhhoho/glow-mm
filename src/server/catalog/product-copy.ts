import type { ProductEditData } from "./admin-queries";

/**
 * A new editable draft: never reuse the source product or variant identities.
 * QT1b: giá bán, hoa hồng CTV cố định và lãi cố định không chép — đặt ở bước 3 của SP mới.
 */
export function productCopyDraft(source: ProductEditData): ProductEditData {
  return {
    ...source,
    id: "",
    slug: "",
    published: false,
    fixedProfitMmk: null,
    my: { ...source.my },
    en: { ...source.en },
    tagIds: [...source.tagIds],
    variants: source.variants.map((v) => ({
      ...v,
      id: "",
      sku: "",
      priceMmk: 0,
      affiliateCommissionMmk: null,
      components: v.components.map((c) => ({ ...c })),
    })),
  };
}
