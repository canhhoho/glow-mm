import { getLocale, getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { can } from "@/server/auth/roles";
import { affiliateOptions } from "@/server/affiliates/affiliates";
import { findCustomerByPhone, orderFormOptions } from "@/server/orders/admin-queries";
import { OrderForm, type OrderFormInitial } from "@/components/admin/order-form";
import { fieldClass, fieldLabelClass, FilterBar, FilterButton, Page, PageHeader } from "@/components/admin/ui";
import { cn } from "@/lib/utils";

export default async function NewOrderPage({ searchParams }: PageProps<"/admin/orders/new">) {
  const user = await requirePagePermission("orders:create");
  const { phone } = await searchParams;
  const lookup = typeof phone === "string" && phone.trim() ? phone.trim() : undefined;
  const [t, options, customer, affiliates] = await Promise.all([
    getTranslations("Orders"),
    orderFormOptions(await getLocale()),
    lookup ? findCustomerByPhone(lookup) : null,
    can(user.role, "orders:assign-affiliate") ? affiliateOptions() : undefined,
  ]);
  const address = customer?.addresses[0];
  const initial: OrderFormInitial = {
    phone: customer?.phone ?? lookup ?? "",
    phone2: "",
    name: customer?.name ?? "",
    townshipId: address?.townshipId ?? "",
    addressLine: address?.line ?? "",
  };

  return (
    <Page>
      <PageHeader title={t("new")} back={{ href: "/admin/orders", label: t("back") }} />
      <FilterBar>
        <label className={fieldLabelClass}>
          <span className="text-muted-foreground">{t("lookupPhone")}</span>
          <input name="phone" type="tel" inputMode="tel" defaultValue={lookup} className={cn(fieldClass, "w-56")} />
        </label>
        <FilterButton>{t("lookup")}</FilterButton>
        {lookup && (
          <p className="pb-2 text-sm text-muted-foreground" data-testid="customer-lookup">
            {customer ? t("customerFound", { name: customer.name, count: customer._count.orders }) : t("customerNew")}
          </p>
        )}
      </FilterBar>
      <OrderForm key={lookup ?? ""} options={options} initial={initial} affiliates={affiliates} />
    </Page>
  );
}
