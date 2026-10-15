import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { formatMmk } from "@/lib/money";
import type { ProductCardData } from "@/server/catalog/store-queries";

export async function ProductCard({ p, locale }: { p: ProductCardData; locale: string }) {
  const t = await getTranslations({ locale, namespace: "Catalog" });
  const tp = await getTranslations({ locale, namespace: "Product" });
  return (
    <li className="rounded-lg border border-border bg-card p-2">
      <Link href={`/p/${p.slug}`} className="block">
        <div className="relative mb-2 aspect-square overflow-hidden rounded-md bg-accent">
          {p.imageUrl && (
            <Image src={p.imageUrl} alt={p.imageAlt ?? p.name} fill sizes="(max-width: 768px) 50vw, 360px" className="object-cover" />
          )}
          {!p.inStock && (
            <span className="absolute top-1 left-1 rounded bg-card/90 px-1.5 py-0.5 text-xs">{tp("outOfStock")}</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{p.brand}</p>
        <p className="line-clamp-2 text-sm">{p.name}</p>
        <p className="font-medium text-brand">{t("from", { price: formatMmk(p.priceMmk, locale) })}</p>
      </Link>
    </li>
  );
}

export async function ProductGrid({ products, locale }: { products: ProductCardData[]; locale: string }) {
  const t = await getTranslations({ locale, namespace: "Catalog" });
  if (products.length === 0) return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  return (
    <ul className="grid grid-cols-2 gap-3">
      {products.map((p) => (
        <ProductCard key={p.slug} p={p} locale={locale} />
      ))}
    </ul>
  );
}
