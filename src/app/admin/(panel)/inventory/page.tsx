import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Ban, Bell, Clock, FileText, Package, ShieldAlert, Wallet } from "lucide-react";
import { requirePagePermission } from "@/server/auth/session";
import {
  countArchived,
  countNotReceived,
  EXPIRY_FILTERS,
  PAGE_SIZE,
  parseStockFilter,
  stockByVariant,
  stockLots,
  stockSummary,
  stockTabs,
  type StockFilter,
} from "@/server/inventory/overview";
import { NewDocMenu, stockHref, type StockView } from "@/components/admin/stock-parts";
import { ClearFilters, fieldClass, FilterBar, FilterButton, LinkButton, Page, PageHeader, PageNumbers, SearchInput, Segmented, Stat, TabNav } from "@/components/admin/ui";
import { fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FEATURES } from "@/lib/features";
import { Hint, LotView, ProductView } from "@/components/admin/inventory-views";

/** Số gọn cho ô tổng: 38.200.000 → "38,2 tr" (vi) / "38.2M" (en, my). */
function compact(n: number, locale: string) {
  return new Intl.NumberFormat(locale === "vi" ? "vi" : "en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export default async function InventoryPage({ searchParams }: PageProps<"/admin/inventory">) {
  const user = await requirePagePermission("stock:view");
  const sp = await searchParams;
  const f = parseStockFilter(sp);
  const view: StockView = sp.view === "lots" ? "lots" : "products";
  const now = new Date();
  const [t, tn, tc, td, locale, summary, products, lots, tabs, notReceived, archived] = await Promise.all([
    getTranslations("Inventory"),
    getTranslations("Nav"),
    getTranslations("Common"),
    getTranslations("Docs"),
    getLocale(),
    stockSummary({ now }),
    view === "products" ? stockByVariant(f, now) : null,
    view === "lots" ? stockLots(f, now) : null,
    stockTabs(),
    countNotReceived(),
    countArchived(now),
  ]);
  // Cột theo kho bán (P24); tồn ở kho khác (kho cũ, chưa chuyển) gộp vào cột "Kho khác" nếu trang có.
  // Nhiều kho (vd. DB test) → chỉ cột của kho có hàng trong trang; tab giữ 20 kho nhiều tồn nhất + tab đang chọn.
  const allSellable = tabs.filter((l) => l.sellable && l.active);
  const onPage = new Set(products?.rows.flatMap((r) => Object.keys(r.cols?.byLocation ?? {})) ?? []);
  const sellableTabs = allSellable.length <= 6 ? allSellable : allSellable.filter((l) => onPage.has(l.code));
  const top = new Set(
    tabs.length <= 20 ? tabs : [...tabs].sort((a, b) => (summary.byLocation[b.code] ?? 0) - (summary.byLocation[a.code] ?? 0)).slice(0, 20),
  );
  const shownTabs = tabs.filter((l) => top.has(l) || l.code === f.tab);
  const th = summary.thresholds;
  const href = (patch: Partial<StockFilter> & { view?: StockView } = {}) => stockHref(f, view, patch);
  const filtered = f.tab !== "all" || !!f.q || !!f.expiry || !!f.stockType || !!f.received || !!f.status || !!f.cost;

  return (
    <Page>
      <PageHeader
        title={t("title")}
        description={t("subtitle", { variants: summary.variants, lots: summary.lots })}
        actions={
          <>
          {/* Cảnh báo + Chờ kiểm tra là lối tắt từ Tồn kho (không còn mục menu riêng). */}
          <LinkButton href="/admin/alerts">
            <Bell aria-hidden />
            {tn("alerts")}
          </LinkButton>
          <LinkButton href="/admin/inventory/documents">
            <FileText aria-hidden />
            {t("documents")}
          </LinkButton>
          <NewDocMenu role={user.role} label={t("newDoc")} td={td} />
          </>
        }
      />

      {/* Ô số tổng (P3b: cùng kiểu ô số của danh sách SP / dashboard; dòng gợi ý dưới ô) */}
      <div className="@container">
        <div className={cn(
          "grid grid-cols-2 gap-3 *:grid *:min-w-0 *:grid-rows-[1fr_auto]",
          FEATURES.expiry ? "md:grid-cols-3 2xl:grid-cols-6" : "@min-[52rem]:grid-cols-4",
        )}>
          <div>
            <Stat icon={<Package />} tone="brand" value={fmtInt(summary.availableUnits)} label={t("statSellable")} />
            <Hint>
              {summary.heldUnits > 0
                ? t("statSellableHintHeld", { variants: summary.sellableVariants, held: summary.heldUnits })
                : t("statSellableHint", { variants: summary.sellableVariants })}
            </Hint>
          </div>
          <div>
            <Stat icon={<Wallet />} tone="green" value={compact(summary.valueMmk, locale)} label={t("statValue")} />
            <Hint>
              {[summary.unvaluedUnits > 0 ? t("statValueUnvalued", { units: summary.unvaluedUnits }) : t("statValueHint"), summary.estimatedUnits > 0 ? t("estimatedUnits", { units: summary.estimatedUnits }) : ""].filter(Boolean).join(" · ")}
            </Hint>
          </div>
          <div>
            <Stat icon={<Wallet />} tone="green" value={compact(summary.valueVnd, locale)} label={t("statValueVnd")} />
            <Hint>{t("statValueVndHint")}</Hint>
          </div>
          <div>
            <Stat icon={<ShieldAlert />} tone="neutral" value={fmtInt(summary.byLocationType.QUARANTINE)} label={t("statQuarantine")} href="/admin/inventory/quarantine" />
            <Hint>{t("statQuarantineHint")}</Hint>
          </div>
          {FEATURES.expiry && (
            <>
              <div>
                <Stat
                  icon={<Clock />}
                  tone="warning"
                  value={t("lotsN", { n: summary.near.lots })}
                  label={t("statNear", { days: th.warnDays })}
                  href={href({ tab: "all", expiry: "near", stockType: undefined, q: undefined })}
                  active={f.expiry === "near"}
                  testId="tile-near"
                />
                <Hint>{t("unitsN", { n: summary.near.units })}</Hint>
              </div>
              <div>
                <Stat
                  icon={<Ban />}
                  tone="danger"
                  value={t("lotsN", { n: summary.blocked.lots })}
                  label={t("statBlocked", { days: th.blockDays })}
                  href={href({ tab: "all", expiry: "blocked", stockType: undefined, q: undefined })}
                  active={f.expiry === "blocked"}
                  testId="tile-blocked"
                />
                <Hint>{t("unitsN", { n: summary.blocked.units })}</Hint>
              </div>
            </>
          )}
        </div>
      </div>

      <TabNav
        label={t("tabs")}
        tabs={[
          { href: href({ tab: "all" }), active: f.tab === "all", label: t("tabAll") },
          ...shownTabs.map((l) => ({
            href: href({ tab: l.code }),
            active: f.tab === l.code,
            label: l.active ? l.name : `${l.name} (${t("inactive")})`,
            count: fmtInt(summary.byLocation[l.code] ?? 0),
          })),
        ]}
      />

      {/* Bộ lọc (GET, chạy không cần JS) + cách xem */}
      <div className="flex flex-wrap items-center gap-2">
        {/* key theo bộ lọc: điều hướng phía client giữ nguyên DOM → defaultValue cũ; đổi key để form dựng lại. */}
        <FilterBar key={`${f.tab}|${f.q}|${f.expiry}|${f.stockType}|${f.cost}|${view}`} className="flex-1">
          {f.tab !== "all" && <input type="hidden" name="tab" value={f.tab} />}
          {view === "lots" && <input type="hidden" name="view" value="lots" />}
          {f.received && <input type="hidden" name="received" value={f.received} />}
          {f.status && <input type="hidden" name="status" value={f.status} />}
          {f.cost && <input type="hidden" name="cost" value={f.cost} />}
          <SearchInput label={t("search")} defaultValue={f.q} />
          {FEATURES.expiry && (
            <select name="expiry" defaultValue={f.expiry ?? ""} aria-label={t("expiryFilter")} className={cn(fieldClass, "w-auto")}>
              <option value="">{t("expiryAll")}</option>
              {EXPIRY_FILTERS.map((e) => (
                <option key={e} value={e}>
                  {t(`ex.${e}`)}
                </option>
              ))}
            </select>
          )}
          <select name="stockType" defaultValue={f.stockType ?? ""} aria-label={t("stockTypeFilter")} className={cn(fieldClass, "w-auto")}>
            <option value="">{t("stockTypeAll")}</option>
            <option value="SELLABLE">{t("SELLABLE")}</option>
            <option value="TESTER">{t("TESTER")}</option>
          </select>
          <FilterButton>{tc("filter")}</FilterButton>
          {filtered && (
            <ClearFilters href={view === "lots" ? "/admin/inventory?view=lots" : "/admin/inventory"}>{t("clear")}</ClearFilters>
          )}
        </FilterBar>
        <Segmented
          label={t("view")}
          items={(["products", "lots"] as const).map((v) => ({ href: href({ view: v }), label: v === "products" ? t("viewProducts") : t("viewLots"), active: view === v }))}
        />
      </div>

      {/* Ngoài "Tất cả": SP chưa từng nhập hàng, SP ngừng kinh doanh (bấm Xoá nhưng có lịch sử) — xem riêng ở đây. */}
      {view === "products" && (f.received || f.status || f.cost) && (
        <p className="text-sm">
          <Link href={href({ received: undefined, status: undefined, cost: undefined })} className="text-primary underline">
            {t(f.status || f.cost ? "showAll" : "showReceived")}
          </Link>
        </p>
      )}
      {view === "products" && !f.received && !f.status && !f.cost && (notReceived > 0 || archived.withStock > 0 || archived.history > 0 || summary.unvaluedUnits > 0) && (
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {notReceived > 0 && (
            <Link href={href({ received: "no", tab: "all", expiry: undefined, stockType: undefined })} className="text-primary underline" data-testid="not-received-link">
              {t("notReceived", { count: notReceived })}
            </Link>
          )}
          {summary.unvaluedUnits > 0 && (
            <Link href={href({ cost: "missing", tab: "all", expiry: undefined, stockType: undefined })} className="text-primary underline" data-testid="missing-cost-link">
              {t("missingCostLink", { count: summary.unvaluedUnits })}
            </Link>
          )}
          {archived.withStock > 0 && (
            <Link href={href({ status: "archived", tab: "all", expiry: undefined, stockType: undefined })} className="text-primary underline" data-testid="archived-link">
              {t("archivedWithStock", { count: archived.withStock })}
            </Link>
          )}
          {archived.history > 0 && (
            <Link href={href({ status: "history", tab: "all", expiry: undefined, stockType: undefined })} className="text-primary underline" data-testid="history-link">
              {t("archivedHistory", { count: archived.history })}
            </Link>
          )}
        </p>
      )}
      {products && <ProductView page={products} t={t} th={th} now={now} warehouses={sellableTabs} />}
      {lots && <LotView page={lots} t={t} th={th} now={now} />}
      {(() => {
        const pg = (products ?? lots)!;
        if (pg.total === 0) return null;
        const from = Math.min(pg.total, (pg.page - 1) * PAGE_SIZE + 1);
        const to = Math.min(pg.total, pg.page * PAGE_SIZE);
        return (
          <PageNumbers
            page={pg.page}
            pageCount={pg.pageCount}
            pageSize={PAGE_SIZE}
            status={t("pageInfo", { from, to, total: pg.total })}
            prevLabel={t("prev")}
            nextLabel={t("next")}
            href={(page) => href({ page })}
          />
        );
      })()}
    </Page>
  );
}

/** SP ngừng kinh doanh (bấm Xoá nhưng có lịch sử kho/đơn): vẫn xem tồn được, không bán. */
