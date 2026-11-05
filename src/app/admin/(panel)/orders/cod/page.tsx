import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { outstandingCod } from "@/server/orders/cod";
import { codAgeBuckets, codAgeDays } from "@/server/orders/cod-aging";
import { Page, PageHeader, DataTable, Td, Stat } from "@/components/admin/ui";
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
    <PageHeader title={t("title")} back={{ href: "/admin/orders", label: t("back") }} />
    <p className="text-sm text-muted-foreground">{t("help")}</p>
    <p className="font-medium">{t("outstanding", { count: regular.length, amount: fmtInt(regular.reduce((s, o) => s + o.totalMmk, 0)) })}</p>
    <p className="text-sm text-muted-foreground">{t("exceptionTotal", { count: orders.length - regular.length, amount: fmtInt(orders.filter((o) => !isRegular(o)).reduce((s, o) => s + o.totalMmk, 0)) })}</p>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{codAgeBuckets(orders, now).map((b) => <Stat key={b.label} label={t("ageBucket", { days: b.label, count: b.orders })} value={`${fmtInt(b.mmk)} MMK`} />)}</div>
    <nav aria-label={t("filterLabel")} className="flex gap-3 text-sm">{(["all", "waiting", "exception"] as const).map((key) => <Link key={key} href={`/admin/orders/cod?filter=${key}`} aria-current={filter === key ? "page" : undefined} className={filter === key ? "font-semibold text-primary underline" : "text-muted-foreground"}>{t(key)}</Link>)}</nav>
    <DataTable head={[t("order"), t("carrier"), t("collectedAt"), t("age"), t("gross"), t("status")]} empty={t("empty")} numeric={[3, 4]}>
      {visible.map((o) => <tr key={o.id}><Td><Link href={`/admin/orders/${o.id}`} className="font-mono text-primary underline">{o.code}</Link></Td><Td>{o.deliveries[0]?.carrier ?? "—"} · {o.deliveries[0]?.trackingNo ?? "—"}</Td><Td>{fmtDateTime(o.codCollectedAt)}</Td><Td>{codAgeDays(o.codCollectedAt!, now)}</Td><Td>{fmtInt(o.totalMmk)} MMK</Td><Td>{isRegular(o) ? t("waiting") : t("exception")}</Td></tr>)}
    </DataTable>
  </Page>;
}
