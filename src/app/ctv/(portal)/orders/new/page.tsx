import { getLocale, getTranslations } from "next-intl/server";
import { requireAffiliate } from "@/server/auth/session";
import { createAffiliateOrderAction } from "@/server/affiliates/portal-actions";
import { orderFormOptions } from "@/server/orders/admin-queries";
import { OrderForm } from "@/components/admin/order-form";

/**
 * CTV tự lên đơn cho khách. Không có tra cứu khách theo SĐT (tránh lộ thông tin khách của người khác);
 * form chỉ hiện giá bán + số còn bán được.
 */
export default async function CtvNewOrderPage() {
  await requireAffiliate();
  const [t, options] = await Promise.all([getTranslations("Ctv"), getLocale().then(orderFormOptions)]);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{t("newTitle")}</h1>
      <p className="text-sm text-muted-foreground">{t("newHint")}</p>
      <div className="rounded-2xl border bg-card p-4">
        <OrderForm
          options={options}
          initial={{ phone: "", phone2: "", name: "", townshipId: "", addressLine: "" }}
          action={createAffiliateOrderAction}
        />
      </div>
    </div>
  );
}
