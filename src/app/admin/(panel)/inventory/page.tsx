import Image from "next/image";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Ban, Bell, Clock, FileText, Package, ShieldAlert, Wallet } from "lucide-react";
import { requirePagePermission } from "@/server/auth/session";
import { classifyExpiry, daysLeft } from "@/server/alerts/compute";
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
  type StockTab,
  type VariantStockRow,
} from "@/server/inventory/overview";
import type { BalanceRow, Thresholds } from "@/server/inventory/stock-summary";
import { ExpandableRow } from "@/components/admin/expandable-row";
import { ExpiryTag, NewDocMenu, stockHref, type StockView } from "@/components/admin/stock-parts";
import { Badge, ClearFilters, DataTable, EmptyState, fieldClass, FilterBar, FilterButton, LinkButton, Page, PageHeader, PageNumbers, SearchInput, Segmented, StatCard, TabNav, Td } from "@/components/admin/ui";
import { fmtDay, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";

type T = Awaited<ReturnType<typeof getTranslations>>;

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
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <div>
          <StatCard icon={<Package />} tone="brand" value={fmtInt(summary.availableUnits)} label={t("statSellable")} />
          <Hint>
            {summary.heldUnits > 0
              ? t("statSellableHintHeld", { variants: summary.sellableVariants, held: summary.heldUnits })
              : t("statSellableHint", { variants: summary.sellableVariants })}
          </Hint>
        </div>
        <div>
          <StatCard icon={<Wallet />} tone="green" value={compact(summary.valueMmk, locale)} label={t("statValue")} />
          <Hint>
            {[summary.unvaluedUnits > 0 ? t("statValueUnvalued", { units: summary.unvaluedUnits }) : t("statValueHint"), summary.estimatedUnits > 0 ? t("estimatedUnits", { units: summary.estimatedUnits }) : ""].filter(Boolean).join(" · ")}
          </Hint>
        </div>
        <div>
          <StatCard icon={<ShieldAlert />} tone="neutral" value={fmtInt(summary.byLocationType.QUARANTINE)} label={t("statQuarantine")} href="/admin/inventory/quarantine" />
          <Hint>{t("statQuarantineHint")}</Hint>
        </div>
        <div>
          <StatCard
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
          <StatCard
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
          <select name="expiry" defaultValue={f.expiry ?? ""} aria-label={t("expiryFilter")} className={cn(fieldClass, "w-auto")}>
            <option value="">{t("expiryAll")}</option>
            {EXPIRY_FILTERS.map((e) => (
              <option key={e} value={e}>
                {t(`ex.${e}`)}
              </option>
            ))}
          </select>
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
function ArchivedBadge({ t }: { t: T }) {
  return (
    <span className="ml-1" data-testid="archived-badge">
      <Badge tone="warning">{t("archived")}</Badge>
    </span>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <span className="mt-1 block truncate px-1 text-xs text-muted-foreground">{children}</span>;
}

function Thumb({ url, alt, size }: { url: string | null; alt: string; size: "sm" | "md" }) {
  const cls = size === "sm" ? "size-10" : "size-12";
  return (
    <div className={cn("relative flex-none overflow-hidden rounded-md bg-muted", cls)}>
      {url && <Image src={url} alt={alt} fill sizes="48px" className="object-cover" />}
    </div>
  );
}

const num = (n: number, muted = false) => <Td className={cn("text-right tabular-nums", muted && "text-muted-foreground")}>{fmtInt(n)}</Td>;
const dash = <Td className="text-right text-muted-foreground">—</Td>;

function LotsTable({ lots, t, th, now }: { lots: BalanceRow[]; t: T; th: Thresholds; now: Date }) {
  return (
    <DataTable
      dense
      className="bg-background"
      numeric={[4, 5]}
      head={[t("colLot"), t("colExpiry"), t("colLocation"), t("colType"), t("colQty"), t("colUnitCost"), <span key="h" className="sr-only">{t("history")}</span>]}
    >
      {lots.map((l) => (
        <tr key={`${l.batchId}|${l.locationId}|${l.stockType}`} data-testid="lot-row">
          <Td className="font-mono">{l.lotNo}</Td>
          <Td>
            <ExpiryTag date={l.expiryDate} status={l.expiryStatus} now={now} t={t} th={th} />
          </Td>
          <Td>{l.locationName ?? l.locationCode}</Td>
          <Td>
            <Badge tone={l.stockType === "TESTER" ? "brand" : "neutral"}>{t(l.stockType)}</Badge>
          </Td>
          <Td className="text-right tabular-nums">{fmtInt(l.qty)}</Td>
          <Td className={cn("text-right tabular-nums", l.landedCostMmk == null && "text-muted-foreground")}>
            {l.landedCostMmk == null ? t("unallocated") : fmtInt(l.landedCostMmk)}
            <div className="text-2xs text-muted-foreground">{t(`cost${l.costStatus ?? (l.landedCostMmk == null ? "MISSING" : "ACTUAL")}`)}</div>
          </Td>
          <Td className="text-right">
            <Link href={`/admin/inventory/batches/${l.batchId}`} className="text-primary underline">
              {t("history")}
            </Link>
          </Td>
        </tr>
      ))}
    </DataTable>
  );
}

function Earliest({ r, t, th, now }: { r: VariantStockRow; t: T; th: Thresholds; now: Date }) {
  const e = r.cols?.earliest;
  return e ? <ExpiryTag date={e.expiryDate} now={now} t={t} th={th} /> : <span className="text-muted-foreground">—</span>;
}

function ProductView({
  page,
  t,
  th,
  now,
  warehouses,
}: {
  page: Awaited<ReturnType<typeof stockByVariant>>;
  t: T;
  th: Thresholds;
  now: Date;
  warehouses: StockTab[];
}) {
  // SL bán (ngoài chờ kiểm tra, không tester) ở kho không có cột riêng: kho cũ / kho đã ngừng.
  const other = (c: NonNullable<VariantStockRow["cols"]>) =>
    c.vn + c.inbound + c.mm - warehouses.reduce((s, w) => s + (c.byLocation[w.code] ?? 0), 0);
  const showOther = page.rows.some((r) => r.cols && other(r.cols) !== 0);
  const stockCols = (c: VariantStockRow["cols"]) => [
    ...warehouses.map((w) => [w.name, c ? (c.byLocation[w.code] ?? 0) : null] as const),
    ...(showOther ? [[t("colOther"), c ? other(c) : null] as const] : []),
  ];
  const head = [
    <span key="x" className="sr-only">{t("showLots")}</span>,
    t("colProduct"),
    ...warehouses.map((w) => w.name),
    ...(showOther ? [t("colOther")] : []),
    t("colTester"),
    t("colPhysical"),
    t("colReserved"),
    t("colAvailable"),
    t("colEarliest"),
    t("colValue"),
  ];
  const sub = (r: VariantStockRow) =>
    r.isBundle ? `${r.sku} · ${t("comboHint")}` : `${r.sku} · ${r.label} · ${t("lotsN", { n: r.lotCount })}`;
  const title = (r: VariantStockRow) => (
    <>
      {r.name} {r.isBundle ? <Badge>{t("combo")}</Badge> : <span className="text-muted-foreground">({r.label})</span>}
      {r.archived && <ArchivedBadge t={t} />}
    </>
  );

  return (
    <>
      {/* Desktop: bảng */}
      <div className="hidden lg:block">
        <DataTable head={head} empty={t("emptyFiltered")} numeric={head.map((_, i) => i).filter((i) => (i >= 2 && i < head.length - 2) || i === head.length - 1)}>
          {page.rows.map((r) => {
            const c = r.cols;
            return (
              <ExpandableRow
                key={r.variantId}
                testId="stock-row"
                colSpan={head.length}
                label={`${t("showLots")}: ${r.sku}`}
                detail={c && c.lots.length > 0 ? <LotsTable lots={c.lots} t={t} th={th} now={now} /> : null}
                cells={
                  <>
                    <Td>
                      <div className="flex items-center gap-3">
                        <Thumb url={r.imageUrl} alt={r.name} size="sm" />
                        <div>
                          <div className="font-medium">{title(r)}</div>
                          <div className="font-mono text-2xs text-muted-foreground">{sub(r)}</div>
                        </div>
                      </div>
                    </Td>
                    {stockCols(c).map(([label, v]) => (v == null ? <Td key={label} className="text-right text-muted-foreground">—</Td> : <Td key={label} className="text-right tabular-nums">{fmtInt(v)}</Td>))}
                    {c ? num(c.tester, true) : dash}
                    {c ? <Td className="text-right font-medium tabular-nums">{fmtInt(c.vn + c.inbound + c.mm + c.tester)}</Td> : dash}
                    {num(r.reserved, true)}
                    <Td className={cn("text-right font-medium tabular-nums", r.available === 0 && "text-destructive")}>
                      {fmtInt(r.available)}
                    </Td>
                    <Td>
                      <Earliest r={r} t={t} th={th} now={now} />
                    </Td>
                    {c ? (
                      <Td className="text-right tabular-nums">
                        {fmtInt(c.valueMmk)}
                        {c.unvalued && <span className="text-muted-foreground">*</span>}
                      </Td>
                    ) : (
                      dash
                    )}
                  </>
                }
              />
            );
          })}
        </DataTable>
      </div>

      {/* Điện thoại + máy tính bảng dọc: thẻ */}
      <div className="grid gap-2 md:grid-cols-2 lg:hidden [&>*]:min-w-0">
        {page.rows.length === 0 && <EmptyState className="md:col-span-2">{t("emptyFiltered")}</EmptyState>}
        {page.rows.map((r) => {
          const c = r.cols;
          const e = c?.earliest;
          const level = e ? classifyExpiry(e.expiryDate, now, th) : null;
          return (
            <div key={r.variantId} data-testid="stock-card" className={cn("rounded-xl border bg-card p-3", level && level !== "near" && "border-danger-border")}>
              <div className="flex gap-3">
                <Thumb url={r.imageUrl} alt={r.name} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 leading-snug font-medium">{title(r)}</div>
                  <div className="font-mono text-2xs text-muted-foreground">{sub(r)}</div>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1 text-center text-2xs">
                {stockCols(c).map(([label, v]) => (
                  <div key={label} className="rounded bg-muted/60 py-1">
                    <div className="text-muted-foreground">{label}</div>
                    <div className="text-sm font-medium tabular-nums">{v == null ? "—" : fmtInt(v)}</div>
                  </div>
                ))}
                <div className="rounded bg-primary/10 py-1 text-primary">
                  <div>{t("colAvailable")}</div>
                  <div className="text-sm font-semibold tabular-nums">{fmtInt(r.available)}</div>
                </div>
              </div>
              {e && level && (
                <div
                  className={cn(
                    "mt-2 flex items-center gap-1 text-xs",
                    level === "near" ? "text-warning-foreground" : "text-destructive",
                  )}
                >
                  <Clock className="size-3.5 flex-none" aria-hidden />
                  {t("earliestLine", { lot: e.lotNo, date: fmtDay(e.expiryDate) })} ·{" "}
                  {level === "expired" ? t("expired") : t("daysLeft", { n: daysLeft(e.expiryDate, now) })}
                </div>
              )}
              {c && c.lots.length > 0 && (
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer text-primary">{t("showLots")}</summary>
                  <div className="mt-2">
                    <LotsTable lots={c.lots} t={t} th={th} now={now} />
                  </div>
                </details>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function LotView({ page, t, th, now }: { page: Awaited<ReturnType<typeof stockLots>>; t: T; th: Thresholds; now: Date }) {
  return (
    <DataTable
      empty={t("emptyFiltered")}
      numeric={[6, 7]}
      head={[t("colSku"), t("colProduct"), t("colLot"), t("colExpiry"), t("colLocation"), t("colType"), t("colQty"), t("colCost")]}
    >
      {page.rows.map((r) => (
        <tr key={r.key}>
          <Td className="font-mono text-xs">{r.sku}</Td>
          <Td>
            {r.name} <span className="text-muted-foreground">({r.variantLabel})</span>
            {r.archived && <ArchivedBadge t={t} />}
          </Td>
          <Td className="font-mono text-xs">
            <Link href={`/admin/inventory/batches/${r.batchId}`} className="text-primary underline">
              {r.lotNo}
            </Link>
          </Td>
          <Td>
            <ExpiryTag date={r.expiryDate} status={r.expiryStatus} now={now} t={t} th={th} />
          </Td>
          <Td className="text-xs">{r.locationName}</Td>
          <Td>
            <Badge tone={r.stockType === "TESTER" ? "brand" : "neutral"}>{t(r.stockType)}</Badge>
          </Td>
          <Td className="text-right tabular-nums">{fmtInt(r.qty)}</Td>
          <Td className={cn("text-right tabular-nums", r.landedCostMmk == null && "text-muted-foreground")}>
            {r.landedCostMmk == null ? t("unallocated") : fmtInt(r.landedCostMmk)}
            <div className="text-2xs text-muted-foreground">{t(`cost${r.costStatus}`)}</div>
          </Td>
        </tr>
      ))}
    </DataTable>
  );
}
