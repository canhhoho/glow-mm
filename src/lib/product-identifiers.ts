import { slugify } from "./slug";

export function suggestProductSlug(nameEn: string, nameMy: string): string {
  return slugify(nameEn.trim() || nameMy.trim(), "product");
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
  const variants = [];
  for (const v of input.variants) {
    variants.push({ ...v, sku: !v.id && v.autoSku ? await unique("sku", v.sku, 40) : v.sku });
  }
  return { ...input, slug, variants };
}
