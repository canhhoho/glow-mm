import { slugify } from "./slug";

/** `fallback`: gốc khi tên không có chữ Latin (tên chỉ có tiếng Myanmar) — vd slug thương hiệu, thay cho "product". */
export function suggestProductSlug(nameEn: string, nameMy: string, fallback = "product"): string {
  return slugify(nameEn.trim() || nameMy.trim(), slugify(fallback, "product"));
}

const SKU_STOP = new Set(["and", "the", "for", "with", "of", "a", "an", "by", "va", "cho"]);
const SKU_SIZE = /^(\d+(?:[.,]\d+)?)(ml|g|gr|gram|kg|l|oz|pcs|pc|v|vien|mieng)$/;

/**
 * Gốc SKU tự sinh ngắn (18/11/2026), gần cách nhân viên tự đặt (vd DM-ANE-PUS60):
 * 3 chữ đầu của từ đầu (thường là thương hiệu) + chữ cái đầu các từ sau (tối đa 5, bỏ từ nối)
 * + từ cuối có chữ số giữ nguyên (dung tích bỏ đơn vị: "60ml" → "60"; mã màu "em08" → "EM08").
 * Vd "anessa-perfect-uv-spray-60g" → "ANE-PUS60", "into-you-lip-mud-em08" → "INT-YLMEM08".
 */
export function skuStem(slug: string): string {
  const words = slug.split("-").filter(Boolean);
  const head = (words[0] ?? "sp").slice(0, 3);
  const rest = words.slice(1).filter((w) => !SKU_STOP.has(w));
  let code = "";
  for (let k = rest.length - 1; k >= 0; k--) {
    if (/\d/.test(rest[k])) {
      code = (rest[k].match(SKU_SIZE)?.[1] ?? rest[k]).slice(0, 8);
      rest.splice(k, 1);
      break;
    }
  }
  const mid = rest.map((w) => w[0]).join("").slice(0, 5) + code;
  return (mid ? `${head}-${mid}` : head).toUpperCase();
}

export function suggestVariantSku(slug: string, index: number): string {
  return `${skuStem(slug)}-${String(index + 1).padStart(2, "0")}`;
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
  const oldPrefix = `${skuStem(input.slug)}-`;
  const newPrefix = `${skuStem(slug)}-`;
  const variants = [];
  for (const v of input.variants) {
    const auto = !v.id && v.autoSku;
    const base = auto && slug !== input.slug && v.sku.startsWith(oldPrefix) ? newPrefix + v.sku.slice(oldPrefix.length) : v.sku;
    variants.push({ ...v, sku: auto ? await unique("sku", base, 40) : v.sku });
  }
  return { ...input, slug, variants };
}
