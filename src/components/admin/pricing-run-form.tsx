"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ActionForm } from "@/components/admin/action-form";
import { fieldClass } from "@/components/admin/ui";
import { previewRunAction } from "@/server/pricing/actions";

type Option = { id: string; name: string };

/** Form tạo bản xem trước giá (P24): chọn kho → ô nhập theo cách tính giá của kho. */
export function PricingRunForm({
  warehouses,
  rates,
  categories,
  brands,
  roundTo,
  lastShip,
  receiptId,
  initialLocationId,
}: {
  warehouses: (Option & { pricingMode: "VN_IMPORT" | "LOCAL_MMK" })[];
  rates: { id: string; label: string }[];
  categories: Option[];
  brands: Option[];
  roundTo: number;
  lastShip: number | null;
  receiptId?: string;
  initialLocationId?: string;
}) {
  const t = useTranslations("Pricing");
  const [locationId, setLocationId] = useState(warehouses.some(w=>w.id === initialLocationId) ? initialLocationId! : warehouses[0]?.id ?? "");
  const mode = warehouses.find((w) => w.id === locationId)?.pricingMode ?? "VN_IMPORT";
  const vn = mode === "VN_IMPORT";
  const label = "grid content-start gap-1 text-sm";

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{vn ? t("formulaVn") : t("formulaMmk")}</p>
      {vn && <p className="text-xs text-muted-foreground">{t("costBasisHelp")}</p>}
      {vn && rates.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noRate")}</p>
      ) : (
        <ActionForm action={previewRunAction} submitLabel={t("preview")} className="grid gap-3 sm:grid-cols-2">
          {receiptId && <input type="hidden" name="receiptId" value={receiptId} />}
          <label className={label}>
            <span className="text-muted-foreground">{t("warehouse")}</span>
            <select name="locationId" aria-label={t("warehouse")} value={locationId} onChange={(e) => setLocationId(e.target.value)} className={fieldClass}>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          {vn && (
            <>
              <label className={label}>
                <span className="text-muted-foreground">{t("rate")}</span>
                <select name="rateId" defaultValue={rates[0]?.id} className={fieldClass}>
                  {rates.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={label}>
                <span className="text-muted-foreground">{t("marginPct")}</span>
                <input name="marginPct" required inputMode="decimal" placeholder="40" className={fieldClass} />
              </label>
              <label className={label}>
                <span className="text-muted-foreground">{t("shipMmkPerKg")}</span>
                <input name="shipMmkPerKg" required type="number" min={0} step={1} inputMode="numeric" defaultValue={lastShip ?? ""} className={fieldClass} />
              </label>
            </>
          )}
          <label className={label}>
            <span className="text-muted-foreground">{t("roundTo")}</span>
            <input name="roundTo" type="number" min={1} defaultValue={roundTo} className={fieldClass} />
          </label>
          <label className={label}>
            <span className="text-muted-foreground">{t("category")}</span>
            <select name="categoryId" defaultValue="" className={fieldClass}>
              <option value="">{t("all")}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            <span className="text-muted-foreground">{t("brand")}</span>
            <select name="brandId" defaultValue="" className={fieldClass}>
              <option value="">{t("all")}</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        </ActionForm>
      )}
    </div>
  );
}
