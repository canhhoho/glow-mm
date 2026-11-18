import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { CircleDollarSign, Clock, Layers, TriangleAlert } from "lucide-react";
import { fmtInt } from "@/lib/format";
import { FEATURES } from "@/lib/features";
import { requirePagePermission } from "@/server/auth/session";
import { PricingRunsTab } from "@/components/admin/pricing-runs-tab";
import { PriceHistoryTab, RatesTab } from "@/components/admin/pricing-tabs";
import { ClearFilters, FilterBar, FilterButton, LinkButton, Page, PageHeader, PageNumbers, SearchInput, StatCard, TabNav, fieldClass } from "@/components/admin/ui";
import { Notice } from "@/components/ui/notice";
import { rateRecalcVariantIds } from "@/server/pricing/rate-recalc";
import {
  listSellingPrices,
  SELLING_PAGE_SIZES,
  SELLING_STATES,
  sellingPriceStats,
  sellingPriceWarehouses,
  type SellingState,
} from "@/server/pricing/selling-prices";

import { ManualPricingSheet } from "@/components/admin/manual-pricing-sheet";
import { WarehousePriceSelect } from "@/components/admin/warehouse-price-select";
import { manualPricingView } from "@/server/pricing/manual";
import { can } from "@/server/auth/roles";

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
const many = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []).filter((x) => /^[a-z0-9]{1,40}$/i.test(x)).slice(0, 5000);

export default async function SellingPricesPage({ searchParams }: PageProps<"/admin/selling-prices">) {
  await requirePagePermission("pricing:manage");
  const sp = await searchParams;
  const [t, tp] = await Promise.all([getTranslations("SellingPrices"), getTranslations("Pricing")]);
  // Tab: thủ công (mặc định) · tự động · tỷ giá · lịch sử giá (gộp trang "Giá & tỷ giá" cũ, 16/11/2026).
  const mode = (["auto", "rates", "history"] as const).find((m) => m === sp.mode) ?? "manual";
  // Giá tự động đang tắt (`lib/features.ts`): link cũ `?mode=auto` chuyển sang trang Thủ công, giữ các SKU / SP đã chọn.
  if (mode === "auto" && !FEATURES.autoPricing) {
    const next = new URLSearchParams();
    const ids = many(sp.ids);
    if (ids.length) for (const id of ids) next.append("ids", id);
    const productId = one(sp.productId);
    if (productId) next.set("productId", productId);
    redirect(ids.length || productId ? `/admin/selling-prices/manual?${next}` : "/admin/selling-prices?mode=manual");
  }
  const manual = mode === "manual";
  const q = one(sp.q)?.trim().slice(0, 200) ?? "";
  const state = SELLING_STATES.find((s) => s === sp.state);
  const warehouseId = one(sp.warehouse) || undefined;
  const size = SELLING_PAGE_SIZES.find((s) => String(s) === sp.size) ?? 50;
  const requested = Number(sp.page);
  const page = Number.isSafeInteger(requested) && requested > 0 ? requested : 1;
  const stats = await sellingPriceStats();
  // 18/11/2026: có tỷ giá mới hơn lần đổi giá gần nhất (kho nhập VN) → nút tính lại tất cả theo tỷ giá mới.
  const recalc = manual || mode === "rates" ? (await rateRecalcVariantIds()).length : 0;

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
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={<Layers />} tone="brand" value={fmtInt(stats.total)} label={t("statTotal")} href={href({ state: null, page: 1 })} active={manual && !state} />
        <StatCard icon={<CircleDollarSign />} tone="danger" value={fmtInt(stats.zero)} label={t("state.zero")} href={href({ state: "zero", page: 1 })} active={manual && state === "zero"} testId="stat-zero" />
        <StatCard icon={<Clock />} tone="warning" value={fmtInt(stats.pending)} label={t("state.pending")} href={href({ state: "pending", page: 1 })} active={manual && state === "pending"} testId="stat-pending" />
        <StatCard icon={<TriangleAlert />} tone="neutral" value={fmtInt(stats.stale)} label={t("state.stale")} href={href({ state: "stale", page: 1 })} active={manual && state === "stale"} testId="stat-stale" />
      </div>
      {recalc > 0 && (
        <Notice tone="warning" data-testid="rate-recalc">
          <span className="flex flex-wrap items-center gap-2">
            <span>{t("rateRecalcBanner", { count: recalc })}</span>
            <LinkButton href="/admin/selling-prices/manual?scope=rate" variant="primary">
              {t("rateRecalcButton")}
            </LinkButton>
          </span>
        </Notice>
      )}
      <TabNav
        label={t("title")}
        tabs={[
          ...(FEATURES.autoPricing ? [{ href: "/admin/selling-prices?mode=auto", label: t("automatic"), active: mode === "auto" }] : []),
          { href: "/admin/selling-prices?mode=manual", label: t("manual"), active: manual },
          { href: "/admin/selling-prices?mode=rates", label: tp("tabRates"), active: mode === "rates" },
          { href: "/admin/selling-prices?mode=history", label: tp("tabHistory"), active: mode === "history" },
        ]}
      />
      {mode === "auto" && FEATURES.autoPricing && <PricingRunsTab variantIds={many(sp.ids)} productId={one(sp.productId)} receiptId={one(sp.receiptId)} />}
      {mode === "rates" && <RatesTab />}
      {mode === "history" && <PriceHistoryTab />}
      {manual && <ManualPrices q={q} state={state} warehouseId={warehouseId} page={page} size={size} href={href} />}
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
  const [t, tc, user, warehouses, { rows, total, page, pageCount }] = await Promise.all([
    getTranslations("SellingPrices"),
    getTranslations("Common"),
    requirePagePermission("pricing:manage"),
    sellingPriceWarehouses(),
    listSellingPrices({ q, warehouseId, state, page: rawPage, size }),
  ]);
  const filtered = !!(q || state || warehouseId);
  const view = await manualPricingView({ variantIds: rows.map((r) => r.id) });
  return (
    <>
      <p className="text-sm text-muted-foreground">{t("help")}</p>
      <FilterBar>
        <input type="hidden" name="mode" value="manual" />
        <input type="hidden" name="size" value={size} />
        <SearchInput label={t("search")} defaultValue={q} />
        <WarehousePriceSelect key={warehouseId ?? ""} warehouses={warehouses} value={warehouseId ?? ""} />
        <select name="state" defaultValue={state ?? ""} aria-label={t("stateLabel")} className={fieldClass}>
          <option value="">{t("stateAll")}</option>
          {SELLING_STATES.map((s) => (
            <option key={s} value={s}>{t(`state.${s}`)}</option>
          ))}
        </select>
        <FilterButton>{tc("filter")}</FilterButton>
        {filtered && (
          <ClearFilters href={href({ q: null, state: null, warehouse: null, page: 1 })}>{t("clearFilters")}</ClearFilters>
        )}
      </FilterBar>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">{t("empty")}</p> : (
        <ManualPricingSheet view={view} canReview={can(user.role, "catalog:manage")} canApprove={can(user.role, "catalog:approve")} />
      )}
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
