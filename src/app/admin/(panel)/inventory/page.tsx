import Image from "next/image";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ChevronDown, Clock, FileText, Plus, Search } from "lucide-react";
import { requirePagePermission } from "@/server/auth/session";
import { can, type Permission } from "@/server/auth/roles";
import { classifyExpiry, daysLeft } from "@/server/alerts/compute";
import {
  EXPIRY_FILTERS,
  PAGE_SIZE,
  parseStockFilter,
  STOCK_TABS,
  stockByVariant,
  stockLots,
  stockSummary,
  type StockFilter,
  type VariantStockRow,
} from "@/server/inventory/overview";
import type { BalanceRow, Thresholds } from "@/server/inventory/stock-summary";
import { ExpandableRow } from "@/components/admin/expandable-row";
import { ExpiryTag, Pager, stockHref, type StockView } from "@/components/admin/stock-parts";
import { Badge, DataTable, fieldClass, LinkButton, Td } from "@/components/admin/ui";
import { fmtDay, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";

type T = Awaited<ReturnType<typeof getTranslations>>;

const NEW_DOCS: [type: string, permission: Permission][] = [
  ["RECEIVE", "stock:receive"],
  ["TRANSFER", "stock:transfer"],
  ["ISSUE", "stock:issue"],
  ["ADJUST", "stock:adjust"],
];

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
  const [t, td, locale, summary, products, lots] = await Promise.all([
    getTranslations("Inventory"),
    getTranslations("Docs"),
    getLocale(),
    stockSummary({ now }),
    view === "products" ? stockByVariant(f, now) : null,
    view === "lots" ? stockLots(f, now) : null,
  ]);
  const th = summary.thresholds;
  const href = (patch: Partial<StockFilter> & { view?: StockView } = {}) => stockHref(f, view, patch);
  const newDocs = NEW_DOCS.filter(([, p]) => can(user.role, p));
  const filtered = f.tab !== "all" || !!f.q || !!f.expiry || !!f.stockType;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle", { variants: summary.variants, lots: summary.lots })}</p>
        </div>
        <div className="flex gap-2">
          <LinkButton href="/admin/inventory/documents">
            <FileText className="mr-1.5 size-4" aria-hidden />
            {t("documents")}
          </LinkButton>
          {newDocs.length > 0 && (
            <details className="group relative">
              <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-1 rounded-lg bg-primary px-3 text-sm font-medium whitespace-nowrap text-primary-foreground hover:bg-primary/80 [&::-webkit-details-marker]:hidden">
                <Plus className="size-4" aria-hidden />
                {t("newDoc")}
                <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border bg-popover p-1 text-sm shadow-md">
                {newDocs.map(([type]) => (
                  <Link key={type} href={`/admin/inventory/documents/new?type=${type}`} className="block rounded-md px-3 py-2 hover:bg-muted">
                    {td(type)}
                  </Link>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>

      {/* Ô số tổng (mobile: cuộn ngang) */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:-mx-6 md:px-6 lg:mx-0 lg:grid lg:grid-cols-5 lg:gap-3 lg:overflow-visible lg:px-0">
        <Tile label={t("statSellable")} value={fmtInt(summary.sellableUnits)} hint={t("statSellableHint", { variants: summary.sellableVariants })} />
        <Tile
          label={t("statValue")}
          value={compact(summary.valueMmk, locale)}
          hint={summary.unvaluedUnits > 0 ? t("statValueUnvalued", { units: summary.unvaluedUnits }) : t("statValueHint")}
        />
        <Tile
          label={t("statInbound")}
          value={fmtInt(summary.inbound.units)}
          hint={t("statInboundHint", { lots: summary.inbound.lots })}
          href={href({ tab: "IN_TRANSIT", expiry: undefined, stockType: undefined, q: undefined })}
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

      {/* Tab vị trí. Viền dưới vẽ bằng shadow: border-b + -mb-px làm khung dư 1px → hiện thanh cuộn dọc ▲▼ trên Windows. */}
      <nav aria-label={t("tabs")} className="-mx-4 flex gap-1 overflow-x-auto overflow-y-hidden px-4 text-sm shadow-[inset_0_-1px_0_var(--color-border)] md:mx-0 md:px-0">
        {STOCK_TABS.map((tab) => {
          const active = f.tab === tab;
          return (
            <Link
              key={tab}
              href={href({ tab })}
              aria-current={active ? "page" : undefined}
              className={cn(
                "border-b-2 px-3 py-2 whitespace-nowrap",
                active ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab === "all" ? t("tabAll") : t(`loc.${tab}`)}
              {tab !== "all" && <span className="ml-1 text-xs text-muted-foreground tabular-nums">{fmtInt(summary.byLocationType[tab])}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Bộ lọc (GET, chạy không cần JS) + cách xem */}
      <div className="flex flex-wrap items-center gap-2">
        {/* key theo bộ lọc: điều hướng phía client giữ nguyên DOM → defaultValue cũ; đổi key để form dựng lại. */}
        <form key={`${f.tab}|${f.q}|${f.expiry}|${f.stockType}|${view}`} role="search" className="flex flex-1 flex-wrap items-center gap-2">
          {f.tab !== "all" && <input type="hidden" name="tab" value={f.tab} />}
          {view === "lots" && <input type="hidden" name="view" value="lots" />}
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" aria-hidden />
            <input name="q" defaultValue={f.q} placeholder={t("search")} aria-label={t("search")} className={cn(fieldClass, "pl-8")} />
          </div>
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
          <button className="h-9 rounded-lg border px-3 text-sm hover:bg-muted">{t("filter")}</button>
          {filtered && (
            <Link href={view === "lots" ? "/admin/inventory?view=lots" : "/admin/inventory"} className="text-sm text-muted-foreground underline">
              {t("clear")}
            </Link>
          )}
        </form>
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

      {products && <ProductView page={products} t={t} th={th} now={now} />}
      {lots && <LotView page={lots} t={t} th={th} now={now} />}
      <Pager
        page={(products ?? lots)!.page}
        pageCount={(products ?? lots)!.pageCount}
        total={(products ?? lots)!.total}
        pageSize={PAGE_SIZE}
        href={(page) => href({ page })}
        t={t}
      />
    </div>
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
              <ExpiryTag date={l.expiryDate} now={now} t={t} th={th} />
            </td>
            <td className="px-3 py-1.5">{t(`loc.${l.locationType}`)}</td>
            <td className="px-3 py-1.5">
              <Badge tone={l.stockType === "TESTER" ? "brand" : "neutral"}>{t(l.stockType)}</Badge>
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums">{fmtInt(l.qty)}</td>
            <td className={cn("px-3 py-1.5 text-right tabular-nums", l.landedCostMmk == null && "text-muted-foreground")}>
              {l.landedCostMmk == null ? t("unallocated") : fmtInt(l.landedCostMmk)}
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
}: {
  page: Awaited<ReturnType<typeof stockByVariant>>;
  t: T;
  th: Thresholds;
  now: Date;
}) {
  const head = [
    "",
    t("colProduct"),
    t("colVn"),
    t("colInbound"),
    t("colMm"),
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
      <div className="hidden md:block">
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
                    {c ? num(c.vn) : dash}
                    {c ? num(c.inbound) : dash}
                    {c ? num(c.mm) : dash}
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

      {/* Mobile: thẻ */}
      <div className="space-y-2 md:hidden">
        {page.rows.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{t("emptyFiltered")}</p>}
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
              <div className="mt-2 grid grid-cols-4 gap-1 text-center text-[11px]">
                {(
                  [
                    [t("colVn"), c?.vn],
                    [t("colInbound"), c?.inbound],
                    [t("colMm"), c?.mm],
                  ] as const
                ).map(([label, v]) => (
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
            <ExpiryTag date={r.expiryDate} now={now} t={t} th={th} />
          </Td>
          <Td className="font-mono text-xs">{r.locationCode}</Td>
          <Td>
            <Badge tone={r.stockType === "TESTER" ? "brand" : "neutral"}>{t(r.stockType)}</Badge>
          </Td>
          <Td className="text-right tabular-nums">{fmtInt(r.qty)}</Td>
          <Td className={cn("text-right tabular-nums", r.landedCostMmk == null && "text-muted-foreground")}>
            {r.landedCostMmk == null ? t("unallocated") : fmtInt(r.landedCostMmk)}
          </Td>
        </tr>
      ))}
    </DataTable>
  );
}
