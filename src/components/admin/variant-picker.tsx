"use client";

import { useTranslations } from "next-intl";
import { fieldClass, fieldLabelSmClass } from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import { fold } from "@/lib/variant-label";

/** Biến thể cho bộ chọn: dữ liệu sẵn có của `listVariantsForPicker` (không thêm quan hệ mới). */
export type PickerVariant = {
  id: string;
  sku: string;
  productId: string;
  productName: string;
  variantLabel: string;
  inactive?: boolean;
  archived?: boolean;
};

export type PickerProduct = { id: string; text: string; variants: PickerVariant[] };

/** Chỉ mục dùng chung cho mọi dòng: SP (tên hiển thị duy nhất), tra theo tên / SKU (không phân biệt hoa thường, dấu). */
export function pickerIndex(variants: PickerVariant[]) {
  const groups = new Map<string, PickerVariant[]>();
  for (const v of variants) groups.set(v.productId, [...(groups.get(v.productId) ?? []), v]);
  const nameCount = new Map<string, number>();
  for (const vs of groups.values()) nameCount.set(fold(vs[0].productName), (nameCount.get(fold(vs[0].productName)) ?? 0) + 1);
  // Hai SP trùng tên → thêm SKU đầu tiên để mỗi gợi ý chỉ khớp một SP.
  const products: PickerProduct[] = [...groups].map(([id, vs]) => ({
    id,
    text: (nameCount.get(fold(vs[0].productName)) ?? 0) > 1 ? `${vs[0].productName} · ${vs[0].sku}` : vs[0].productName,
    variants: vs,
  }));
  products.sort((a, b) => a.text.localeCompare(b.text));
  const key = (s: string) => fold(s.trim());
  const byText = new Map(products.map((p) => [key(p.text), p]));
  const byId = new Map(products.map((p) => [p.id, p]));
  const bySku = new Map(variants.map((v) => [key(v.sku), v]));
  return {
    products,
    productByText: (text: string) => byText.get(key(text)),
    productById: (id: string) => byId.get(id),
    variantBySku: (sku: string) => bySku.get(key(sku)),
  };
}

export type PickerIndex = ReturnType<typeof pickerIndex>;

/** Trạng thái hiển thị của một dòng (chữ đang gõ); `variantId` là giá trị thật gửi lên server. */
export type PickerText = { productText: string; skuText: string };

export function pickerTextFor(index: PickerIndex, variantId: string, all: PickerVariant[]): PickerText {
  const v = all.find((x) => x.id === variantId);
  return v ? { productText: index.productById(v.productId)?.text ?? "", skuText: v.sku } : { productText: "", skuText: "" };
}

/**
 * Ba ô liên kết thay ô "SKU / Phân loại": Tên SP (gợi ý theo tên) → SKU (gợi ý trong SP đã chọn, hoặc mọi SKU) →
 * Phân loại (chỉ các phân loại của SP). Gõ đúng SKU tự điền SP + phân loại; SP một phân loại tự chọn luôn.
 * Ô chọn phân loại là ô bắt buộc (giữ `name="variant-{i}"`), nên lưu phiếu vẫn chặn khi chưa chọn đủ.
 */
export function VariantPicker({
  index,
  i,
  lineKey,
  variantId,
  text,
  productListId,
  skuListId,
  onText,
  onVariant,
  className,
  cellClassName,
}: {
  index: PickerIndex;
  i: number;
  lineKey: number;
  variantId: string;
  text: PickerText;
  /** datalist tên SP dùng chung (đặt một lần trong form). */
  productListId: string;
  /** datalist mọi SKU dùng chung — dùng khi chưa chọn SP. */
  skuListId: string;
  onText: (patch: Partial<PickerText>) => void;
  /** Đổi biến thể (rỗng = bỏ chọn); form tự xoá lô đã chọn như trước. */
  onVariant: (variantId: string) => void;
  /** Lớp ô Tên SP (thường rộng hơn). */
  className?: string;
  /** Lớp ô SKU và Phân loại. */
  cellClassName?: string;
}) {
  const t = useTranslations("Docs");
  const product = index.productByText(text.productText);
  const variant = product?.variants.find((v) => v.id === variantId);
  const productInvalid = text.productText.trim() !== "" && !product;
  const suffix = (v: PickerVariant) => (v.archived ? ` (${t("variantArchived")})` : v.inactive ? ` (${t("variantInactive")})` : "");

  const pickProduct = (value: string) => {
    const p = index.productByText(value);
    // Đổi SP → giữ biến thể nếu vẫn thuộc SP; SP một phân loại → chọn luôn; còn lại bỏ chọn để người dùng chọn lại.
    const next = p ? (p.variants.some((v) => v.id === variantId) ? variantId : p.variants.length === 1 ? p.variants[0].id : "") : "";
    onText({ productText: value, skuText: next ? p!.variants.find((v) => v.id === next)!.sku : "" });
    if (next !== variantId) onVariant(next);
  };
  const pickSku = (value: string) => {
    const v = index.variantBySku(value);
    // SKU phải thuộc SP đang chọn (nếu đã chọn SP); gõ SKU khi chưa chọn SP → tự điền SP.
    const ok = v && (!product || v.productId === product.id || text.productText.trim() === "");
    if (ok) {
      onText({ skuText: v.sku, productText: index.productById(v.productId)?.text ?? text.productText });
      if (v.id !== variantId) onVariant(v.id);
    } else {
      onText({ skuText: value });
      if (variantId) onVariant("");
    }
  };

  const skuOptions = product ? product.variants : null;
  const ownSkuList = `sku-list-${lineKey}`;
  return (
    <>
      <label className={cn(fieldLabelSmClass, "min-w-0", className)}>
        <span className="text-muted-foreground">{t("pickProduct")}</span>
        <input
          required
          name={`product-${i}`}
          list={productListId}
          autoComplete="off"
          placeholder={t("pickProductPlaceholder")}
          value={text.productText}
          onChange={(e) => pickProduct(e.target.value)}
          aria-invalid={productInvalid || undefined}
          ref={(el) => el?.setCustomValidity(productInvalid ? t("pickProductNoMatch") : "")}
          className={cn(fieldClass, productInvalid && "border-destructive")}
        />
        {productInvalid && <span className="text-xs text-destructive">{t("pickProductNoMatch")}</span>}
      </label>
      <label className={cn(fieldLabelSmClass, "min-w-0", cellClassName)}>
        <span className="text-muted-foreground">{t("pickSku")}</span>
        <input
          name={`sku-${i}`}
          list={skuOptions ? ownSkuList : skuListId}
          autoComplete="off"
          spellCheck={false}
          value={text.skuText}
          onChange={(e) => pickSku(e.target.value)}
          className={cn(fieldClass, "font-mono")}
        />
      </label>
      {/* datalist đặt ngoài <label>: nằm trong label thì chữ gợi ý bị tính vào tên truy cập của ô SKU. */}
      {skuOptions && (
        <datalist id={ownSkuList}>
          {skuOptions.map((v) => (
            <option key={v.id} value={v.sku}>
              {v.variantLabel}
            </option>
          ))}
        </datalist>
      )}
      <label className={cn(fieldLabelSmClass, "min-w-0", cellClassName)}>
        <span className="text-muted-foreground">{t("pickVariant")}</span>
        <select
          required
          name={`variant-${i}`}
          value={variant ? variant.id : ""}
          onChange={(e) => {
            const v = product?.variants.find((x) => x.id === e.target.value);
            onText({ skuText: v?.sku ?? "" });
            onVariant(v?.id ?? "");
          }}
          className={fieldClass}
        >
          <option value="">{product ? "—" : t("pickVariantFirst")}</option>
          {product?.variants.map((v) => (
            <option key={v.id} value={v.id}>
              {v.variantLabel}
              {suffix(v)}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
