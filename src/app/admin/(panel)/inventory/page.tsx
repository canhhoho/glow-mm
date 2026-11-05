import Image from "next/image";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Clock, FileText } from "lucide-react";
import { requirePagePermission } from "@/server/auth/session";
import { classifyExpiry, daysLeft } from "@/server/alerts/compute";
import {
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
import { ExpiryTag, NewDocMenu, Pager, stockHref, type StockView } from "@/components/admin/stock-parts";
import { Badge, DataTable, fieldClass, FilterBar, FilterButton, LinkButton, Page, PageHeader, SearchInput, TabNav, Td } from "@/components/admin/ui";
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
  const [t, td, locale, summary, products, lots, tabs] = await Promise.all([
    getTranslations("Inventory"),
    getTranslations("Docs"),
    getLocale(),
    stockSummary({ now }),
    view === "products" ? stockByVariant(f, now) : null,
    view === "lots" ? stockLots(f, now) : null,
    stockTabs(),
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
  const filtered = f.tab !== "all" || !!f.q || !!f.expiry || !!f.stockType;

  return (
    <Page>
      <PageHeader
        title={t("title")}
        description={t("subtitle", { variants: summary.variants, lots: summary.lots })}
        actions={
          <>
          <LinkButton href="/admin/inventory/documents">
            <FileText aria-hidden />
            {t("documents")}
          </LinkButton>
          <NewDocMenu role={user.role} label={t("newDoc")} td={td} />
          </>
        }
      />

      {/* Ô số tổng (mobile: cuộn ngang) */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:-mx-6 md:px-6 lg:mx-0 lg:grid lg:grid-cols-5 lg:gap-3 lg:overflow-visible lg:px-0">
        <Tile
          label={t("statSellable")}
          value={fmtInt(Math.max(0, summary.sellableUnits - summary.heldUnits))}
          hint={
            summary.heldUnits > 0
              ? t("statSellableHintHeld", { variants: summary.sellableVariants, held: summary.heldUnits })
              : t("statSellableHint", { variants: summary.sellableVariants })
          }
        />
        <Tile
          label={t("statValue")}
          value={compact(summary.valueMmk, locale)}
          hint={[summary.unvaluedUnits > 0 ? t("statValueUnvalued", { units: summary.unvaluedUnits }) : t("statValueHint"), summary.estimatedUnits > 0 ? t("estimatedUnits", { units: summary.estimatedUnits }) : ""].filter(Boolean).join(" · ")}
        />
        <Tile
          label={t("statQuarantine")}
          value={fmtInt(summary.byLocationType.QUARANTINE)}
          hint={t("statQuarantineHint")}
          href="/admin/inventory/quarantine"
        />
        <Tile
          tone="warning"
          label={t("statNear", { days: th.warnDays })}
          value={t("lotsN", { n: summary.near.lots })}
          hint={t("unitsN", { n: summary.near.units })}
          href={href({ tab: "all", expiry: "near", stockType: undefined, q: undefined })}
          testId="tile-near"
        />
        <Tile
          tone="danger"
          label={t("statBlocked", { days: th.blockDays })}
          value={t("lotsN", { n: summary.blocked.lots })}
          hint={t("unitsN", { n: summary.blocked.units })}
          href={href({ tab: "all", expiry: "blocked", stockType: undefined, q: undefined })}
          testId="tile-blocked"
        />
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
        <FilterBar key={`${f.tab}|${f.q}|${f.expiry}|${f.stockType}|${view}`} className="flex-1">
          {f.tab !== "all" && <input type="hidden" name="tab" value={f.tab} />}
          {view === "lots" && <input type="hidden" name="view" value="lots" />}
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
          <FilterButton>{t("filter")}</FilterButton>
          {filtered && (
            <Link href={view === "lots" ? "/admin/inventory?view=lots" : "/admin/inventory"} className="text-sm text-muted-foreground underline">
              {t("clear")}
            </Link>
          )}
        </FilterBar>
        <div role="group" aria-label={t("view")} className="inline-flex rounded-lg border p-0.5 text-sm">
          {(["products", "lots"] as const).map((v) => (
            <Link
              key={v}
              href={href({ view: v })}
              aria-current={view === v ? "page" : undefined}
              className={cn("rounded-md px-3 py-1", view === v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
            >
              {v === "products" ? t("viewProducts") : t("viewLots")}
            </Link>
          ))}
        </div>
      </div>

      {products && <ProductView page={products} t={t} th={th} now={now} warehouses={sellableTabs} />}
      {lots && <LotView page={lots} t={t} th={th} now={now} />}
      <Pager
        page={(products ?? lots)!.page}
        pageCount={(products ?? lots)!.pageCount}
        total={(products ?? lots)!.total}
        pageSize={PAGE_SIZE}
        href={(page) => href({ page })}
        t={t}
      />
    </Page>
  );
}

function Tile({
  label,
  value,
  hint,
  href,
  tone,
  testId,
}: {
  label: string;
  value: string;
  hint: string;
  href?: string;
  tone?: "warning" | "danger";
  testId?: string;
}) {
  const cls = cn(
    "block w-40 flex-none rounded-xl border p-3 lg:w-auto lg:p-4",
    tone === "warning" && "border-amber-200 bg-amber-50/60 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
    tone === "danger" && "border-red-200 bg-red-50/60 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300",
    href && "hover:brightness-95",
  );
  const body = (
    <>
      <div className={cn("text-xs", !tone && "text-muted-foreground")}>{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums lg:text-2xl">{value}</div>
      <div className={cn("text-xs", !tone && "text-muted-foreground")}>{hint}</div>
    </>
  );
  return href ? (
    <Link href={href} className={cls} data-testid={testId}>
      {body}
    </Link>
  ) : (
    <div className={cls} data-testid={testId}>
      {body}
    </div>
  );
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
    <table className="w-full overflow-hidden rounded-lg border bg-background text-xs">
      <thead className="bg-muted/50 text-left text-muted-foreground">
        <tr>
          <th className="px-3 py-1.5 font-medium">{t("colLot")}</th>
          <th className="px-3 py-1.5 font-medium">{t("colExpiry")}</th>
          <th className="px-3 py-1.5 font-medium">{t("colLocation")}</th>
          <th className="px-3 py-1.5 font-medium">{t("colType")}</th>
          <th className="px-3 py-1.5 text-right font-medium">{t("colQty")}</th>
          <th className="px-3 py-1.5 text-right font-medium">{t("colUnitCost")}</th>
          <th className="px-3 py-1.5" />
        </tr>
      </thead>
      <tbody className="divide-y">
        {lots.map((l) => (
          <tr key={`${l.batchId}|${l.locationId}|${l.stockType}`} data-testid="lot-row">
            <td className="px-3 py-1.5 font-mono">{l.lotNo}</td>
            <td className="px-3 py-1.5">
              <ExpiryTag date={l.expiryDate} status={l.expiryStatus} now={now} t={t} th={th} />
            </td>
            <td className="px-3 py-1.5">{l.locationName ?? l.locationCode}</td>
            <td className="px-3 py-1.5">
              <Badge tone={l.stockType === "TESTER" ? "brand" : "neutral"}>{t(l.stockType)}</Badge>
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums">{fmtInt(l.qty)}</td>
            <td className={cn("px-3 py-1.5 text-right tabular-nums", l.landedCostMmk == null && "text-muted-foreground")}>
              {l.landedCostMmk == null ? t("unallocated") : fmtInt(l.landedCostMmk)}
              <div className="text-[11px] text-muted-foreground">{t(`cost${l.costStatus ?? (l.landedCostMmk == null ? "MISSING" : "ACTUAL")}`)}</div>
            </td>
            <td className="px-3 py-1.5 text-right">
              <Link href={`/admin/inventory/batches/${l.batchId}`} className="text-primary underline">
                {t("history")}
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
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
    "",
    t("colProduct"),
    ...warehouses.map((w) => w.name),
    ...(showOther ? [t("colOther")] : []),
    t("colTester"),
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
    </>
  );

  return (
    <>
      {/* Desktop: bảng */}
      <div className="hidden lg:block">
        <DataTable head={head} empty={t("emptyFiltered")}>
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
                          <div className="font-mono text-[11px] text-muted-foreground">{sub(r)}</div>
                        </div>
                      </div>
                    </Td>
                    {stockCols(c).map(([label, v]) => (v == null ? <Td key={label} className="text-right text-muted-foreground">—</Td> : <Td key={label} className="text-right tabular-nums">{fmtInt(v)}</Td>))}
                    {c ? num(c.tester, true) : dash}
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
        {page.rows.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground md:col-span-2">{t("emptyFiltered")}</p>}
        {page.rows.map((r) => {
          const c = r.cols;
          const e = c?.earliest;
          const level = e ? classifyExpiry(e.expiryDate, now, th) : null;
          return (
            <div key={r.variantId} data-testid="stock-card" className={cn("rounded-xl border p-3", level && level !== "near" && "border-red-200")}>
              <div className="flex gap-3">
                <Thumb url={r.imageUrl} alt={r.name} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 leading-snug font-medium">{title(r)}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">{sub(r)}</div>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1 text-center text-[11px]">
                {stockCols(c).map(([label, v]) => (
                  <div key={label} className="rounded bg-muted/60 py-1">
                    <div className="text-muted-foreground">{label}</div>
                    <div className="text-[13px] font-medium tabular-nums">{v == null ? "—" : fmtInt(v)}</div>
                  </div>
                ))}
                <div className="rounded bg-primary/10 py-1 text-primary">
                  <div>{t("colAvailable")}</div>
                  <div className="text-[13px] font-semibold tabular-nums">{fmtInt(r.available)}</div>
                </div>
              </div>
              {e && level && (
                <div
                  className={cn(
                    "mt-2 flex items-center gap-1 text-xs",
                    level === "near" ? "text-amber-800 dark:text-amber-300" : "text-destructive",
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
                  <div className="mt-2 overflow-x-auto">
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
      head={[t("colSku"), t("colProduct"), t("colLot"), t("colExpiry"), t("colLocation"), t("colType"), t("colQty"), t("colCost")]}
    >
      {page.rows.map((r) => (
        <tr key={r.key}>
          <Td className="font-mono text-xs">{r.sku}</Td>
          <Td>
            {r.name} <span className="text-muted-foreground">({r.variantLabel})</span>
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
            <div className="text-[11px] text-muted-foreground">{t(`cost${r.costStatus}`)}</div>
          </Td>
        </tr>
      ))}
    </DataTable>
  );
}
