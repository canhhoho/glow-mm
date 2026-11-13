import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { getOrderAdmin } from "@/server/orders/admin-queries";
import { OrderLabel } from "@/components/admin/order-label";
import { PrintButton } from "@/components/admin/print-button";
import { LinkButton } from "@/components/admin/ui";

/** Nhãn ship khổ A6 (in từ trình duyệt). Nằm ngoài layout panel để bản in không có menu. */
export default async function OrderLabelPage({ params }: PageProps<"/admin/orders/[id]/label">) {
  await requirePagePermission("orders:view");
  const { id } = await params;
  const [t, order] = await Promise.all([getTranslations("Orders"), getOrderAdmin(id)]);
  if (!order) notFound();

  return (
    <div className="p-4 print:p-0">
      <style>{"@page { size: A6; margin: 6mm; }"}</style>
      <div className="mb-4 flex gap-2 print:hidden">
        <PrintButton label={t("print")} />
        <LinkButton href={`/admin/orders/${order.id}`} icon="back">{order.code}</LinkButton>
      </div>
      <OrderLabel order={order} />
    </div>
  );
}
