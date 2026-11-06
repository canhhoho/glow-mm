"use client";

import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { fieldClass, fieldLabelClass } from "@/components/admin/ui";
import { saveProductAction } from "@/server/catalog/actions";
import type { ProductEditData } from "@/server/catalog/admin-queries";
import { cn } from "@/lib/utils";
import { suggestProductSlug, suggestVariantSku } from "@/lib/product-identifiers";

type Options = {
  brands: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  tags: { id: string; kind: "SKIN_TYPE" | "CONCERN" | "INGREDIENT"; name: string }[];
  components: { id: string; label: string; stockLocationId: string }[];
  warehouses: { id: string; code: string; name: string; pricingMode: "VN_IMPORT" | "LOCAL_MMK" | null }[];
};

type Variant = ProductEditData["variants"][number] & { key: number };

let seq = 0;
const blankVariant = (label: string): Variant => ({
  key: ++seq,
  id: "",
  sku: "",
  label,
  priceMmk: 0,
  weightGrams: null,
  affiliateCommissionMmk: null,
  lowStockAt: 5,
  leadTimeDays: 21,
  safetyStock: 0,
  active: true,
  isBundle: false,
  components: [],
});

const EMPTY: ProductEditData = {
  id: "",
  slug: "",
  brandId: "",
  categoryId: "",
  stockLocationId: "",
  fixedProfitMmk: null,
  published: false,
  requiresExpiry: true,
  paoMonths: null,
  storageNote: "",
  ingredientsText: "",
  my: { name: "", description: "", usage: "" },
  en: { name: "", description: "", usage: "" },
  tagIds: [],
  variants: [],
};

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn(fieldLabelClass, className)}>
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function ProductForm({ initial, options, copySourceId }: { initial: ProductEditData | null; options: Options; copySourceId?: string }) {
  const t = useTranslations("Products");
  const td = useTranslations("Docs");
  const [state, action, pending] = useActionState(saveProductAction, undefined);
  const [p, setP] = useState<ProductEditData>(initial ?? { ...EMPTY, stockLocationId: options.warehouses[0]?.id ?? "" });
  const initialWarehouse = initial?.id ? initial.stockLocationId : null;
  const [variants, setVariants] = useState<Variant[]>(
    initial?.variants.length ? initial.variants.map((v) => ({ ...v, key: ++seq })) : [blankVariant(t("standardVariant"))],
  );
  const slug = p.slug || suggestProductSlug(p.en.name, p.my.name);

  // Thương hiệu: dùng brandId nếu chọn từ danh sách, brandName nếu gõ tay
  const [brandInput, setBrandInput] = useState(
    initial?.brandId ? options.brands.find((b) => b.id === initial.brandId)?.name ?? "" : "",
  );
  const matchedBrand = options.brands.find((b) => b.name.toLowerCase() === brandInput.trim().toLowerCase());

  // Một biến thể thường: giá/khối lượng nằm ở khối chính. Combo luôn hiện khối biến thể để sửa thành phần.
  const isSingleVariant = variants.length === 1 && !variants[0].isBundle;
  const singleWh = options.warehouses.length <= 1;
  const pricingMode = options.warehouses.find((w) => w.id === p.stockLocationId)?.pricingMode ?? null;
  const showProfit = pricingMode === "LOCAL_MMK";

  const set = <K extends keyof ProductEditData>(k: K, v: ProductEditData[K]) => setP((x) => ({ ...x, [k]: v }));
  const setVar = (key: number, patch: Partial<Variant>) =>
    setVariants((vs) => vs.map((v) => (v.key === key ? { ...v, ...patch } : v)));

  const payload = useMemo(
    () =>
      JSON.stringify({
        // Giữ cả thông tin bổ sung và tag đã lưu dù không còn ô chỉnh sửa trên form.
        ...p,
        slug,
        autoSlug: !p.id && !p.slug,
        id: p.id || undefined,
        copyFromId: copySourceId,
        // Brand: gửi brandId nếu chọn từ danh sách, brandName nếu gõ tay
        brandId: matchedBrand?.id || undefined,
        brandName: !matchedBrand && brandInput.trim() ? brandInput.trim() : undefined,
        // key chỉ dùng cho React; undefined bị JSON.stringify bỏ qua.
        variants: variants.map((v, index) => ({
          ...v,
          sku: v.sku || suggestVariantSku(slug, index),
          autoSku: !v.id && !v.sku,
          key: undefined,
          id: v.id || undefined,
        })),
      }),
    [p, slug, variants, copySourceId, matchedBrand, brandInput],
  );

  // Hoa hồng CTV cố định MMK/cái; trống = theo % của CTV.
  const commissionField = (v: Variant) => (
    <Field label={t("affiliateCommission")}>
      <input
        type="number"
        min={0}
        step={100}
        inputMode="numeric"
        aria-label={t("affiliateCommission")}
        value={v.affiliateCommissionMmk ?? ""}
        onChange={(e) => setVar(v.key, { affiliateCommissionMmk: e.target.value === "" ? null : Number(e.target.value) })}
        className={fieldClass}
      />
      <span className="text-xs text-muted-foreground">{t("affiliateCommissionHint")}</span>
    </Field>
  );

  const textarea = (value: string, onChange: (v: string) => void, rows = 3) => (
    <textarea
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(fieldClass, "h-auto py-2")}
    />
  );

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="payload" value={payload} />

      {/* ── 1. Thông tin chính ── */}
      <section className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
        <h2 className="font-medium sm:col-span-2">{t("general")}</h2>
        <p className="text-xs text-muted-foreground sm:col-span-2">{t("nameHint")}</p>
        <Field label={t("nameMy")}>
          <input
            value={p.my.name}
            onChange={(e) => set("my", { ...p.my, name: e.target.value })}
            maxLength={200}
            className={fieldClass}
          />
        </Field>
        <Field label={t("nameEn")}>
          <input
            value={p.en.name}
            onChange={(e) => set("en", { ...p.en, name: e.target.value })}
            maxLength={200}
            className={fieldClass}
          />
        </Field>
        <Field label={t("brand")}>
          <input
            list="brand-list"
            value={brandInput}
            onChange={(e) => setBrandInput(e.target.value)}
            className={fieldClass}
            required
          />
          <datalist id="brand-list">
            {options.brands.map((b) => (
              <option key={b.id} value={b.name} />
            ))}
          </datalist>
          {brandInput.trim() && !matchedBrand && (
            <span className="text-xs text-muted-foreground">{t("brandNewHint")}</span>
          )}
        </Field>
        <Field label={t("category")}>
          <select required value={p.categoryId} onChange={(e) => set("categoryId", e.target.value)} className={fieldClass}>
            <option value="">—</option>
            {options.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        {/* Giá / Khối lượng — hiện ở đây khi 1 biến thể */}
        {isSingleVariant && (
          <>
            <Field label={t("price")}>
              <input
                required
                type="number"
                min={0}
                step={100}
                value={variants[0].priceMmk}
                onChange={(e) => setVar(variants[0].key, { priceMmk: Number(e.target.value) })}
                className={fieldClass}
              />
            </Field>
            <Field label={t("weight")}>
              <input
                type="number"
                min={0}
                value={variants[0].weightGrams ?? ""}
                onChange={(e) => setVar(variants[0].key, { weightGrams: e.target.value ? Number(e.target.value) : null })}
                className={fieldClass}
              />
            </Field>
            {commissionField(variants[0])}
          </>
        )}
      </section>

      {/* ── 2. Mô tả ── */}
      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="font-medium">{t("descriptions")}</h2>
        <Field label={t("descriptionMy")}>
          {textarea(p.my.description, (v) => set("my", { ...p.my, description: v }))}
        </Field>
        <Field label={t("descriptionEn")}>
          {textarea(p.en.description, (v) => set("en", { ...p.en, description: v }))}
        </Field>
      </section>

      {/* ── 3. Màu / dung tích ── */}
      <section className="space-y-3">
        <h2 className="font-medium">{t("variants")}</h2>
        {!isSingleVariant && (
          <div className="space-y-3">
            {variants.map((v) => (
              <fieldset key={v.key} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-5">
                <Field label={t("label")} className="lg:col-span-2">
                  <input required value={v.label} onChange={(e) => setVar(v.key, { label: e.target.value })} className={fieldClass} />
                </Field>
                <Field label={t("price")}>
                  <input required type="number" min={0} step={100} value={v.priceMmk} onChange={(e) => setVar(v.key, { priceMmk: Number(e.target.value) })} className={fieldClass} />
                </Field>
                <Field label={t("weight")}>
                  <input type="number" min={0} value={v.weightGrams ?? ""} onChange={(e) => setVar(v.key, { weightGrams: e.target.value ? Number(e.target.value) : null })} className={fieldClass} />
                </Field>
                {commissionField(v)}
                <div className="col-span-full flex flex-wrap items-center gap-4 text-sm">
                  {v.id && (
                    <label className="flex items-center gap-1">
                      <input type="checkbox" checked={v.active} onChange={(e) => setVar(v.key, { active: e.target.checked })} />
                      {t("active")}
                    </label>
                  )}
                  {v.isBundle && <span className="rounded bg-muted px-2 py-1 text-xs">{t("isBundle")}</span>}
                  {!v.id && variants.length > 1 && (
                    <Button type="button" size="lg" variant="outline" onClick={() => setVariants((vs) => vs.filter((x) => x.key !== v.key))}>
                      {td("remove")}
                    </Button>
                  )}
                </div>
                {/* Combo components */}
                {v.isBundle && (
                  <div className="col-span-full space-y-2">
                    <p className="text-sm text-muted-foreground">{t("components")}</p>
                    {v.components.map((c, i) => (
                      <div key={i} className="flex gap-2">
                        <select
                          required
                          value={c.componentId}
                          onChange={(e) =>
                            setVar(v.key, {
                              components: v.components.map((x, j) => (j === i ? { ...x, componentId: e.target.value } : x)),
                            })
                          }
                          className={fieldClass}
                        >
                          <option value="">—</option>
                          {options.components
                            .filter((o) => o.id !== v.id && (o.stockLocationId === p.stockLocationId || o.id === c.componentId))
                            .map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.label}
                              </option>
                            ))}
                        </select>
                        <input
                          type="number"
                          min={1}
                          value={c.qty}
                          onChange={(e) =>
                            setVar(v.key, {
                              components: v.components.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) } : x)),
                            })
                          }
                          className={cn(fieldClass, "w-24")}
                        />
                        <Button type="button" size="lg" variant="outline" onClick={() => setVar(v.key, { components: v.components.filter((_, j) => j !== i) })}>
                          {td("remove")}
                        </Button>
                      </div>
                    ))}
                    <Button type="button" size="lg" variant="outline" onClick={() => setVar(v.key, { components: [...v.components, { componentId: "", qty: 1 }] })}>
                      + {t("addComponent")}
                    </Button>
                  </div>
                )}
              </fieldset>
            ))}
          </div>
        )}
        <Button size="lg" type="button" variant="outline" onClick={() => setVariants((vs) => [...vs, blankVariant(t("standardVariant"))])}>
          + {t("addColorSize")}
        </Button>
      </section>

      {/* ── 4. Thiết lập khác ── */}
      <details className="rounded-lg border p-4">
        <summary className="cursor-pointer font-medium">{t("otherSettings")}</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label={t("slug")}>
            <input aria-label={t("slug")} value={slug} onChange={(e) => set("slug", e.target.value)} pattern="[a-z0-9\-]+" maxLength={80} className={fieldClass} />
            {!p.id && !p.slug && <span className="text-xs text-muted-foreground">{t("autoIdentifierHint")}</span>}
          </Field>

          {/* SKU từng biến thể */}
          {variants.map((v, index) => (
            <Field key={v.key} label={variants.length > 1 ? `${t("sku")} (${v.label})` : t("sku")}>
              <input
                aria-label={t("sku")}
                value={v.sku || suggestVariantSku(slug, index)}
                onChange={(e) => setVar(v.key, { sku: e.target.value })}
                maxLength={40}
                className={fieldClass}
              />
              {!v.id && !v.sku && <span className="text-xs text-muted-foreground">{t("autoIdentifierHint")}</span>}
            </Field>
          ))}

          {/* Kho bán — ẩn nếu chỉ có 1 kho */}
          {!singleWh && (
            <Field label={t("warehouse")}>
              <select required value={p.stockLocationId} onChange={(e) => set("stockLocationId", e.target.value)} className={fieldClass}>
                {options.warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.code})
                  </option>
                ))}
              </select>
              {initialWarehouse && p.stockLocationId !== initialWarehouse && <span className="text-xs text-amber-700 dark:text-amber-400">{t("warehouseChangeHint")}</span>}
            </Field>
          )}

          {/* Lãi cố định MMK */}
          {showProfit && (
            <Field label={t("fixedProfitMmk")}>
              <input
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={p.fixedProfitMmk ?? ""}
                onChange={(e) => set("fixedProfitMmk", e.target.value === "" ? null : Number(e.target.value))}
                className={fieldClass}
              />
              <span className="text-xs text-muted-foreground">{t("fixedProfitHint")}</span>
            </Field>
          )}

          {/* Biến thể duy nhất đã lưu: vẫn tắt/bật được (ô này ở khối biến thể khi có nhiều loại). */}
          {isSingleVariant && variants[0].id && (
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={variants[0].active} onChange={(e) => setVar(variants[0].key, { active: e.target.checked })} />
              {t("active")}
            </label>
          )}

          {/* Quản lý hạn sử dụng */}
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={p.requiresExpiry} onChange={(e) => set("requiresExpiry", e.target.checked)} />
            {t("requiresExpiry")}
          </label>
        </div>
      </details>

      {/* ── 5. Hiển thị + Lưu ── */}
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={p.published} onChange={(e) => set("published", e.target.checked)} />
          {t("publishedLabel")}
        </label>
        <Button size="lg" type="submit" disabled={pending}>
          {t("save")}
        </Button>
      </div>

      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {td("error")}: {state.error}
        </p>
      )}
    </form>
  );
}
