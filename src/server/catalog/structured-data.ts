/**
 * Dữ liệu có cấu trúc (schema.org JSON-LD) cho trang sản phẩm — hàm thuần, không phụ thuộc Next/DB.
 * Giá MMK là số nguyên; tình trạng hàng theo tồn khả dụng của biến thể.
 */

export type ProductLdInput = {
  name: string;
  description: string | null;
  brand: string;
  images: { url: string }[];
  variants: { priceMmk: number; available: number }[];
};

export function productJsonLd(
  p: ProductLdInput,
  opts: { url: string; absolute: (pathOrUrl: string) => string; rating?: { average: number | null; count: number } },
) {
  const prices = p.variants.map((v) => v.priceMmk);
  const inStock = p.variants.some((v) => v.available > 0);
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    ...(p.description ? { description: p.description } : {}),
    url: opts.url,
    ...(p.images.length > 0 ? { image: p.images.map((i) => opts.absolute(i.url)) } : {}),
    brand: { "@type": "Brand", name: p.brand },
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "MMK",
      lowPrice: Math.min(...prices),
      highPrice: Math.max(...prices),
      offerCount: p.variants.length,
      availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: opts.url,
    },
    ...(opts.rating?.average != null && opts.rating.count > 0
      ? { aggregateRating: { "@type": "AggregateRating", ratingValue: opts.rating.average, reviewCount: opts.rating.count } }
      : {}),
  };
}

export function breadcrumbJsonLd(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: it.url })),
  };
}

/** Chuỗi an toàn để đặt trong <script type="application/ld+json"> (không thể đóng thẻ script sớm). */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}
