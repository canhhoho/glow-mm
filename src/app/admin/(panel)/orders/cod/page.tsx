import Link from "next/link";
import { ArrowUpRight, CircleCheck, Clock3, Info } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { outstandingCod } from "@/server/orders/cod";
import { codAgeBuckets, codAgeDays, isRegularCod, summarizeCod } from "@/server/orders/cod-aging";
import { Badge, Page, PageHeader, DataTable, TabNav, Td, Stat, focusRing } from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import { fmtDateTime, fmtInt } from "@/lib/format";

export default async function CodPage({ searchParams }: PageProps<"/admin/orders/cod">) {
  await requirePagePermission("orders:reconcile-cod");
  const [t, orders, sp] = await Promise.all([getTranslations("Cod"), outstandingCod(), searchParams]);
  const summary = summarizeCod(orders);
  const counts = { all: summary.total.count, waiting: summary.regular.count, exception: summary.exception.count };
  const filter = sp.filter === "waiting" || sp.filter === "exception" ? sp.filter : "all";
  const visible = orders.filter((o) => filter === "all" || (filter === "waiting" ? isRegularCod(o) : !isRegularCod(o)));
  const now = new Date();
  const buckets = codAgeBuckets(orders, now);
  const labels = { all: t("all"), waiting: t("waitingShort"), exception: t("exceptionShort") };
  const columns = {
    order: t("order"),
    carrier: t("carrier"),
    collected: t("collectedShort"),
    age: t("age"),
    gross: t("gross"),
    status: t("statusShort"),
  };

  return (
    <Page className="min-w-0 space-y-3">
      <PageHeader title={t("title")} />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label={t("ordersPending")} value={fmtInt(counts.all)} href="/admin/orders/cod" hint={t("ordersCount", { count: counts.waiting }) + " · " + labels.waiting} />
        <Stat label={t("waitingAmount")} value={<CodAmount amount={summary.regular.mmk} />} href="/admin/orders/cod?filter=waiting" tone={counts.waiting > 0 ? "warning" : "neutral"} hint={t("beforeFees")} />
        <div className="col-span-2 sm:col-span-1 [&>a]:h-full">
          <Stat
            label={labels.exception}
            value={fmtInt(counts.exception)}
            href="/admin/orders/cod?filter=exception"
            tone={counts.exception > 0 ? "danger" : "neutral"}
            hint={t("exceptionGross", { amount: fmtInt(summary.exception.mmk) })}
          />
        </div>
      </div>

      <section aria-labelledby="cod-aging" className="rounded-xl border bg-card p-3">
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 id="cod-aging" className="flex items-center gap-1.5 text-sm font-semibold"><Clock3 aria-hidden className="size-4 text-muted-foreground" />{t("agingTitle")}</h2>
          <p className="text-xs text-muted-foreground">{t("agingScope")}</p>
        </div>
        <ul className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {buckets.map((bucket) => (
            <li key={bucket.label} className={cn(
              "min-w-0 rounded-lg border-l-2 bg-muted/40 px-3 py-2.5",
              bucket.label === ">30" ? "border-destructive bg-danger-subtle" : bucket.label === "15-30" ? "border-warning bg-warning-subtle" : "border-border",
            )}>
              <div className="flex flex-wrap items-center justify-between gap-1">
                <Badge tone={bucketTone(bucket.label)}>{t("daysBand", { days: bucket.label.replace("-", "–") })}</Badge>
                <span className="text-xs text-muted-foreground tabular-nums">{t("ordersCount", { count: bucket.orders })}</span>
              </div>
              <div className="mt-2 text-base leading-tight font-semibold"><CodAmount amount={bucket.mmk} /></div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="cod-queue" className="min-w-0 rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-3 pb-1">
          <h2 id="cod-queue" className="text-sm font-semibold">{t("queueTitle")}</h2>
          <span className="text-xs text-muted-foreground tabular-nums">{labels[filter]} · {t("ordersCount", { count: visible.length })}</span>
        </div>
        <div className="px-4">
          <TabNav label={t("filterLabel")} tabs={(["all", "waiting", "exception"] as const).map((key) => ({
            href: `/admin/orders/cod?filter=${key}`,
            label: labels[key],
            count: fmtInt(counts[key]),
            active: filter === key,
            tone: key === "exception" && counts.exception > 0 ? "danger" : undefined,
          }))} />
        </div>
        <div className="flex items-start gap-2 border-b bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <p>{t("queueHint")}</p>
        </div>
        {visible.length > 0 ? (
          <DataTable
            head={[...Object.values(columns), <span key="action" className="sr-only">{t("review")}</span>]}
            numeric={[3, 4]}
            stack
            dense
            middle
            className="rounded-none border-0 last:rounded-b-xl"
            cols={["md:w-[16%]", "md:w-[19%]", "md:w-[18%]", "md:w-[10%]", "md:w-[17%]", "md:w-[14%]", "md:w-[6%]"]}
            tableClassName="md:table-fixed md:min-w-[860px] max-md:[&_td[data-label]>div]:text-right"
          >
            {visible.map((order) => {
              const delivery = order.deliveries[0];
              const age = codAgeDays(order.codCollectedAt!, now);
              const regular = isRegularCod(order);
              return (
                <tr key={order.id}>
                  <Td>
                    <Link href={`/admin/orders/${order.id}`} className="inline-flex items-center gap-1 font-mono font-semibold break-all text-primary hover:underline">
                      {order.code}<ArrowUpRight aria-hidden className="size-3 shrink-0" />
                    </Link>
                  </Td>
                  <Td label={columns.carrier} className="break-words">
                    <span className="block">{delivery?.carrier ?? "—"}</span>
                    {delivery?.trackingNo && <span className="block font-mono text-muted-foreground">{delivery.trackingNo}</span>}
                  </Td>
                  <Td label={columns.collected} className="text-muted-foreground tabular-nums">{fmtDateTime(order.codCollectedAt)}</Td>
                  <Td label={columns.age} numeric>
                    <Badge tone={age > 30 ? "danger" : age > 14 ? "warning" : "neutral"}>{t("daysBand", { days: fmtInt(age) })}</Badge>
                  </Td>
                  <Td label={columns.gross} numeric className="font-semibold md:whitespace-nowrap">{fmtInt(order.totalMmk)}</Td>
                  <Td label={columns.status}>
                    <span title={t(regular ? "waiting" : "exception")} className="[&>span]:whitespace-normal">
                      <Badge tone={regular ? "warning" : "danger"}>{labels[regular ? "waiting" : "exception"]}</Badge>
                    </span>
                  </Td>
                  <Td className="text-right">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      aria-label={t("reviewOrder", { code: order.code })}
                      title={t("review")}
                      className={cn("inline-flex min-h-8 items-center justify-center gap-1 rounded-md border px-2 text-primary hover:bg-primary/5 md:size-8 md:p-0", focusRing)}
                    >
                      <span className="md:sr-only">{t("review")}</span><ArrowUpRight aria-hidden className="size-3.5" />
                    </Link>
                  </Td>
                </tr>
              );
            })}
          </DataTable>
        ) : (
          <div className="grid justify-items-center gap-2 px-4 py-8 text-center text-sm">
            <span className={cn("rounded-xl p-2.5", orders.length === 0 ? "bg-success-muted text-success-foreground" : "bg-muted text-muted-foreground")}>
              {orders.length === 0 ? <CircleCheck aria-hidden className="size-5" /> : <Info aria-hidden className="size-5" />}
            </span>
            <p className="font-medium">{t(orders.length === 0 ? "empty" : "emptyFilter")}</p>
            <p className="max-w-md text-xs leading-relaxed text-muted-foreground">{t(orders.length === 0 ? "emptyHelp" : "emptyFilterHelp")}</p>
            {orders.length > 0 && (
              <Link href="/admin/orders/cod" className="font-medium text-primary underline">{t("showAll")}</Link>
            )}
          </div>
        )}
      </section>
      <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-muted-foreground"><Info aria-hidden className="mt-0.5 size-3.5 shrink-0" /><span>{t("help")}</span></p>
    </Page>
  );
}

function CodAmount({ amount }: { amount: number }) {
  return <span className="break-words tabular-nums">{fmtInt(amount)} <span className="text-xs font-medium text-muted-foreground">MMK</span></span>;
}

function bucketTone(label: string) {
  if (label === ">30") return "danger";
  if (label === "15-30") return "warning";
  return "neutral";
}
