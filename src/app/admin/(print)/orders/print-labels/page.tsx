import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { ordersForLabels, parsePrintIds } from "@/server/orders/print-queries";
import { OrderLabel } from "@/components/admin/order-label";
import { PrintButton } from "@/components/admin/print-button";
import { LinkButton } from "@/components/admin/ui";

/** DT: in nhãn A6 cho nhiều đơn đã chọn ở danh sách — mỗi nhãn một trang. `?ids=a,b,c`. */
export default async function PrintLabelsPage({ searchParams }: PageProps<"/admin/orders/print-labels">) {
  await requirePagePermission("orders:view");
  const ids = parsePrintIds((await searchParams).ids);
  if (!ids) notFound();
  const [t, orders] = await Promise.all([getTranslations("Orders"), ordersForLabels(ids)]);
  if (orders.length === 0) notFound();

  return (
    <div className="p-4 print:p-0">
      <style>{"@page { size: A6; margin: 6mm; }"}</style>
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <PrintButton label={t("print")} />
        <LinkButton href="/admin/orders">← {t("title")}</LinkButton>
        <span className="text-sm text-muted-foreground">{t("bulk.labelCount", { count: orders.length })}</span>
      </div>
      <div className="space-y-4 print:space-y-0">
        {orders.map((o) => (
          <OrderLabel key={o.id} order={o} className="break-after-page break-inside-avoid last:break-after-auto" />
        ))}
      </div>
    </div>
  );
}
