"use client";

import { Trash2, Plus, Save } from "lucide-react";
import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { checkboxClass, Field, fieldClass } from "@/components/admin/ui";
import { saveProductAction } from "@/server/catalog/actions";
import type { ProductEditData } from "@/server/catalog/admin-queries";
import { cn } from "@/lib/utils";
import { fmtInt } from "@/lib/format";
import { suggestProductSlug, suggestVariantSku } from "@/lib/product-identifiers";

type Options = {
  brands: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  tags: { id: string; kind: "SKIN_TYPE" | "CONCERN" | "INGREDIENT"; name: string }[];
  components: { id: string; label: string; stockLocationId: string | null; inactive?: boolean; archived?: boolean }[];
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
  stockLocationId: null,
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

const sectionClass = "grid gap-3 rounded-lg border p-4 sm:grid-cols-2";

/**
 * Form sửa SP theo bộ trường chung (`lib/product-fields.ts`, cùng nhãn `ProductFields.*` với file Excel):
 * Thông tin chính → Phân loại → Mô tả cho khách → Chi tiết thêm (thu gọn) → Thiết lập khác (thu gọn).
 * Một ô tên cho mọi ngôn ngữ (16/11/2026): đổi tên thì bỏ tên Myanmar cũ, lưu sẽ chép tên mới sang mọi ngôn ngữ.
 * Giá / hoa hồng CTV chỉ xem (đặt ở trang Giá bán); nhập hàng ở Phiếu nhập; kho bán gán khi nhập hàng.
 * `review` (trang SP): thêm nút "Lưu & Gửi duyệt" (người soạn) và "Lưu & Duyệt" (người có quyền duyệt).
 * `draftBrandName`: thương hiệu gõ mới trong bản đang sửa (chưa có trong danh sách).
 */
export function ProductForm({
  initial,
  options,
  copySourceId,
  review,
  draftBrandName,
  slugLocked = false,
}: {
  initial: ProductEditData | null;
  options: Options;
  copySourceId?: string;
  review?: { submit: boolean; approve: boolean };
  draftBrandName?: string;
  /** Slug khoá sau lần đăng bán đầu tiên (đường dẫn khách đã dùng). */
  slugLocked?: boolean;
}) {
  const t = useTranslations("Products");
  const tf = useTranslations("ProductFields");
  const td = useTranslations("Docs");
  const [state, action, pending] = useActionState(saveProductAction, undefined);
  const [p, setP] = useState<ProductEditData>(initial ?? EMPTY);
  const [variants, setVariants] = useState<Variant[]>(
    initial?.variants.length ? initial.variants.map((v) => ({ ...v, key: ++seq })) : [blankVariant(t("standardVariant"))],
  );
  const name = p.en.name || p.my.name;
  const slug = p.slug || suggestProductSlug(p.en.name, p.my.name);

  // Thương hiệu: dùng brandId nếu chọn từ danh sách, brandName nếu gõ tay
  const [brandInput, setBrandInput] = useState(
    initial?.brandId ? options.brands.find((b) => b.id === initial.brandId)?.name ?? "" : draftBrandName ?? "",
  );
  const matchedBrand = options.brands.find((b) => b.name.toLowerCase() === brandInput.trim().toLowerCase());
  const singleWh = options.warehouses.length <= 1;

  const set = <K extends keyof ProductEditData>(k: K, v: ProductEditData[K]) => setP((x) => ({ ...x, [k]: v }));
  const setVar = (key: number, patch: Partial<Variant>) =>
    setVariants((vs) => vs.map((v) => (v.key === key ? { ...v, ...patch } : v)));

  const payload = useMemo(
    () =>
      JSON.stringify({
        // Giữ tag + các trường không có ô trên form; giá / hoa hồng / kho bị action bỏ.
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

  const textarea = (label: string, value: string, onChange: (v: string) => void, rows = 3) => (
    <textarea aria-label={label} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} className={cn(fieldClass, "h-auto py-2")} />
  );
  const hint = (key: string) => <span className="text-xs text-muted-foreground">{tf(`${key}.hint`)}</span>;

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="payload" value={payload} />

      {/* ── 1. Thông tin chính ── */}
      <section className={sectionClass} data-testid="product-section-main">
        <h2 className="font-medium sm:col-span-2">{tf("sections.main")}</h2>
        <div className="sm:col-span-2">
          <Field label={`${tf("name.label")} *`}>
            <input
              aria-label={tf("name.label")}
              required
              value={name}
              // Một tên cho mọi ngôn ngữ: ghi vào tên tiếng Anh, bỏ tên Myanmar cũ (lưu sẽ chép tên này sang).
              onChange={(e) => setP((x) => ({ ...x, en: { ...x.en, name: e.target.value }, my: { ...x.my, name: "" } }))}
              maxLength={200}
              className={fieldClass}
            />
            {hint("name")}
          </Field>
        </div>
        <Field label={`${tf("brand.label")} *`}>
          <input aria-label={tf("brand.label")} list="brand-list" value={brandInput} onChange={(e) => setBrandInput(e.target.value)} maxLength={80} className={fieldClass} required />
          <datalist id="brand-list">
            {options.brands.map((b) => (
              <option key={b.id} value={b.name} />
            ))}
          </datalist>
          {brandInput.trim() && !matchedBrand && <span className="text-xs text-muted-foreground">{t("brandNewHint")}</span>}
        </Field>
        <Field label={`${tf("category.label")} *`}>
          <select aria-label={tf("category.label")} required value={p.categoryId} onChange={(e) => set("categoryId", e.target.value)} className={fieldClass}>
            <option value="">—</option>
            {options.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      </section>

      {/* ── 2. Phân loại: mỗi dòng một SKU (luôn hiện, kể cả SP một loại) ── */}
      <section className="space-y-3 rounded-lg border p-4" data-testid="product-section-variant">
        <h2 className="font-medium">{tf("sections.variant")}</h2>
        {variants.map((v, index) => (
          <fieldset key={v.key} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-3" data-testid="product-variant-row">
            <Field label={tf("variant_label.label")}>
              <input aria-label={tf("variant_label.label")} required value={v.label} onChange={(e) => setVar(v.key, { label: e.target.value })} maxLength={60} className={fieldClass} />
            </Field>
            <Field label={tf("sku.label")}>
              <input aria-label={tf("sku.label")} value={v.sku || suggestVariantSku(slug, index)} onChange={(e) => setVar(v.key, { sku: e.target.value })} maxLength={40} className={fieldClass} />
              {!v.id && !v.sku && <span className="text-xs text-muted-foreground">{t("autoIdentifierHint")}</span>}
            </Field>
            <Field label={tf("weight_g.label")}>
              <input
                aria-label={tf("weight_g.label")}
                type="number"
                min={1}
                inputMode="numeric"
                value={v.weightGrams || ""} // 0 cũ = chưa có khối lượng
                onChange={(e) => setVar(v.key, { weightGrams: e.target.value ? Number(e.target.value) : null })}
                className={fieldClass}
              />
            </Field>
            <div className="col-span-full flex flex-wrap items-center gap-4 text-sm">
              {v.id && (
                <label className="flex items-center gap-1">
                  <input type="checkbox" className={checkboxClass} checked={v.active} onChange={(e) => setVar(v.key, { active: e.target.checked })} />
                  {t("active")}
                </label>
              )}
              {v.id && (
                <span className="text-muted-foreground" data-testid="variant-price">
                  {tf("currentPrice")}: {v.priceMmk > 0 ? `${fmtInt(v.priceMmk)} MMK` : "—"}
                </span>
              )}
              {v.isBundle && <span className="rounded bg-muted px-2 py-1 text-xs">{t("isBundle")}</span>}
              {!v.id && variants.length > 1 && (
                <Button type="button" size="icon-lg" variant="outline" onClick={() => setVariants((vs) => vs.filter((x) => x.key !== v.key))} title={td("remove")} aria-label={td("remove")}>
                  <Trash2 aria-hidden className="size-4 shrink-0" />
                </Button>
              )}
            </div>
            {/* Thành phần combo */}
            {v.isBundle && (
              <div className="col-span-full space-y-2">
                <p className="text-sm text-muted-foreground">{t("components")}</p>
                {v.components.map((c, i) => (
                  <div key={i} className="flex gap-2">
                    <select
                      required
                      value={c.componentId}
                      onChange={(e) => setVar(v.key, { components: v.components.map((x, j) => (j === i ? { ...x, componentId: e.target.value } : x)) })}
                      className={fieldClass}
                    >
                      <option value="">—</option>
                      {/* Lựa chọn MỚI: cùng kho + đang dùng. Thành phần ĐÃ LƯU (c.componentId) luôn hiện, có nhãn nếu đã tắt / ngừng KD (#6). */}
                      {options.components
                        .filter((o) => o.id !== v.id && (o.id === c.componentId || (o.stockLocationId != null && (p.stockLocationId == null || o.stockLocationId === p.stockLocationId) && !o.inactive && !o.archived)))
                        .map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                            {o.archived ? ` (${td("variantArchived")})` : o.inactive ? ` (${td("variantInactive")})` : ""}
                          </option>
                        ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      value={c.qty}
                      onChange={(e) => setVar(v.key, { components: v.components.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) } : x)) })}
                      className={cn(fieldClass, "w-24")}
                    />
                    <Button type="button" size="icon-lg" variant="outline" onClick={() => setVar(v.key, { components: v.components.filter((_, j) => j !== i) })} title={td("remove")} aria-label={td("remove")}>
                      <Trash2 aria-hidden className="size-4 shrink-0" />
                    </Button>
                  </div>
                ))}
                <Button type="button" size="lg" variant="outline" onClick={() => setVar(v.key, { components: [...v.components, { componentId: "", qty: 1 }] })}>
                  <Plus aria-hidden className="size-4 shrink-0" /> {t("addComponent")}
                </Button>
              </div>
            )}
          </fieldset>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" type="button" variant="outline" onClick={() => setVariants((vs) => [...vs, blankVariant(t("standardVariant"))])}>
            <Plus aria-hidden className="size-4 shrink-0" /> {t("addColorSize")}
          </Button>
        </div>
        {/* Giá + nhập hàng: chỉ là lối tắt sang trang chính của nghiệp vụ đó. */}
        {p.id && (
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>
              {tf("priceReadonly")}{" "}
              <Link className="text-primary underline" href={`/admin/selling-prices/manual?productId=${p.id}`}>
                {tf("setPrice")}
              </Link>
            </p>
            <p>
              {tf("stockHint")}{" "}
              <Link className="text-primary underline" href={`/admin/inventory/documents/new?type=RECEIVE&product=${p.id}`}>
                {tf("receive")}
              </Link>
            </p>
          </div>
        )}
      </section>

      {/* ── 3. Mô tả cho khách ── */}
      <section className="space-y-3 rounded-lg border p-4" data-testid="product-section-content">
        <h2 className="font-medium">{tf("sections.content")}</h2>
        <Field label={tf("description_my.label")}>{textarea(tf("description_my.label"), p.my.description, (v) => set("my", { ...p.my, description: v }))}</Field>
        <Field label={tf("description_en.label")}>{textarea(tf("description_en.label"), p.en.description, (v) => set("en", { ...p.en, description: v }))}</Field>
      </section>

      {/* ── 4. Chi tiết thêm (khách thấy trên trang SP; tuỳ chọn) ── */}
      <details className="rounded-lg border p-4" data-testid="product-section-extra">
        <summary className="cursor-pointer font-medium">{tf("sections.extra")}</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label={tf("usage_my.label")}>{textarea(tf("usage_my.label"), p.my.usage, (v) => set("my", { ...p.my, usage: v }))}</Field>
          <Field label={tf("usage_en.label")}>{textarea(tf("usage_en.label"), p.en.usage, (v) => set("en", { ...p.en, usage: v }))}</Field>
          <Field label={tf("ingredients.label")}>{textarea(tf("ingredients.label"), p.ingredientsText, (v) => set("ingredientsText", v))}</Field>
          <Field label={tf("storage_note.label")}>{textarea(tf("storage_note.label"), p.storageNote, (v) => set("storageNote", v), 2)}</Field>
          <Field label={tf("pao_months.label")}>
            <input
              aria-label={tf("pao_months.label")}
              type="number"
              min={1}
              max={120}
              inputMode="numeric"
              value={p.paoMonths ?? ""}
              onChange={(e) => set("paoMonths", e.target.value ? Number(e.target.value) : null)}
              className={fieldClass}
            />
            {hint("pao_months")}
          </Field>
        </div>
      </details>

      {/* ── 5. Thiết lập khác ── */}
      <details className="rounded-lg border p-4">
        <summary className="cursor-pointer font-medium">{t("otherSettings")}</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label={t("slug")}>
            <input aria-label={t("slug")} value={slug} onChange={(e) => set("slug", e.target.value)} pattern="[a-z0-9\-]+" maxLength={80} readOnly={slugLocked} className={fieldClass} />
            {slugLocked && <span className="text-xs text-muted-foreground">{t("slugLocked")}</span>}
            {!p.id && !p.slug && <span className="text-xs text-muted-foreground">{t("autoIdentifierHint")}</span>}
          </Field>
          {/* Kho bán (16/11/2026): chỉ xem — gán khi ghi sổ nhập hàng đầu tiên, đổi bằng "Chuyển kho" ở danh sách SP. */}
          {!singleWh && (
            <Field label={t("warehouse")}>
              <p className="text-sm" data-testid="product-warehouse">
                {options.warehouses.find((w) => w.id === p.stockLocationId)?.name ?? <span className="text-muted-foreground">{t("warehouseNone")}</span>}
              </p>
            </Field>
          )}
        </div>
      </details>

      {/* Hiển thị trên web: bật/ẩn ở bước 5 "Đăng bán" của trang SP; lưu ở đây giữ nguyên trạng thái hiện tại. */}
      {/* Nút "Lưu" đứng đầu: Enter trong ô nhập chỉ lưu, không gửi / duyệt. */}
      <div className="flex flex-wrap gap-2">
        <Button size="lg" type="submit" name="intent" value="save" disabled={pending} variant={review ? "outline" : "default"}>
          <Save aria-hidden className="size-4 shrink-0" /> {t("save")}
        </Button>
        {review?.submit && (
          <Button size="lg" type="submit" name="intent" value="submit" disabled={pending} data-testid="save-submit">
            {t("review.saveSubmit")}
          </Button>
        )}
        {review?.approve && (
          <Button size="lg" type="submit" name="intent" value="approve" disabled={pending} variant="outline" data-testid="save-approve">
            {t("review.saveApprove")}
          </Button>
        )}
      </div>

      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {td("error")}: {state.error}
        </p>
      )}
    </form>
  );
}
