import Image from "next/image";
import { isStandardVariantLabel } from "@/lib/variant-label";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Clock } from "lucide-react";
import { classifyExpiry, daysLeft } from "@/server/alerts/compute";
import {
  stockByVariant,
  stockLots,
  type StockTab,
  type VariantStockRow,
} from "@/server/inventory/overview";
import type { BalanceRow, Thresholds } from "@/server/inventory/stock-summary";
import { ExpandableRow } from "@/components/admin/expandable-row";
import { ExpiryTag } from "@/components/admin/stock-parts";
import { Badge, DataTable, EmptyState, Td } from "@/components/admin/ui";
import { fmtDay, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Các khối hiển thị của trang Tồn kho (`admin/(panel)/inventory/page.tsx`): xem theo sản phẩm, theo lô, bảng lô mở rộng,
 * gợi ý. Tách khỏi trang (design-system P3, 26/11/2026) — chỉ hiển thị, số liệu do trang tải và truyền vào.
 */
type T = Awaited<ReturnType<typeof getTranslations>>;

function ArchivedBadge({ t }: { t: T }) {
  return (
    <span className="ml-1" data-testid="archived-badge">
      <Badge tone="warning">{t("archived")}</Badge>
    </span>
  );
}

export function Hint({ children }: { children: React.ReactNode }) {
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

export function ProductView({
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
    r.isBundle ? `${r.sku} · ${t("comboHint")}` : [r.sku, isStandardVariantLabel(r.label) ? null : r.label, t("lotsN", { n: r.lotCount })].filter(Boolean).join(" · ");
  const title = (r: VariantStockRow) => (
    <>
      {/* Phân loại nằm ở dòng phụ (cùng SKU) — không lặp "(60ml)" sau tên. */}
      {r.name} {r.isBundle && <Badge>{t("combo")}</Badge>}
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

export function LotView({ page, t, th, now }: { page: Awaited<ReturnType<typeof stockLots>>; t: T; th: Thresholds; now: Date }) {
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
