import { Suspense } from "react";
import Image from "next/image";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { fmtDay } from "@/lib/format";
import { formatMmk } from "@/lib/money";
import { addToCartAction } from "@/server/cart/actions";
import { getStoreProduct } from "@/server/catalog/store-queries";
import { ContactLinks } from "@/components/store/contact-links";
import { BlockSkeleton, primaryButton, storeField } from "@/components/store/ui";

export async function generateMetadata({ params }: PageProps<"/[locale]/p/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  await connection();
  const p = await getStoreProduct(slug, locale);
  return p ? { title: `${p.name} · ${p.brand}`, description: p.description?.slice(0, 160) } : {};
}

export default function ProductPage(props: PageProps<"/[locale]/p/[slug]">) {
  return (
    <Suspense fallback={<BlockSkeleton />}>
      <ProductContent {...props} />
    </Suspense>
  );
}

const LOW_STOCK = 5;

async function ProductContent({ params }: PageProps<"/[locale]/p/[slug]">) {
  const { locale, slug } = await params;
  await connection(); // tồn kho + hạn dùng lô tính lúc request
  setRequestLocale(locale);
  const [t, p] = await Promise.all([getTranslations({ locale, namespace: "Product" }), getStoreProduct(slug, locale)]);
  if (!p) notFound();
  const firstAvailable = p.variants.find((v) => v.available > 0);
  const sections = [
    { key: "description", title: t("description"), body: p.description },
    { key: "usage", title: t("usage"), body: p.usage },
    { key: "ingredients", title: t("ingredients"), body: p.ingredients },
    { key: "storage", title: t("storage"), body: p.storageNote },
  ].filter((s) => s.body);

  return (
    <article className="space-y-4">
      <div className="relative aspect-square overflow-hidden rounded-xl bg-accent">
        {p.images[0] && (
          <Image src={p.images[0].url} alt={p.images[0].alt ?? p.name} fill priority sizes="(max-width: 768px) 100vw, 720px" className="object-cover" />
        )}
      </div>
      {p.images.length > 1 && (
        <ul className="flex gap-2 overflow-x-auto">
          {p.images.slice(1).map((img) => (
            <li key={img.url} className="relative size-20 shrink-0 overflow-hidden rounded-md bg-accent">
              <Image src={img.url} alt={img.alt ?? p.name} fill sizes="80px" className="object-cover" />
            </li>
          ))}
        </ul>
      )}

      <header>
        <Link href={`/c/${p.category.slug}`} className="text-xs text-muted-foreground underline">
          {p.category.name}
        </Link>
        <p className="text-sm text-muted-foreground">{p.brand}</p>
        <h1 className="text-lg font-medium">{p.name}</h1>
        {p.tags.length > 0 && (
          <ul className="mt-1 flex flex-wrap gap-1">
            {p.tags.map((tag) => (
              <li key={tag} className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                {tag}
              </li>
            ))}
          </ul>
        )}
      </header>

      <form action={addToCartAction} className="space-y-3">
        <input type="hidden" name="locale" value={locale} />
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm">{t("variant")}</legend>
          {p.variants.map((v) => (
            <label
              key={v.id}
              className="flex min-h-11 items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 has-checked:border-brand has-disabled:opacity-50"
            >
              <input
                type="radio"
                name="variantId"
                value={v.id}
                required
                disabled={v.available <= 0}
                defaultChecked={v.id === firstAvailable?.id}
              />
              <span className="flex-1">
                <span className="block">
                  {v.label} {v.isBundle && <span className="text-xs text-brand-2">· {t("bundle")}</span>}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {v.available <= 0
                    ? t("outOfStock")
                    : v.available <= LOW_STOCK
                      ? t("lowStock", { count: v.available })
                      : t("inStock")}
                  {v.expiryDate && ` · ${t("expiry")}: ${fmtDay(v.expiryDate)}`}
                </span>
              </span>
              <span className="font-medium text-brand">{formatMmk(v.priceMmk, locale)}</span>
            </label>
          ))}
        </fieldset>
        {p.variants.some((v) => v.expiryDate) && <p className="text-xs text-muted-foreground">{t("expiryNote")}</p>}
        {firstAvailable ? (
          <div className="flex items-end gap-2">
            <label className="w-24 space-y-1 text-sm">
              <span>{t("qty")}</span>
              <input name="qty" type="number" min={1} max={99} defaultValue={1} inputMode="numeric" className={storeField} />
            </label>
            <button type="submit" className={`${primaryButton} flex-1`}>
              {t("addToCart")}
            </button>
          </div>
        ) : (
          <p className="font-medium text-muted-foreground">{t("outOfStock")}</p>
        )}
      </form>

      <ContactLinks locale={locale} />

      {sections.map((s) => (
        <details key={s.key} open={s.key === "description"} className="rounded-lg border border-border bg-card">
          <summary className="flex min-h-11 cursor-pointer items-center px-3 font-medium">{s.title}</summary>
          <p className="px-3 pb-3 text-sm whitespace-pre-line">{s.body}</p>
        </details>
      ))}
    </article>
  );
}
