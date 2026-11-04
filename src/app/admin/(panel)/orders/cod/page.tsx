import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { outstandingCod } from "@/server/orders/cod";
import { Page, PageHeader, DataTable, Td } from "@/components/admin/ui";
import { fmtDateTime, fmtInt } from "@/lib/format";

export default async function CodPage() {
  await requirePagePermission("orders:reconcile-cod");
  const [t, orders] = await Promise.all([getTranslations("Cod"), outstandingCod()]);
  const regular = orders.filter((o) => o.status === "COMPLETED" && o.paymentStatus === "PAID" && !o.items.some((i) => i.returnedQty > 0));
  return <Page>
    <PageHeader title={t("title")} back={{ href: "/admin/orders", label: t("back") }} />
    <p className="text-sm text-muted-foreground">{t("help")}</p>
    <p className="font-medium">{t("outstanding", { count: regular.length, amount: fmtInt(regular.reduce((s, o) => s + o.totalMmk, 0)) })}</p>
    <DataTable head={[t("order"), t("carrier"), t("collectedAt"), t("gross"), t("status")]} empty={t("empty")} numeric={[3]}>
      {orders.map((o) => <tr key={o.id}><Td><Link href={`/admin/orders/${o.id}`} className="font-mono text-primary underline">{o.code}</Link></Td><Td>{o.deliveries[0]?.carrier ?? "—"} · {o.deliveries[0]?.trackingNo ?? "—"}</Td><Td>{fmtDateTime(o.codCollectedAt)}</Td><Td>{fmtInt(o.totalMmk)} MMK</Td><Td>{regular.some((r) => r.id === o.id) ? t("waiting") : t("exception")}</Td></tr>)}
    </DataTable>
  </Page>;
}
