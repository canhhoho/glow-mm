import { slugify } from "./slug";

/** `fallback`: gốc khi tên không có chữ Latin (tên chỉ có tiếng Myanmar) — vd slug thương hiệu, thay cho "product". */
export function suggestProductSlug(nameEn: string, nameMy: string, fallback = "product"): string {
  return slugify(nameEn.trim() || nameMy.trim(), slugify(fallback, "product"));
}

export function suggestVariantSku(slug: string, index: number): string {
  return `${slug.slice(0, 30).toUpperCase()}-${String(index + 1).padStart(2, "0")}`;
}

type Identifiers = {
  id?: string;
  slug: string;
  autoSlug?: boolean;
  variants: { id?: string; sku: string; autoSku?: boolean }[];
};

/** Resolve automatic codes only; manual codes and existing identities stay unchanged. */
export async function resolveProductIdentifiers<T extends Identifiers>(
  input: T,
  exists: (kind: "slug" | "sku", value: string) => Promise<boolean>,
): Promise<T> {
  const reserved = new Set<string>();
  for (const v of input.variants) {
    if (!v.id && v.autoSku) continue;
    if (reserved.has(v.sku)) throw new Error(`SKU ${v.sku} bị lặp trong sản phẩm`);
    reserved.add(v.sku);
  }
  const unique = async (kind: "slug" | "sku", base: string, max: number) => {
    let candidate = base;
    let suffix = 2;
    while ((kind === "sku" && reserved.has(candidate)) || await exists(kind, candidate)) {
      const tail = `-${suffix++}`;
      candidate = `${base.slice(0, max - tail.length)}${tail}`;
    }
    if (kind === "sku") reserved.add(candidate);
    return candidate;
  };
  const slug = !input.id && input.autoSlug ? await unique("slug", input.slug, 80) : input.slug;
  // Slug tự sinh bị đổi để không trùng (vd "kem-2") → SKU tự sinh theo slug mới ("KEM-2-01"), không phải "KEM-01-2".
  const oldPrefix = `${input.slug.slice(0, 30).toUpperCase()}-`;
  const newPrefix = `${slug.slice(0, 30).toUpperCase()}-`;
  const variants = [];
  for (const v of input.variants) {
    const auto = !v.id && v.autoSku;
    const base = auto && slug !== input.slug && v.sku.startsWith(oldPrefix) ? newPrefix + v.sku.slice(oldPrefix.length) : v.sku;
    variants.push({ ...v, sku: auto ? await unique("sku", base, 40) : v.sku });
  }
  return { ...input, slug, variants };
}
