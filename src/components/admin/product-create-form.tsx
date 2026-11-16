"use client";

import { useActionState, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Plus, Trash2, X } from "lucide-react";
import { createProductAction } from "@/server/catalog/actions";
import { Button } from "@/components/ui/button";
import { Field, fieldClass } from "@/components/admin/ui";
import { Notice } from "@/components/ui/notice";
import { cn } from "@/lib/utils";

type Options = {
  brands: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  components: { id: string; label: string; stockLocationId: string; inactive?: boolean; archived?: boolean }[];
  warehouses: { id: string; name: string; code: string }[];
};

/** Dữ liệu điền sẵn khi "Sao chép từ sản phẩm cũ" (giá không chép — đặt ở bước 3). */
export type CreatePrefill = {
  copyFromId: string;
  nameMy: string;
  nameEn: string;
  brandName: string;
  categoryId: string;
  stockLocationId: string;
  labels: string[];
  components: { componentId: string; qty: number }[];
};

/**
 * Bước 1 "Tạo sản phẩm": chỉ tên · thương hiệu · danh mục · kho bán (khi có > 1 kho) · phân loại.
 * `kind="combo"`: thay phân loại bằng thành phần combo (cùng kho). Slug/SKU tự sinh ở server.
 */
export function ProductCreateForm({ kind, options, prefill }: { kind: "product" | "combo"; options: Options; prefill?: CreatePrefill }) {
  const t = useTranslations("Products");
  const td = useTranslations("Docs");
  const locale = useLocale();
  const [state, action, pending] = useActionState(createProductAction, undefined);

  // Tên chính theo ngôn ngữ admin (my → tiếng Myanmar, còn lại → tiếng Anh); tên kia tuỳ chọn, chép theo khi để trống.
  const primary = locale === "my" ? "nameMy" : "nameEn";
  const other = primary === "nameMy" ? "nameEn" : "nameMy";
  const [names, setNames] = useState({ nameMy: prefill?.nameMy ?? "", nameEn: prefill?.nameEn ?? "" });
  const [showOther, setShowOther] = useState(!!prefill?.[other]);
  const [brandInput, setBrandInput] = useState(prefill?.brandName ?? "");
  const [categoryId, setCategoryId] = useState(prefill?.categoryId ?? "");
  const [stockLocationId, setStockLocationId] = useState(prefill?.stockLocationId ?? options.warehouses[0]?.id ?? "");
  const [labels, setLabels] = useState<string[]>(prefill?.labels ?? []);
  const [draftLabel, setDraftLabel] = useState("");
  const [components, setComponents] = useState(prefill?.components.length ? prefill.components : [{ componentId: "", qty: 1 }]);

  const matchedBrand = options.brands.find((b) => b.name.toLowerCase() === brandInput.trim().toLowerCase());
  // Lựa chọn mới: cùng kho + đang dùng; thành phần đang được chọn (vd. sao chép từ combo cũ) vẫn hiện, có nhãn (#6).
  const componentOptions = options.components.filter(
    (c) => c.stockLocationId === stockLocationId && ((!c.inactive && !c.archived) || components.some((x) => x.componentId === c.id)),
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
        ...names,
        brandId: matchedBrand?.id,
        brandName: matchedBrand ? undefined : brandInput.trim() || undefined,
        categoryId,
        stockLocationId,
        // Ô phân loại còn chữ chưa nhấn Enter → vẫn tính.
        labels: kind === "product" ? [...labels, ...draftLabel.split(",").map((s) => s.trim()).filter(Boolean)] : [],
        defaultLabel: t("standardVariant"),
        components: kind === "combo" ? components.filter((c) => c.componentId) : [],
        copyFromId: prefill?.copyFromId,
      }),
    [kind, names, matchedBrand, brandInput, categoryId, stockLocationId, labels, draftLabel, components, prefill?.copyFromId, t],
  );

  const langName = (key: "nameMy" | "nameEn") => t(key);

  return (
    <form action={action} className="max-w-2xl space-y-4 rounded-lg border p-4" data-testid="product-create-form">
      <input type="hidden" name="payload" value={payload} />
      <p className="text-sm text-muted-foreground">{t("create.intro")}</p>

      <Field label={t("create.name")}>
        <input
          required={!names[other]}
          value={names[primary]}
          onChange={(e) => setNames((n) => ({ ...n, [primary]: e.target.value }))}
          maxLength={200}
          lang={primary === "nameMy" ? "my" : "en"}
          className={fieldClass}
        />
      </Field>
      {showOther ? (
        <Field label={langName(other)}>
          <input
            value={names[other]}
            onChange={(e) => setNames((n) => ({ ...n, [other]: e.target.value }))}
            maxLength={200}
            lang={other === "nameMy" ? "my" : "en"}
            className={fieldClass}
          />
        </Field>
      ) : (
        <button type="button" onClick={() => setShowOther(true)} className="-mt-2 text-sm text-primary underline">
          {t("create.addOtherName", { lang: langName(other) })}
        </button>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("brand")}>
          <input list="brand-list" value={brandInput} onChange={(e) => setBrandInput(e.target.value)} required maxLength={80} className={fieldClass} />
          <datalist id="brand-list">
            {options.brands.map((b) => (
              <option key={b.id} value={b.name} />
            ))}
          </datalist>
          {brandInput.trim() && !matchedBrand && <span className="text-xs text-muted-foreground">{t("brandNewHint")}</span>}
        </Field>
        <Field label={t("category")}>
          <select required value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={fieldClass}>
            <option value="">—</option>
            {options.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        {options.warehouses.length > 1 && (
          <Field label={t("warehouse")}>
            <select required value={stockLocationId} onChange={(e) => setStockLocationId(e.target.value)} className={fieldClass}>
              {options.warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.code})
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      {kind === "product" ? (
        <Field label={t("create.labels")} hint={t("create.labelsHint")}>
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
              aria-label={t("create.labels")}
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

      {state?.error && <Notice tone="danger">{state.error}</Notice>}
      <Button size="lg" type="submit" disabled={pending}>
        <Plus aria-hidden /> {kind === "combo" ? t("create.submitCombo") : t("create.submit")}
      </Button>
    </form>
  );
}
