"use client";

import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/admin/ui";
import { saveProductAction } from "@/server/catalog/actions";
import type { ProductEditData } from "@/server/catalog/admin-queries";
import { cn } from "@/lib/utils";

type Options = {
  brands: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  tags: { id: string; kind: "SKIN_TYPE" | "CONCERN" | "INGREDIENT"; name: string }[];
  components: { id: string; label: string }[];
};

type Variant = ProductEditData["variants"][number] & { key: number };

let seq = 0;
const blankVariant = (): Variant => ({
  key: ++seq,
  id: "",
  sku: "",
  label: "",
  priceMmk: 0,
  weightGrams: null,
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
  published: false,
  storageNote: "",
  ingredientsText: "",
  my: { name: "", description: "", usage: "" },
  en: { name: "", description: "", usage: "" },
  tagIds: [],
  variants: [],
};

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`space-y-1 text-sm ${className ?? ""}`}>
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function ProductForm({ initial, options }: { initial: ProductEditData | null; options: Options }) {
  const t = useTranslations("Products");
  const td = useTranslations("Docs");
  const [state, action, pending] = useActionState(saveProductAction, undefined);
  const [p, setP] = useState<ProductEditData>(initial ?? EMPTY);
  const [variants, setVariants] = useState<Variant[]>(
    initial?.variants.length ? initial.variants.map((v) => ({ ...v, key: ++seq })) : [blankVariant()],
  );

  const set = <K extends keyof ProductEditData>(k: K, v: ProductEditData[K]) => setP((x) => ({ ...x, [k]: v }));
  const setVar = (key: number, patch: Partial<Variant>) =>
    setVariants((vs) => vs.map((v) => (v.key === key ? { ...v, ...patch } : v)));

  const payload = useMemo(
    () =>
      JSON.stringify({
        ...p,
        id: p.id || undefined,
        // key chỉ dùng cho React; undefined bị JSON.stringify bỏ qua.
        variants: variants.map((v) => ({ ...v, key: undefined, id: v.id || undefined })),
      }),
    [p, variants],
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

      <section className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
        <h2 className="font-medium sm:col-span-2">{t("general")}</h2>
        <Field label={t("slug")}>
          <input required value={p.slug} onChange={(e) => set("slug", e.target.value)} pattern="[a-z0-9\-]+" className={fieldClass} />
        </Field>
        <Field label={t("brand")}>
          <select required value={p.brandId} onChange={(e) => set("brandId", e.target.value)} className={fieldClass}>
            <option value="">—</option>
            {options.brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
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
        <label className="flex items-center gap-2 self-end text-sm">
          <input type="checkbox" checked={p.published} onChange={(e) => set("published", e.target.checked)} />
          {t("publishedLabel")}
        </label>
        <Field label={t("storageNote")}>
          <input value={p.storageNote} onChange={(e) => set("storageNote", e.target.value)} className={fieldClass} />
        </Field>
        <Field label={t("ingredients")}>{textarea(p.ingredientsText, (v) => set("ingredientsText", v), 2)}</Field>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {(["my", "en"] as const).map((loc) => (
          <section key={loc} className="space-y-3 rounded-lg border p-4" lang={loc}>
            <h2 className="font-medium">{loc === "my" ? t("contentMy") : t("contentEn")}</h2>
            <Field label={t("name")}>
              <input
                required
                value={p[loc].name}
                onChange={(e) => set(loc, { ...p[loc], name: e.target.value })}
                className={fieldClass}
              />
            </Field>
            <Field label={t("description")}>
              {textarea(p[loc].description, (v) => set(loc, { ...p[loc], description: v }))}
            </Field>
            <Field label={t("usage")}>{textarea(p[loc].usage, (v) => set(loc, { ...p[loc], usage: v }), 2)}</Field>
          </section>
        ))}
      </div>

      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="font-medium">{t("tags")}</h2>
        {(["SKIN_TYPE", "CONCERN", "INGREDIENT"] as const).map((kind) => (
          <div key={kind} className="flex flex-wrap items-center gap-3 text-sm">
            <span className="w-40 text-muted-foreground">{t(kind)}</span>
            {options.tags
              .filter((x) => x.kind === kind)
              .map((tag) => (
                <label key={tag.id} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={p.tagIds.includes(tag.id)}
                    onChange={(e) =>
                      set("tagIds", e.target.checked ? [...p.tagIds, tag.id] : p.tagIds.filter((x) => x !== tag.id))
                    }
                  />
                  {tag.name}
                </label>
              ))}
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">{t("variants")}</h2>
        {variants.map((v) => (
          <fieldset key={v.key} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-4 lg:grid-cols-8">
            <Field label={t("sku")}>
              <input required value={v.sku} onChange={(e) => setVar(v.key, { sku: e.target.value })} className={fieldClass} />
            </Field>
            <Field label={t("label")} className="lg:col-span-2">
              <input required value={v.label} onChange={(e) => setVar(v.key, { label: e.target.value })} className={fieldClass} />
            </Field>
            <Field label={t("price")}>
              <input required type="number" min={0} step={100} value={v.priceMmk} onChange={(e) => setVar(v.key, { priceMmk: Number(e.target.value) })} className={fieldClass} />
            </Field>
            <Field label={t("weight")}>
              <input type="number" min={0} value={v.weightGrams ?? ""} onChange={(e) => setVar(v.key, { weightGrams: e.target.value ? Number(e.target.value) : null })} className={fieldClass} />
            </Field>
            <Field label={t("lowStock")}>
              <input type="number" min={0} value={v.lowStockAt} onChange={(e) => setVar(v.key, { lowStockAt: Number(e.target.value) })} className={fieldClass} />
            </Field>
            <Field label={t("leadTime")}>
              <input type="number" min={0} value={v.leadTimeDays} onChange={(e) => setVar(v.key, { leadTimeDays: Number(e.target.value) })} className={fieldClass} />
            </Field>
            <Field label={t("safety")}>
              <input type="number" min={0} value={v.safetyStock} onChange={(e) => setVar(v.key, { safetyStock: Number(e.target.value) })} className={fieldClass} />
            </Field>
            <div className="flex flex-wrap items-center gap-4 text-sm sm:col-span-4 lg:col-span-8">
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={v.active} onChange={(e) => setVar(v.key, { active: e.target.checked })} />
                {t("active")}
              </label>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={v.isBundle} onChange={(e) => setVar(v.key, { isBundle: e.target.checked })} />
                {t("isBundle")}
              </label>
              {!v.id && variants.length > 1 && (
                <Button type="button" size="sm" variant="outline" onClick={() => setVariants((vs) => vs.filter((x) => x.key !== v.key))}>
                  {td("remove")}
                </Button>
              )}
            </div>
            {v.isBundle && (
              <div className="space-y-2 sm:col-span-4 lg:col-span-8">
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
                        .filter((o) => o.id !== v.id)
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
                    <Button type="button" size="sm" variant="outline" onClick={() => setVar(v.key, { components: v.components.filter((_, j) => j !== i) })}>
                      {td("remove")}
                    </Button>
                  </div>
                ))}
                <Button type="button" size="sm" variant="outline" onClick={() => setVar(v.key, { components: [...v.components, { componentId: "", qty: 1 }] })}>
                  + {t("addComponent")}
                </Button>
              </div>
            )}
          </fieldset>
        ))}
        <Button type="button" variant="outline" onClick={() => setVariants((vs) => [...vs, blankVariant()])}>
          + {t("addVariant")}
        </Button>
      </section>

      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {td("error")}: {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {t("save")}
      </Button>
    </form>
  );
}
