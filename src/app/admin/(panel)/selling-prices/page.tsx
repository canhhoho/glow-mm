import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { fmtInt } from "@/lib/format";
import { requirePagePermission } from "@/server/auth/session";
import { productName } from "@/server/inventory/queries";
import { PricingRunsTab } from "@/components/admin/pricing-runs-tab";
import { ActionForm } from "@/components/admin/action-form";
import { DataTable, FilterBar, FilterButton, LinkButton, Page, PageHeader, SearchInput, TabNav, Td, fieldClass, fieldLabelClass } from "@/components/admin/ui";
import { Pagination } from "@/components/ui/pagination";
import { saveSellingPriceAction } from "@/server/catalog/actions";

const PAGE_SIZE = 50;

export default async function SellingPricesPage({ searchParams }: PageProps<"/admin/selling-prices">) {
  await requirePagePermission("pricing:manage");
  const sp = await searchParams;
  const t = await getTranslations("SellingPrices");
  const automatic = sp.mode === "auto";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 200) : "";
  return <Page>
    <PageHeader title={t("title")} actions={[<LinkButton key="rates" href="/admin/pricing">{t("rates")}</LinkButton>]} />
    <TabNav label={t("title")} tabs={[
      { href: "/admin/selling-prices?mode=auto", label: t("automatic"), active: automatic },
      { href: "/admin/selling-prices?mode=manual", label: t("manual"), active: !automatic },
    ]} />
    {automatic ? <PricingRunsTab /> : <>
      <p className="text-sm text-muted-foreground">{t("help")}</p>
      <FilterBar>
        <input type="hidden" name="mode" value="manual" />
        <SearchInput label={t("search")} defaultValue={q} />
        <FilterButton>{t("filter")}</FilterButton>
      </FilterBar>
      <ManualPrices q={q} rawPage={sp.page} />
    </>}
  </Page>;
}

async function ManualPrices({ q, rawPage }: { q: string; rawPage: string | string[] | undefined }) {
  const t = await getTranslations("SellingPrices");
  const where: Prisma.VariantWhereInput = {
    product: { archivedAt: null },
    ...(q && { OR: [
      { sku: { contains: q, mode: "insensitive" } },
      { label: { contains: q, mode: "insensitive" } },
      { product: { translations: { some: { name: { contains: q, mode: "insensitive" } } } } },
    ] }),
  };
  const count = await prisma.variant.count({ where });
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const requested = Number(rawPage);
  const page = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, pages) : 1;
  const rows = await prisma.variant.findMany({
    where, orderBy: [{ sku: "asc" }, { id: "asc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
    select: { id: true, sku: true, label: true, priceMmk: true, productId: true,
      product: { select: { slug: true, translations: { select: { locale: true, name: true } }, stockLocation: { select: { name: true } } } } },
  });
  const href = (n: number) => `/admin/selling-prices?${new URLSearchParams({ mode: "manual", q, page: String(n) })}`;
  return <>
    <DataTable stack empty={t("empty")} numeric={[3]} head={[t("product"), t("sku"), t("warehouse"), t("price"), t("actions")]}>
      {rows.map((v) => <tr key={v.id} data-testid="selling-price-row">
        <Td><Link href={`/admin/products/${v.productId}`} className="text-primary underline">{productName(v.product.translations, v.product.slug)}</Link></Td>
        <Td label={t("sku")}><span className="font-mono text-xs">{v.sku}</span><div className="text-xs text-muted-foreground">{v.label}</div></Td>
        <Td label={t("warehouse")}>{v.product.stockLocation.name}</Td>
        <Td label={t("price")} className="tabular-nums md:text-right">{fmtInt(v.priceMmk)}</Td>
        <Td label={t("actions")}>
          <details>
            <summary className="cursor-pointer text-primary underline">{t("edit")}</summary>
            <ActionForm action={saveSellingPriceAction} submitLabel={t("save")} okText={t("saved")} className="mt-3 min-w-48 space-y-3">
              <input type="hidden" name="productId" value={v.productId} />
              <input type="hidden" name="variantId" value={v.id} />
              <input type="hidden" name="expectedPriceMmk" value={v.priceMmk} />
              <label className={fieldLabelClass}>
                <span className="text-muted-foreground">{t("price")}</span>
                <input name="priceMmk" type="number" min="1" max="1000000000" step="1" inputMode="numeric" required defaultValue={v.priceMmk || ""} className={fieldClass} />
              </label>
              <label className={fieldLabelClass}>
                <span className="text-muted-foreground">{t("reason")}</span>
                <input name="reason" required maxLength={200} className={fieldClass} />
              </label>
            </ActionForm>
          </details>
        </Td>
      </tr>)}
    </DataTable>
    {pages > 1 && (
      <Pagination label={t("title")} page={page} pages={pages} hrefFor={href} prevLabel={t("previous")} nextLabel={t("next")} status={t("page", { page, pages })} />
    )}
  </>;
}
