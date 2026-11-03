import type { ProductEditData } from "./admin-queries";

/** A new editable draft: never reuse the source product or variant identities. */
export function productCopyDraft(source: ProductEditData): ProductEditData {
  return {
    ...source,
    id: "",
    slug: "",
    published: false,
    my: { ...source.my },
    en: { ...source.en },
    tagIds: [...source.tagIds],
    variants: source.variants.map((v) => ({
      ...v,
      id: "",
      sku: "",
      components: v.components.map((c) => ({ ...c })),
    })),
  };
}
