import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getStoreCollection } from "@/server/content/collections";
import { ProductGrid } from "@/components/store/product-card";
import { Breadcrumb, storeCard } from "@/components/store/ui";

// Metadata và trang dùng chung một lần truy vấn trong cùng request.
const loadCollection = cache((slug: string, locale: string) => getStoreCollection(slug, locale, new Date()));

export async function generateMetadata({ params }: PageProps<"/[locale]/collection/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  await connection();
  const c = await loadCollection(slug, locale);
  return c ? { title: c.name } : {};
}

/** Render chặn: HTML đã có danh sách sản phẩm → LCP sớm trên 3G (như trang danh mục). */
export const instant = false;

/** Bộ sưu tập do admin chọn tay ("Xem thêm" từ trang chủ). Slug lạ / tắt / ngoài lịch → proxy trả 404. */
export default async function CollectionPage({ params }: PageProps<"/[locale]/collection/[slug]">) {
  const { locale, slug } = await params;
  await connection(); // lịch hiển thị + tồn kho tính lúc request
  setRequestLocale(locale);
  const [t, tn, collection] = await Promise.all([
    getTranslations({ locale, namespace: "Catalog" }),
    getTranslations({ locale, namespace: "Nav" }),
    loadCollection(slug, locale),
  ]);
  if (!collection) notFound();

  return (
    <div>
      <Breadcrumb label={tn("breadcrumb")} items={[{ href: "/", name: tn("home") }, { name: collection.name }]} />
      <section className={storeCard}>
        <h1 className="mb-2 text-lg font-medium lg:text-xl">{collection.name}</h1>
        <p className="mb-2 text-sm text-muted-foreground">{t("count", { count: collection.products.length })}</p>
        <ProductGrid products={collection.products} locale={locale} />
      </section>
    </div>
  );
}
