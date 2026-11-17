"use client";

import { useTranslations } from "next-intl";
import { fieldClass } from "@/components/admin/ui";

export function WarehousePriceSelect({ warehouses, value }: { warehouses: { id: string; name: string }[]; value: string }) {
  const t = useTranslations("SellingPrices");
  return (
    <select name="warehouse" defaultValue={value} aria-label={t("warehouse")} className={fieldClass} onChange={(event) => event.currentTarget.form?.requestSubmit()}>
      <option value="">{t("allWarehouses")}</option>
      {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
    </select>
  );
}
