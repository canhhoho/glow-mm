import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { parsePrintIds, pickListFor } from "@/server/orders/print-queries";
import { PickPrintButton } from "@/components/admin/pick-print-button";
import { LinkButton } from "@/components/admin/ui";
import { fmtDate, fmtDateTime, fmtInt } from "@/lib/format";

/**
 * DT + D3-lite: phiếu lấy hàng gộp cho các đơn đã chọn (A4): theo kho bán → SKU → lô FEFO đề xuất, combo bung
 * thành phần; cuối phiếu là danh sách đóng gói theo đơn. "Chốt lô & In" lưu phiếu soạn → bàn giao xuất đúng các lô này.
 */
export default async function PickListPage({ searchParams }: PageProps<"/admin/orders/pick-list">) {
  await requirePagePermission("orders:view");
  const ids = parsePrintIds((await searchParams).ids);
  if (!ids) notFound();
  const [t, tc, { orders, groups, hash, plannable }] = await Promise.all([getTranslations("Orders"), getTranslations("Common"), pickListFor(ids)]);
  if (orders.length === 0) notFound();
  const cell = "border border-foreground/40 px-2 py-1";

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 text-sm print:max-w-none print:p-0">
      <style>{"@page { size: A4; margin: 10mm; }"}</style>
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <PickPrintButton ids={orders.map((o) => o.id)} hash={hash} plannable={plannable} />
        <LinkButton href="/admin/orders" icon="back">{t("title")}</LinkButton>
      </div>
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-2">
        <h1 className="text-lg font-bold">{t("bulk.pickTitle")}</h1>
        <span className="text-xs">
          {t("bulk.pickMeta", { count: orders.length })} · {fmtDateTime(new Date())}
        </span>
      </header>
      <p className="text-xs text-muted-foreground">{t("bulk.pickHelpLots")}</p>

      {groups.map((g) => (
        <section key={g.location.id} className="space-y-1 break-inside-avoid" data-testid="pick-group">
          <h2 className="font-semibold">
            {g.location.name} · {t("bulk.pickTotal", { qty: fmtInt(g.totalQty) })}
          </h2>
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-left text-xs">
                <th className={`${cell} w-8`}>✓</th>
                <th className={cell}>{t("sku")}</th>
                <th className={cell}>{t("bulk.pickItem")}</th>
                <th className={cell}>{t("bulk.pickLot")}</th>
                <th className={`${cell} text-right`}>{t("bulk.pickQty")}</th>
                <th className={cell}>{t("bulk.pickOrders")}</th>
              </tr>
            </thead>
            <tbody>
              {g.lines.flatMap((l) =>
                l.lots.map((lot, i) => (
                  <tr key={`${l.variantId}|${lot.batchId ?? "-"}`} data-testid="pick-line">
                    <td className={cell} />
                    <td className={`${cell} font-mono text-xs`}>{i === 0 ? l.sku : ""}</td>
                    <td className={cell}>{i === 0 ? l.name : ""}</td>
                    <td className={`${cell} text-xs`} data-testid="pick-lot">
                      {lot.lotNo ? (
                        <>
                          <span className="font-mono">{lot.lotNo}</span>
                          {lot.expiryDate && <div>{tc("expiryShort")} {fmtDate(lot.expiryDate)}</div>}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={`${cell} text-right text-base font-bold tabular-nums`}>{lot.qty}</td>
                    <td className={`${cell} font-mono text-xs`}>{lot.orders.map((o) => `${o.code}×${o.qty}`).join(", ")}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </section>
      ))}

      <section className="space-y-1 break-before-page">
        <h2 className="font-semibold">{t("bulk.packTitle")}</h2>
        <table className="w-full border-collapse">
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="break-inside-avoid align-top" data-testid="pack-order">
                <td className={`${cell} w-8`} />
                <td className={`${cell} text-xs whitespace-nowrap`}>
                  <span className="font-mono">{o.code}</span>
                  <div>{t(`status.${o.status}`)}</div>
                  <div className="text-muted-foreground" data-testid="pick-plan">
                    {o.plan === "PLANNED" ? (o.pick && !o.pick.consumedAt ? t("bulk.pickPrintedAt", { time: fmtDateTime(o.pick.printedAt) }) : t("bulk.pickPlan.PLANNED")) : t(`bulk.pickPlan.${o.plan}`)}
                  </div>
                </td>
                <td className={cell}>{o.recipientName}</td>
                <td className={cell}>
                  {o.items.map((i) => (
                    <div key={i.id}>
                      <span className="font-mono text-xs">{i.sku}</span> {i.name} × <b>{i.qty}</b>
                    </div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
