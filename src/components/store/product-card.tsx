import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { formatMmk } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { ProductCardData } from "@/server/catalog/store-queries";
import { ImageFallback } from "./ui";

/** Ảnh thẻ: mobile 2 cột (50vw, như trước), sm 3 cột, lg 5 cột trong khung 1152px. */
const CARD_SIZES = "(min-width: 1024px) 220px, (min-width: 640px) 33vw, 50vw";

export async function ProductCard({ p, locale }: { p: ProductCardData; locale: string }) {
  const t = await getTranslations({ locale, namespace: "Catalog" });
  const tp = await getTranslations({ locale, namespace: "Product" });
  return (
    <li className="snap-start rounded-lg border border-border bg-card p-2 transition-shadow hover:shadow-md">
      <Link href={`/p/${p.slug}`} className="flex h-full flex-col">
        <div className={cn("relative mb-2 aspect-square overflow-hidden rounded-md bg-accent", !p.inStock && !p.preorder && "opacity-60")}>
          {p.imageUrl ? (
            <Image src={p.imageUrl} alt={p.imageAlt ?? p.name} fill sizes={CARD_SIZES} className="object-cover" />
          ) : (
            <ImageFallback brand={p.brand} className="text-5xl" />
          )}
          {!p.inStock && (
            <span className="absolute top-1 left-1 rounded bg-card/90 px-1.5 py-0.5 text-xs" data-testid={p.preorder ? "card-preorder" : undefined}>
              {p.preorder ? tp("preorder") : tp("outOfStock")}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{p.brand}</p>
        <p className="line-clamp-2 text-sm">{p.name}</p>
        <p className="mt-auto pt-1 font-semibold text-brand">{t("from", { price: formatMmk(p.priceMmk, locale) })}</p>
        {/* Cả thẻ là link tới trang SP (chọn biến thể ở đó); "nút" chỉ là gợi ý thị giác. Hết hàng → không mời "chọn" (trừ đặt trước). */}
        <span
          className={cn(
            "mt-2 flex min-h-9 items-center justify-center rounded-md text-sm",
            p.inStock || p.preorder ? "bg-accent text-accent-foreground" : "border border-border text-muted-foreground",
          )}
        >
          {p.inStock ? t("choose") : p.preorder ? tp("preorder") : tp("outOfStock")}
        </span>
      </Link>
    </li>
  );
}

export async function ProductGrid({ products, locale }: { products: ProductCardData[]; locale: string }) {
  const t = await getTranslations({ locale, namespace: "Catalog" });
  if (products.length === 0) return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {products.map((p) => (
        <ProductCard key={p.slug} p={p} locale={locale} />
      ))}
    </ul>
  );
}

/**
 * Dải sản phẩm cuộn ngang (CSS scroll-snap, không JS): mobile/sm tràn lề, lộ một phần thẻ kế tiếp để gợi ý cuộn;
 * lg bỏ tràn lề, đúng 5 thẻ lấp kín khung (% của auto-cols tính trên content box → chỉ trừ 4 khoảng gap-3).
 */
export async function ProductRail({ products, locale }: { products: ProductCardData[]; locale: string }) {
  return (
    <ul className="-mx-3 grid snap-x snap-mandatory auto-cols-[44%] grid-flow-col gap-3 overflow-x-auto scroll-px-3 px-3 pb-2 sm:-mx-4 sm:auto-cols-[30%] sm:scroll-px-4 sm:px-4 lg:mx-0 lg:auto-cols-[calc((100%-3rem)/5)] lg:scroll-px-0 lg:px-0">
      {products.map((p) => (
        <ProductCard key={p.slug} p={p} locale={locale} />
      ))}
    </ul>
  );
}
