import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Calculator, CircleDollarSign, Clock, Layers, TriangleAlert } from "lucide-react";
import { fmtDateTime, fmtInt } from "@/lib/format";
import { requirePagePermission } from "@/server/auth/session";
import { PricingRunsTab } from "@/components/admin/pricing-runs-tab";
import { ActionForm } from "@/components/admin/action-form";
import { Badge, DataTable, FilterBar, FilterButton, LinkButton, Page, PageHeader, PageNumbers, SearchInput, StatCard, TabNav, Td, fieldClass, fieldLabelClass } from "@/components/admin/ui";
import { saveSellingPriceAction } from "@/server/catalog/actions";
import {
  listSellingPrices,
  SELLING_PAGE_SIZES,
  SELLING_STATES,
  sellingPriceStats,
  sellingPriceWarehouses,
  type SellingPriceRow,
  type SellingState,
} from "@/server/pricing/selling-prices";

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function SellingPricesPage({ searchParams }: PageProps<"/admin/selling-prices">) {
  await requirePagePermission("pricing:manage");
  const sp = await searchParams;
  const t = await getTranslations("SellingPrices");
  const automatic = sp.mode === "auto";
  const q = one(sp.q)?.trim().slice(0, 200) ?? "";
  const state = SELLING_STATES.find((s) => s === sp.state);
  const warehouseId = one(sp.warehouse) || undefined;
  const size = SELLING_PAGE_SIZES.find((s) => String(s) === sp.size) ?? 50;
  const requested = Number(sp.page);
  const page = Number.isSafeInteger(requested) && requested > 0 ? requested : 1;
  const stats = await sellingPriceStats();

  const href = (o: { state?: SellingState | null; page?: number; size?: number; q?: string | null; warehouse?: string | null }) => {
    const p = new URLSearchParams({ mode: "manual" });
    const nq = o.q === null ? "" : (o.q ?? q);
    const nw = o.warehouse === null ? "" : (o.warehouse ?? warehouseId ?? "");
    const ns = o.state === null ? undefined : (o.state ?? state);
    const nz = o.size ?? size;
    if (nq) p.set("q", nq);
    if (nw) p.set("warehouse", nw);
    if (ns) p.set("state", ns);
    if (nz !== 50) p.set("size", String(nz));
    if (o.page && o.page > 1) p.set("page", String(o.page));
    return `/admin/selling-prices?${p}`;
  };

  return (
    <Page>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={[
          <LinkButton key="rates" href="/admin/pricing">{t("rates")}</LinkButton>,
          <LinkButton key="runs" href="/admin/pricing?tab=runs" variant="primary"><Calculator aria-hidden /> {t("runs")}</LinkButton>,
        ]}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={<Layers />} tone="brand" value={fmtInt(stats.total)} label={t("statTotal")} href={href({ state: null, page: 1 })} active={!automatic && !state} />
        <StatCard icon={<CircleDollarSign />} tone="danger" value={fmtInt(stats.zero)} label={t("state.zero")} href={href({ state: "zero", page: 1 })} active={!automatic && state === "zero"} testId="stat-zero" />
        <StatCard icon={<Clock />} tone="warning" value={fmtInt(stats.pending)} label={t("state.pending")} href={href({ state: "pending", page: 1 })} active={!automatic && state === "pending"} testId="stat-pending" />
        <StatCard icon={<TriangleAlert />} tone="neutral" value={fmtInt(stats.stale)} label={t("state.stale")} href={href({ state: "stale", page: 1 })} active={!automatic && state === "stale"} testId="stat-stale" />
      </div>
      <TabNav
        label={t("title")}
        tabs={[
          { href: "/admin/selling-prices?mode=auto", label: t("automatic"), active: automatic },
          { href: "/admin/selling-prices?mode=manual", label: t("manual"), active: !automatic },
        ]}
      />
      {automatic ? (
        <PricingRunsTab />
      ) : (
        <ManualPrices q={q} state={state} warehouseId={warehouseId} page={page} size={size} href={href} />
      )}
    </Page>
  );
}

async function ManualPrices({
  q,
  state,
  warehouseId,
  page: rawPage,
  size,
  href,
}: {
  q: string;
  state?: SellingState;
  warehouseId?: string;
  page: number;
  size: number;
  href: (o: { state?: SellingState | null; page?: number; size?: number; q?: string | null; warehouse?: string | null }) => string;
}) {
  const [t, tb, warehouses, { rows, total, page, pageCount }] = await Promise.all([
    getTranslations("SellingPrices"),
    getTranslations("Products.priceBlock"),
    sellingPriceWarehouses(),
    listSellingPrices({ q, warehouseId, state, page: rawPage, size }),
  ]);
  const filtered = !!(q || state || warehouseId);
  const source = (r: SellingPriceRow) => {
    const s = r.pricing?.source;
    if (!s || s.kind === "none") return <span className="text-muted-foreground">{tb("sourceNone")}</span>;
    const label = s.kind === "run" ? tb("sourceRun") : s.kind === "import" ? tb("sourceImport") : tb("sourceManual");
    return (
      <>
        {s.kind === "run" ? <Link href={`/admin/pricing/runs/${s.runId}`} className="text-primary hover:underline">{label}</Link> : label}
        <span className="block text-xs text-muted-foreground tabular-nums">{fmtDateTime(s.at)}</span>
      </>
    );
  };
  return (
    <>
      <p className="text-sm text-muted-foreground">{t("help")}</p>
      <FilterBar>
        <input type="hidden" name="mode" value="manual" />
        <SearchInput label={t("search")} defaultValue={q} />
        {warehouses.length > 1 && (
          <select name="warehouse" defaultValue={warehouseId ?? ""} aria-label={t("warehouse")} className={fieldClass}>
            <option value="">{t("allWarehouses")}</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        )}
        <select name="state" defaultValue={state ?? ""} aria-label={t("stateLabel")} className={fieldClass}>
          <option value="">{t("stateAll")}</option>
          {SELLING_STATES.map((s) => (
            <option key={s} value={s}>{t(`state.${s}`)}</option>
          ))}
        </select>
        <FilterButton>{t("filter")}</FilterButton>
        {filtered && (
          <Link href={href({ q: null, state: null, warehouse: null, page: 1 })} className="self-center text-sm text-primary underline">
            {t("clearFilters")}
          </Link>
        )}
      </FilterBar>
      <DataTable stack empty={t("empty")} numeric={[3, 4]} head={[t("product"), t("sku"), t("warehouse"), t("price"), t("colCost"), t("colSource"), t("actions")]}>
        {rows.map((v) => (
          <tr key={v.id} data-testid="selling-price-row" className="hover:bg-muted/30">
            <Td className="align-middle">
              <div className="flex min-w-52 items-center gap-3">
                <span className="relative size-10 shrink-0 overflow-hidden rounded-lg border bg-muted">
                  {v.image && <Image src={v.image} alt={v.productName} fill sizes="40px" className="object-cover" />}
                </span>
                <Link href={`/admin/products/${v.productId}`} className="line-clamp-2 font-medium hover:text-primary">{v.productName}</Link>
              </div>
            </Td>
            <Td label={t("sku")} className="align-middle">
              <span className="font-mono text-xs">{v.sku}</span>
              <div className="text-xs text-muted-foreground">
                {v.label}
                {!v.active && <> · {tb("inactive")}</>}
              </div>
              {v.isBundle && <Badge tone="brand">combo</Badge>}
            </Td>
            <Td label={t("warehouse")} className="align-middle">{v.warehouse}</Td>
            <Td label={t("price")} className="align-middle whitespace-nowrap tabular-nums md:text-right">
              <div className={v.priceMmk <= 0 ? "font-medium text-destructive" : "font-medium"}>{fmtInt(v.priceMmk)}</div>
              {v.pendingMmk != null && (
                <div className="mt-1" data-testid="selling-pending">
                  <Badge tone="warning">{t("pendingPrice", { price: fmtInt(v.pendingMmk) })}</Badge>
                </div>
              )}
              {v.stale && (
                <div className="mt-1">
                  <Badge tone="neutral">{t("staleBadge")}</Badge>
                </div>
              )}
            </Td>
            <Td label={t("colCost")} className="align-middle whitespace-nowrap tabular-nums md:text-right">
              {v.pricing?.cost ? (
                <>
                  {fmtInt(v.pricing.cost.amount)} <span className="text-xs text-muted-foreground">{v.pricing.cost.currency}</span>
                </>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </Td>
            <Td label={t("colSource")} className="align-middle text-sm">{source(v)}</Td>
            <Td label={t("actions")} className="align-middle">
              <details>
                <summary className="cursor-pointer text-primary underline">{t("edit")}</summary>
                <ActionForm action={saveSellingPriceAction} submitLabel={t("save")} okText={t("saved")} className="mt-3 min-w-48 space-y-3">
                  <input type="hidden" name="productId" value={v.productId} />
                  <input type="hidden" name="variantId" value={v.id} />
                  {/* So xung đột theo giá hiệu lực (giá chờ duyệt nếu có) — cùng quy tắc với form giá trên trang SP. */}
                  <input type="hidden" name="expectedPriceMmk" value={v.effectiveMmk} />
                  <label className={fieldLabelClass}>
                    <span className="text-muted-foreground">{t("price")}</span>
                    <input name="priceMmk" type="number" min="1" max="1000000000" step="1" inputMode="numeric" required defaultValue={v.effectiveMmk || ""} className={fieldClass} />
                  </label>
                  <label className={fieldLabelClass}>
                    <span className="text-muted-foreground">{t("reason")}</span>
                    <input name="reason" required maxLength={200} className={fieldClass} />
                  </label>
                </ActionForm>
              </details>
            </Td>
          </tr>
        ))}
      </DataTable>
      {total > 0 && (
        <PageNumbers
          page={page}
          pageCount={pageCount}
          pageSize={size}
          pageSizes={SELLING_PAGE_SIZES}
          status={t("showing", { from: (page - 1) * size + 1, to: Math.min(total, page * size), total })}
          sizeLabel={t("pageSize")}
          prevLabel={t("previous")}
          nextLabel={t("next")}
          href={(p, s) => href({ page: p, size: s })}
        />
      )}
    </>
  );
}
