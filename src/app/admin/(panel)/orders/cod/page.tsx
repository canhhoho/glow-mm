import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { outstandingCod } from "@/server/orders/cod";
import { codAgeBuckets, codAgeDays } from "@/server/orders/cod-aging";
import { Badge, Page, PageHeader, DataTable, TabNav, Td, Stat } from "@/components/admin/ui";
import { fmtDateTime, fmtInt } from "@/lib/format";

export default async function CodPage({ searchParams }: PageProps<"/admin/orders/cod">) {
  await requirePagePermission("orders:reconcile-cod");
  const [t, orders, sp] = await Promise.all([getTranslations("Cod"), outstandingCod(), searchParams]);
  const isRegular = (o: typeof orders[number]) => o.status === "COMPLETED" && o.paymentStatus === "PAID" && !o.items.some((i) => i.returnedQty > 0);
  const regular = orders.filter(isRegular);
  const filter = sp.filter === "waiting" || sp.filter === "exception" ? sp.filter : "all";
  const visible = orders.filter((o) => filter === "all" || (filter === "waiting" ? isRegular(o) : !isRegular(o)));
  const now = new Date();
  return <Page>
    <PageHeader title={t("title")} description={t("help")} />
    <div className="space-y-1">
    <p className="font-medium">{t("outstanding", { count: regular.length, amount: fmtInt(regular.reduce((s, o) => s + o.totalMmk, 0)) })}</p>
    <p className="text-sm text-muted-foreground">{t("exceptionTotal", { count: orders.length - regular.length, amount: fmtInt(orders.filter((o) => !isRegular(o)).reduce((s, o) => s + o.totalMmk, 0)) })}</p>
    </div>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{codAgeBuckets(orders, now).map((b) => <Stat key={b.label} label={t("ageBucket", { days: b.label, count: b.orders })} value={`${fmtInt(b.mmk)} MMK`} />)}</div>
    <TabNav label={t("filterLabel")} tabs={(["all", "waiting", "exception"] as const).map((key) => ({ href: `/admin/orders/cod?filter=${key}`, label: t(key), active: filter === key }))} />
    <DataTable head={[t("order"), t("carrier"), t("collectedAt"), t("age"), t("gross"), t("status")]} empty={t("empty")} numeric={[3, 4]}>
      {visible.map((o) => (
        <tr key={o.id}>
          <Td><Link href={`/admin/orders/${o.id}`} className="font-mono text-primary underline">{o.code}</Link></Td>
          <Td label={t("carrier")}>{o.deliveries[0]?.carrier ?? "—"} · <span className="font-mono text-xs">{o.deliveries[0]?.trackingNo ?? "—"}</span></Td>
          <Td label={t("collectedAt")} className="whitespace-nowrap">{fmtDateTime(o.codCollectedAt)}</Td>
          <Td label={t("age")} numeric>{codAgeDays(o.codCollectedAt!, now)}</Td>
          <Td label={t("gross")} numeric className="whitespace-nowrap">{fmtInt(o.totalMmk)} MMK</Td>
          <Td label={t("status")}>{isRegular(o) ? <Badge tone="warning">{t("waiting")}</Badge> : <Badge tone="danger">{t("exception")}</Badge>}</Td>
        </tr>
      ))}
    </DataTable>
  </Page>;
}
