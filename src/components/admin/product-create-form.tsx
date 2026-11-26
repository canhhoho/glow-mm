"use client";

import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2, X } from "lucide-react";
import { createProductAction } from "@/server/catalog/actions";
import { Button } from "@/components/ui/button";
import { Field, fieldClass } from "@/components/admin/ui";
import { Notice } from "@/components/ui/notice";
import { cn } from "@/lib/utils";

type Options = {
  brands: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  components: { id: string; label: string; stockLocationId: string | null; inactive?: boolean; archived?: boolean }[];
  warehouses: { id: string; name: string; code: string; pricingMode: string | null }[];
};

/** Dữ liệu điền sẵn khi "Sao chép từ sản phẩm cũ" (giá không chép — đặt ở bước 3). */
export type CreatePrefill = {
  copyFromId: string;
  nameMy: string;
  nameEn: string;
  brandName: string;
  categoryId: string;
  labels: string[];
  components: { componentId: string; qty: number }[];
};

/**
 * Bước 1 "Tạo sản phẩm": tên · thương hiệu · danh mục · phân loại — cùng nhãn với form sửa và file Excel
 * (`ProductFields.*`, `lib/product-fields.ts` `create: true`). Một tên cho mọi ngôn ngữ.
 * 21/11/2026 (audit #4): tuỳ chọn Kho bán + Giá mua + SL dự kiến nhập theo từng phân loại (như file Excel); để trống = làm ở bước 2.
 * `kind="combo"`: thay phân loại bằng thành phần combo (combo lấy kho của thành phần). Slug/SKU tự sinh ở server.
 */
export function ProductCreateForm({ kind, options, prefill }: { kind: "product" | "combo"; options: Options; prefill?: CreatePrefill }) {
  const t = useTranslations("Products");
  const tf = useTranslations("ProductFields");
  const td = useTranslations("Docs");
  const [state, action, pending] = useActionState(createProductAction, undefined);

  // Một tên cho mọi ngôn ngữ (lưu vào tên tiếng Anh, server chép sang tiếng Myanmar).
  const [name, setName] = useState(prefill?.nameEn || prefill?.nameMy || "");
  const [brandInput, setBrandInput] = useState(prefill?.brandName ?? "");
  const [categoryId, setCategoryId] = useState(prefill?.categoryId ?? "");
  const [labels, setLabels] = useState<string[]>(prefill?.labels ?? []);
  const [draftLabel, setDraftLabel] = useState("");
  const [components, setComponents] = useState(prefill?.components.length ? prefill.components : [{ componentId: "", qty: 1 }]);
  const [warehouseId, setWarehouseId] = useState("");
  const [stock, setStock] = useState<Record<string, { purchase: string; planned: string }>>({});
  const warehouse = options.warehouses.find((w) => w.id === warehouseId);
  const currency = warehouse?.pricingMode === "LOCAL_MMK" ? "MMK" : "VND";
  // Ô phân loại còn chữ chưa nhấn Enter → vẫn tính.
  const allLabels = useMemo(() => [...labels, ...draftLabel.split(",").map((s) => s.trim()).filter(Boolean)], [labels, draftLabel]);
  const variantLabels = useMemo(() => (allLabels.length ? allLabels : [t("standardVariant")]), [allLabels, t]);
  const setStockField = (label: string, key: "purchase" | "planned", value: string) =>
    setStock((s) => ({ ...s, [label]: { ...(s[label] ?? { purchase: "", planned: "" }), [key]: value.replace(/\D/g, "") } }));

  const matchedBrand = options.brands.find((b) => b.name.toLowerCase() === brandInput.trim().toLowerCase());
  // Kho bán chọn lúc nhập hàng (16/11/2026): combo lấy kho của thành phần → chỉ SP đã nhập hàng, cùng kho với thành phần
  // đầu tiên; thành phần đang được chọn (vd. sao chép từ combo cũ) vẫn hiện, có nhãn (#6).
  const comboWarehouse = options.components.find((c) => components.some((x) => x.componentId === c.id))?.stockLocationId ?? null;
  const componentOptions = options.components.filter(
    (c) =>
      components.some((x) => x.componentId === c.id) ||
      (c.stockLocationId != null && (!comboWarehouse || c.stockLocationId === comboWarehouse) && !c.inactive && !c.archived),
  );

  const addLabel = (raw: string) => {
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) setLabels((ls) => [...ls, ...parts.filter((p) => !ls.some((l) => l.toLowerCase() === p.toLowerCase()))]);
    setDraftLabel("");
  };

  const payload = useMemo(
    () =>
      JSON.stringify({
        kind,
        nameEn: name,
        nameMy: "",
        brandId: matchedBrand?.id,
        brandName: matchedBrand ? undefined : brandInput.trim() || undefined,
        categoryId,
        labels: kind === "product" ? allLabels : [],
        defaultLabel: t("standardVariant"),
        components: kind === "combo" ? components.filter((c) => c.componentId) : [],
        copyFromId: prefill?.copyFromId,
        ...(kind === "product" && warehouseId && {
          warehouseId,
          stock: variantLabels.map((l) => ({ purchase: stock[l]?.purchase || null, planned: stock[l]?.planned || null })),
        }),
      }),
    [kind, name, matchedBrand, brandInput, categoryId, allLabels, variantLabels, components, prefill?.copyFromId, t, warehouseId, stock],
  );


  return (
    <form action={action} className="max-w-2xl space-y-4 rounded-xl border p-4" data-testid="product-create-form">
      <input type="hidden" name="payload" value={payload} />
      <p className="text-sm text-muted-foreground">{t("create.intro")}</p>

      <Field label={tf("name.label")} hint={tf("name.hint")}>
        <input aria-label={tf("name.label")} required value={name} onChange={(e) => setName(e.target.value)} maxLength={200} className={fieldClass} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={tf("brand.label")}>
          <input list="brand-list" value={brandInput} onChange={(e) => setBrandInput(e.target.value)} required maxLength={80} className={fieldClass} />
          <datalist id="brand-list">
            {options.brands.map((b) => (
              <option key={b.id} value={b.name} />
            ))}
          </datalist>
          {brandInput.trim() && !matchedBrand && <span className="text-xs text-muted-foreground">{t("brandNewHint")}</span>}
        </Field>
        <Field label={tf("category.label")}>
          <select required value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={fieldClass}>
            <option value="">—</option>
            {options.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {kind === "product" ? (
        <Field label={tf("variant_label.label")} hint={t("create.labelsHint")}>
          <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-input px-2 py-1 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
            {labels.map((l) => (
              <span key={l} className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-sm" data-testid="variant-label-chip">
                {l}
                <button type="button" onClick={() => setLabels((ls) => ls.filter((x) => x !== l))} aria-label={t("create.removeLabel", { label: l })} className="text-muted-foreground hover:text-foreground">
                  <X className="size-3.5" aria-hidden />
                </button>
              </span>
            ))}
            <input
              value={draftLabel}
              onChange={(e) => (e.target.value.includes(",") ? addLabel(e.target.value) : setDraftLabel(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addLabel(draftLabel);
                } else if (e.key === "Backspace" && !draftLabel && labels.length) {
                  setLabels((ls) => ls.slice(0, -1));
                }
              }}
              onBlur={() => draftLabel.trim() && addLabel(draftLabel)}
              placeholder={labels.length ? "" : t("create.labelsPlaceholder")}
              aria-label={tf("variant_label.label")}
              maxLength={60}
              className="h-7 min-w-32 flex-1 bg-transparent text-sm outline-none"
            />
          </div>
        </Field>
      ) : (
        <fieldset className="space-y-2">
          <legend className="text-sm text-muted-foreground">{t("create.components")}</legend>
          <p className="text-xs text-muted-foreground">{t("create.componentsHint")}</p>
          {components.map((c, i) => (
            <div key={i} className="flex gap-2">
              <select
                required
                value={c.componentId}
                onChange={(e) => setComponents((cs) => cs.map((x, j) => (j === i ? { ...x, componentId: e.target.value } : x)))}
                aria-label={`${t("create.components")} ${i + 1}`}
                className={cn(fieldClass, "min-w-0 flex-1")}
              >
                <option value="">—</option>
                {componentOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                    {o.archived ? ` (${td("variantArchived")})` : o.inactive ? ` (${td("variantInactive")})` : ""}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                max={1000}
                value={c.qty}
                onChange={(e) => setComponents((cs) => cs.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) } : x)))}
                aria-label={`${t("create.qty")} ${i + 1}`}
                className={cn(fieldClass, "w-24")}
              />
              {components.length > 1 && (
                <Button type="button" size="icon-lg" variant="outline" onClick={() => setComponents((cs) => cs.filter((_, j) => j !== i))} title={td("remove")} aria-label={td("remove")}>
                  <Trash2 aria-hidden />
                </Button>
              )}
            </div>
          ))}
          <Button type="button" size="lg" variant="outline" onClick={() => setComponents((cs) => [...cs, { componentId: "", qty: 1 }])}>
            <Plus aria-hidden /> {t("addComponent")}
          </Button>
        </fieldset>
      )}

      {kind === "product" && (
        <fieldset className="space-y-3 rounded-lg border p-3" data-testid="create-stock">
          <legend className="px-1 text-sm font-medium">{t("create.stockTitle")}</legend>
          <p className="text-xs text-muted-foreground">{t("create.stockHint")}</p>
          <Field label={tf("warehouse_code.label")}>
            <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className={fieldClass}>
              <option value="">{t("create.noWarehouse")}</option>
              {options.warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.code})
                </option>
              ))}
            </select>
          </Field>
          {warehouse && (
            <div className="space-y-2">
              <div className="grid grid-cols-[minmax(0,1fr)_8rem_7rem] gap-2 text-xs text-muted-foreground">
                <span>{t("create.variantCol")}</span>
                <span className="text-right">{tf("unit_cost.label")} ({currency})</span>
                <span className="text-right">{tf("qty.label")}</span>
              </div>
              {variantLabels.map((l) => (
                <div key={l} className="grid grid-cols-[minmax(0,1fr)_8rem_7rem] items-center gap-2">
                  <span className="truncate text-sm">{l}</span>
                  <input
                    inputMode="numeric"
                    value={stock[l]?.purchase ?? ""}
                    onChange={(e) => setStockField(l, "purchase", e.target.value)}
                    aria-label={`${tf("unit_cost.label")} (${currency}) ${l}`}
                    className={cn(fieldClass, "text-right tabular-nums")}
                  />
                  <input
                    inputMode="numeric"
                    value={stock[l]?.planned ?? ""}
                    onChange={(e) => setStockField(l, "planned", e.target.value)}
                    aria-label={`${tf("qty.label")} ${l}`}
                    className={cn(fieldClass, "text-right tabular-nums")}
                  />
                </div>
              ))}
            </div>
          )}
        </fieldset>
      )}

      {state?.error && <Notice tone="danger">{state.error}</Notice>}
      <Button size="lg" type="submit" disabled={pending}>
        <Plus aria-hidden /> {kind === "combo" ? t("create.submitCombo") : t("create.submit")}
      </Button>
    </form>
  );
}
