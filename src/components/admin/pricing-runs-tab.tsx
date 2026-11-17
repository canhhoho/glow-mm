import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { lastShipRate, listRates, listRuns, pricingFilterOptions, pricingGaps } from "@/server/pricing/queries";
import { PricingRunForm } from "@/components/admin/pricing-run-form";
import { getNumberSetting } from "@/server/settings";
import { Badge, DataTable, Notice, Section, Td } from "@/components/admin/ui";
import { rateDisplay } from "@/server/pricing/formula";
import { fmtDate, fmtDateTime, fmtInt } from "@/lib/format";
import { prisma } from "@/lib/db";
import { productName } from "@/server/inventory/queries";
const RUN_TONE = { PREVIEW: "warning", APPLIED: "success", CANCELLED: "neutral" } as const;
/** `variantIds`: SKU chọn ở danh sách Giá bán (16/11) — chỉ tính các SKU này. */
export async function PricingRunsTab({ receiptId, productId, variantIds }: { receiptId?: string; productId?: string; variantIds?: string[] }) {
  const [t, rates, runs, options, gaps, roundTo, lastShip] = await Promise.all([
    getTranslations("Pricing"),
    listRates(),
    listRuns(),
    pricingFilterOptions(),
    pricingGaps(),
    getNumberSetting("pricing.roundTo"),
    lastShipRate(),
  ]);
  const receipt = receiptId ? await prisma.stockDocument.findFirst({ where: { id: receiptId, type: "RECEIVE", status: "POSTED" }, select: { code: true, lines: { select: { variant: { select: { product: { select: { stockLocationId: true } } } } } } } }) : null;
  if (receiptId && !receipt) return <Notice tone="danger">{t("receiptInvalid")}</Notice>;
  // QT1b "Tính giá SP này" (bước 3 trang SP): chỉ các biến thể đang bán của một SP, kho = kho của SP.
  const product = productId
    ? await prisma.product.findUnique({
        where: { id: productId },
        select: { stockLocationId: true, slug: true, translations: { select: { locale: true, name: true } }, variants: { where: { active: true }, select: { id: true } } },
      })
    : null;
  if (productId && !product?.variants.length) return <Notice tone="danger">{t("productInvalid")}</Notice>;
  const picked = variantIds?.length
    ? await prisma.variant.findMany({ where: { id: { in: variantIds }, active: true, product: { archivedAt: null } }, select: { id: true, product: { select: { stockLocationId: true } } } })
    : [];
  const gapLine = (label: string, skus: string[]) =>
    skus.length > 0 && (
      <p className="text-xs break-words text-muted-foreground">
        {label} ({skus.length}): <span className="font-mono">{skus.slice(0, 40).join(", ")}{skus.length > 40 ? " …" : ""}</span>
      </p>
    );
  return (
    <>
      <Section title={t("newRun")} className="max-w-3xl">
        {receipt && <p className="text-sm">{t("receiptScope", { code: receipt.code })}</p>}
        {picked.length > 0 && (
          <p className="text-sm" data-testid="pricing-picked-scope">
            {t("pickedScope", { count: picked.length })}
          </p>
        )}
        {product && (
          <p className="text-sm" data-testid="pricing-product-scope">
            {t("productScope", { name: productName(product.translations, product.slug) })}
          </p>
        )}
        <PricingRunForm
          key={receiptId ?? productId ?? (picked.length ? picked.map((v) => v.id).join(",") : "all")}
          receiptId={receiptId}
          variantIds={product?.variants.map((v) => v.id) ?? (picked.length ? picked.map((v) => v.id) : undefined)}
          initialLocationId={receipt?.lines[0]?.variant.product.stockLocationId ?? product?.stockLocationId ?? picked[0]?.product.stockLocationId ?? undefined}
          warehouses={options.warehouses}
          rates={rates.map((r) => ({ id: r.id, label: `1 MMK = ${rateDisplay(r).vndPerMmk} VND · ${fmtDate(r.effectiveAt)}` }))}
          categories={options.categories}
          brands={options.brands}
          roundTo={roundTo}
          lastShip={lastShip}
        />
        {/* P24: biến thể bị bỏ qua khi tính giá — theo từng kho. */}
        {gaps.map((g) => (
          <div key={g.location.id} className="space-y-0.5">
            {(g.missingCost.length > 0 || g.missingWeight.length > 0 || g.missingProfit.length > 0) && (
              <p className="text-xs font-medium">{g.location.name}</p>
            )}
            {gapLine(t("noCost"), g.missingCost)}
            {gapLine(t("noWeight"), g.missingWeight)}
            {gapLine(t("noProfit"), g.missingProfit)}
          </div>
        ))}
      </Section>

      <RunList runs={runs} t={t} />
    </>
  );
}


type Translator = Awaited<ReturnType<typeof getTranslations<"Pricing">>>;
function RunList({ runs, t }: { runs: Awaited<ReturnType<typeof listRuns>>; t: Translator }) {
  return (
      <section className="space-y-3 rounded-xl border bg-card p-4">
        <h2 className="font-medium">{t("runs")}</h2>
        <DataTable
          stack
          empty={t("empty")}
          numeric={[4]}
          head={[t("created"), t("warehouse"), t("rate"), t("marginPct"), t("lines"), t("status")]}
        >
          {runs.map((r) => (
            <tr key={r.id}>
              <Td>
                <Link href={`/admin/pricing/runs/${r.id}`} className="whitespace-nowrap text-primary underline">
                  {fmtDateTime(r.createdAt)}
                </Link>
              </Td>
              <Td label={t("warehouse")}>{r.location?.name ?? "—"}</Td>
              <Td label={t("rate")} className="tabular-nums">
                {r.rate ? `1 MMK = ${rateDisplay(r.rate).vndPerMmk} VND` : "—"}
                {r.shipMmkPerKg != null && <div className="text-xs text-muted-foreground">{t("shipShort", { n: fmtInt(r.shipMmkPerKg) })}</div>}
              </Td>
              <Td label={t("marginPct")}>{r.mode === "MANUAL" ? t("modeManual") : r.marginPct != null ? `${r.marginPct.toString()}%` : t("fixedProfit")}</Td>
              <Td label={t("lines")} className="tabular-nums md:text-right">
                {r._count.lines}
              </Td>
              <Td label={t("status")}>
                <Badge tone={RUN_TONE[r.status]}>{t(`st.${r.status}`)}</Badge>
              </Td>
            </tr>
          ))}
        </DataTable>
      </section>
  );
}
