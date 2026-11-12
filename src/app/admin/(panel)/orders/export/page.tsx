import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { vtpOrders } from "@/server/orders/vtp-queries";
import { VTP_ADDRESSES, VTP_OPTIONS, vtpPreview } from "@/server/orders/vtp-data";
import { VtpExportForm } from "@/components/admin/vtp-export-form";
import { EmptyState, Notice, Page, PageHeader } from "@/components/admin/ui";

export default async function ExportOrdersPage({ searchParams }: PageProps<"/admin/orders/export">) {
  await requirePagePermission("orders:ship");
  const { id } = await searchParams;
  const [t, orders] = await Promise.all([getTranslations("VtpExport"), vtpOrders(typeof id === "string" ? [id] : undefined)]);
  return <Page>
    <PageHeader title={t("title")} description={t("description")} back={{ href: "/admin/orders", label: t("back") }} />
    <Notice>{t("senderHint")}</Notice>
    {orders.length ? <VtpExportForm orders={orders.map(vtpPreview)} addresses={VTP_ADDRESSES} services={VTP_OPTIONS.services} pickupTimes={VTP_OPTIONS.pickupTimes} /> : <EmptyState>{t("empty")}</EmptyState>}
  </Page>;
}
