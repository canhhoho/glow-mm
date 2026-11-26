"use client";

import { Trash2, Plus, Save } from "lucide-react";
import { startTransition, useActionState, useMemo, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { fieldClass, fieldLabelClass, fieldLabelSmClass, Notice } from "@/components/admin/ui";
import { createDocumentAction } from "@/server/inventory/actions";
import { batchQtyAt, batchSelectable, keepValidBatches, variantsInStockAt } from "@/server/inventory/document-form-rules";
import { cn } from "@/lib/utils";
import { FEATURES } from "@/lib/features";
import { VariantPicker, pickerIndex, pickerTextFor, type PickerText, type PickerVariant } from "@/components/admin/variant-picker";
import { FormMessage } from "@/components/ui/form-message";

type DocType = "RECEIVE" | "TRANSFER" | "ISSUE" | "ADJUST";
type StockType = "SELLABLE" | "TESTER";

export type FormData = {
  locations: { id: string; code: string; name: string; type: string; active: boolean }[];
  variants: (PickerVariant & { label: string; isBundle: boolean; requiresExpiry: boolean })[];
  batches: {
    id: string;
    variantId: string;
    lotNo: string;
    expiryDate: string;
    /** Lô đã có sổ kho; lô chỉ có ở phiếu nhập nháp không điều chỉnh được. */
    posted?: boolean;
    balances: { locationId: string; stockType: StockType; qty: number }[];
  }[];
  shipments: { id: string; code: string }[];
};

/** "Huỷ và tạo lại" (#5): phiếu nháp cũ điền sẵn vào form; lưu phiếu mới thì phiếu cũ bị huỷ cùng giao dịch. */
export type ReplaceDraft = {
  id: string;
  code: string;
  fromId: string;
  toId: string;
  reason: string;
  lines: { variantId: string; batchId: string; qty: number; stockType: StockType }[];
};

type Line = PickerText & {
  key: number;
  variantId: string;
  batchId: string;
  lotNo: string;
  expiryDate: string;
  expiryStatus: "DATED" | "NONE" | "UNKNOWN";
  mfgDate: string;
  unitCostVnd: string;
  qty: string;
  stockType: StockType;
};

let seq = 0;
const blank = (): Line => ({
  key: ++seq,
  productText: "",
  skuText: "",
  variantId: "",
  batchId: "",
  lotNo: "",
  expiryDate: "",
  expiryStatus: FEATURES.expiry ? "DATED" : "NONE",
  mfgDate: "",
  unitCostVnd: "",
  qty: "",
  stockType: "SELLABLE",
});

/** Form tạo phiếu kho nhiều dòng; gửi JSON tới server action (validate lại ở server). */
export function DocumentForm({ type, data, replace }: { type: DocType; data: FormData; replace?: ReplaceDraft }) {
  const t = useTranslations("Docs");
  const ti = useTranslations("Inventory");
  const [state, action, pending] = useActionState(createDocumentAction, undefined);
  /** Chống tạo trùng: một khoá cho form này (gửi lại sau lỗi dùng lại khoá). */
  const idempotencyKey = useRef<string | null>(null);
  const [fromId, setFromId] = useState(replace?.fromId ?? "");
  const [toId, setToId] = useState(replace?.toId ?? "");
  const [shipmentId, setShipmentId] = useState("");
  const [reason, setReason] = useState(replace?.reason ?? "");
  const variants = useMemo(() => data.variants.filter((v) => !v.isBundle), [data.variants]);
  const needsFrom = type === "TRANSFER" || type === "ISSUE";
  const needsTo = type !== "ISSUE";
  const stockLoc = type === "ADJUST" ? toId : fromId;
  // 20/11/2026: điều chỉnh / xuất / chuyển — bộ chọn chỉ gồm phân loại đang có tồn ở vị trí đã chọn (điều chỉnh: vị trí;
  // xuất / chuyển: kho xuất). Phiếu nhập không dùng form này cho chọn SP (ReceiveBulkForm).
  const stockOnly = type !== "RECEIVE";
  const inStock = useMemo(() => variantsInStockAt(data.batches, stockLoc), [data.batches, stockLoc]);
  const pickable = useMemo(() => (stockOnly ? variants.filter((v) => inStock.has(v.id)) : variants), [stockOnly, variants, inStock]);
  const picker = useMemo(() => pickerIndex(pickable), [pickable]);
  const [lines, setLines] = useState<Line[]>(() =>
    replace?.lines.length
      ? replace.lines.map((l) => ({ ...blank(), ...pickerTextFor(picker, l.variantId, variants), variantId: l.variantId, batchId: l.batchId, qty: String(l.qty), stockType: l.stockType }))
      : [blank()],
  );

  const update = (key: number, patch: Partial<Line>) => {
    setLotsCleared(0);
    setProductsCleared(0);
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const qtyAt = (batchId: string, stockType: StockType) => {
    const b = data.batches.find((x) => x.id === batchId);
    return b ? batchQtyAt(b, stockLoc, stockType) : 0;
  };

  // Đổi kho: bỏ chọn lô không còn hợp lệ ở kho mới (cùng quy tắc với danh sách lô hiện ra) và báo cho người dùng,
  // để lô đã chọn ở kho cũ không âm thầm đi theo vào phiếu mới.
  const [lotsCleared, setLotsCleared] = useState(0);
  const [productsCleared, setProductsCleared] = useState(0);
  const pickLocation = (kind: "from" | "to") => (value: string) => {
    if (kind === "from") setFromId(value);
    else setToId(value);
    const nextStockLoc = type === "ADJUST" ? (kind === "to" ? value : toId) : kind === "from" ? value : fromId;
    // Đổi vị trí tồn: dòng có SP không còn tồn ở vị trí mới → bỏ chọn SP (bộ chọn không còn SP đó), báo số dòng.
    const stocked = variantsInStockAt(data.batches, nextStockLoc);
    let dropped = 0;
    const base = stockOnly && nextStockLoc !== stockLoc
      ? lines.map((l) => {
          if (!l.variantId || stocked.has(l.variantId)) return l;
          dropped++;
          return { ...l, productText: "", skuText: "", variantId: "", batchId: "" };
        })
      : lines;
    const kept = keepValidBatches(base, data.batches, type, nextStockLoc);
    setLines(kept.lines);
    setLotsCleared(kept.cleared);
    setProductsCleared(dropped);
  };

  const payload = useMemo(() => {
    const base: Record<string, unknown> = { type, reason: reason || undefined };
    if (replace) base.replacesId = replace.id;
    if (needsFrom) base.fromId = fromId;
    if (needsTo) base.toId = toId;
    if (type === "RECEIVE" && shipmentId) base.shipmentId = shipmentId;
    base.lines = lines.map((l) =>
      type === "RECEIVE"
        ? {
            variantId: l.variantId,
            lotNo: l.lotNo,
            expiryDate: l.expiryDate || undefined,
            expiryStatus: l.expiryStatus,
            mfgDate: l.mfgDate || undefined,
            unitCostVnd: l.unitCostVnd,
            qty: l.qty,
            stockType: l.stockType,
          }
        : { variantId: l.variantId, batchId: l.batchId || undefined, qty: l.qty, stockType: l.stockType },
    );
    return JSON.stringify(base);
  }, [type, reason, fromId, toId, shipmentId, lines, needsFrom, needsTo, replace]);

  // Kho ĐI (xuất, chuyển) gồm cả kho ngừng dùng để dọn tồn cũ; kho ĐẾN và vị trí điều chỉnh chỉ kho đang dùng —
  // khớp `checkLocations` ở server (kho ngừng dùng không nhận hàng / không điều chỉnh).
  const locSelect = (value: string, onChange: (v: string) => void, label: string, name: string, direction: "from" | "to") => (
    <label className={fieldLabelClass}>
      <span className="text-muted-foreground">{label}</span>
      <select name={name} required value={value} onChange={(e) => onChange(e.target.value)} className={fieldClass}>
        <option value="">—</option>
        {data.locations
          .filter((l) => direction === "from" || l.active)
          .map((l) => (
            <option key={l.id} value={l.id}>
              {l.code} — {l.name}
              {l.active ? "" : ` (${ti("inactive")})`}
            </option>
          ))}
      </select>
    </label>
  );

  // Gửi qua onSubmit thay vì `action={…}`: React tự reset form sau action, làm các <select> có state về "—"
  // khi server báo lỗi (state vẫn giữ → lệch). Trình duyệt vẫn kiểm tra `required` trước sự kiện submit.
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    idempotencyKey.current ??= crypto.randomUUID();
    fd.set("payload", JSON.stringify({ ...JSON.parse(String(fd.get("payload") ?? "{}")), idempotencyKey: idempotencyKey.current }));
    startTransition(() => action(fd));
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <input type="hidden" name="payload" value={payload} />
      {replace && (
        <Notice tone="warning" data-testid="replacing-note">
          {t("replacingNote", { code: replace.code })}
        </Notice>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        {needsFrom && locSelect(fromId, pickLocation("from"), t("chooseFrom"), "fromId", "from")}
        {needsTo && locSelect(toId, pickLocation("to"), type === "ADJUST" ? t("chooseLocation") : t("chooseTo"), "toId", "to")}
        {type === "RECEIVE" && (
          <label className={fieldLabelClass}>
            <span className="text-muted-foreground">{t("shipment")}</span>
            <select value={shipmentId} onChange={(e) => setShipmentId(e.target.value)} className={fieldClass}>
              <option value="">{t("none")}</option>
              {data.shipments.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className={cn(fieldLabelClass, "sm:col-span-3")}>
          <span className="text-muted-foreground">{t("reason")}</span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required={type === "ISSUE" || type === "ADJUST"}
            className={fieldClass}
            name="reason"
          />
        </label>
      </div>

      {productsCleared > 0 && (
        <Notice tone="warning" data-testid="products-cleared">
          {t("productsCleared", { count: productsCleared })}
        </Notice>
      )}
      {stockOnly && (
        <p className="text-sm text-muted-foreground" data-testid="stock-picker-hint">
          {!stockLoc ? t("stockPickerNoLocation") : pickable.length === 0 ? t("stockPickerEmpty") : t("stockPickerHint", { count: pickable.length })}
        </p>
      )}
      {lotsCleared > 0 && (
        <Notice tone="warning" data-testid="lots-cleared">
          {t("lotsCleared", { count: lotsCleared })}
        </Notice>
      )}

      {/* Gợi ý dùng chung cho mọi dòng (một lần, không lặp theo dòng): tên SP và mọi SKU. */}
      <datalist id="picker-products">
        {picker.products.map((p) => (
          <option key={p.id} value={p.text} />
        ))}
      </datalist>
      <datalist id="picker-skus">
        {pickable.map((v) => (
          <option key={v.id} value={v.sku}>
            {v.productName}
          </option>
        ))}
      </datalist>

      <div className="space-y-3">
        {lines.map((l, i) => {
          const batchOptions = data.batches.filter((b) => b.variantId === l.variantId && batchSelectable(type, b, stockLoc, l.stockType));
          return (
            // Điện thoại: 1 cột; sm: 2 cột (tên SP cả hàng); md: 6 cột (hàng 1: SP · SKU · phân loại, hàng 2: lô · SL · loại tồn);
            // xl: một hàng, độ rộng theo nội dung (tên SP rộng nhất, SL hẹp).
            <fieldset
              key={l.key}
              className={cn(
                "grid items-start gap-2 rounded-lg border p-3 sm:grid-cols-2 md:grid-cols-6",
                type !== "RECEIVE" && "xl:grid-cols-[minmax(14rem,2.2fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_minmax(9rem,1.3fr)_6.5rem_8rem_auto]",
              )}
              aria-label={`${t("line")} ${i + 1}`}
            >
              <VariantPicker
                index={picker}
                i={i}
                lineKey={l.key}
                variantId={l.variantId}
                text={l}
                productListId="picker-products"
                skuListId="picker-skus"
                className="sm:col-span-2 xl:col-span-1"
                cellClassName="md:col-span-2 xl:col-span-1"
                onText={(patch) => update(l.key, patch)}
                onVariant={(id) => update(l.key, { variantId: id, batchId: "", expiryDate: "", expiryStatus: !FEATURES.expiry ? "NONE" : variants.find((v) => v.id === id)?.requiresExpiry === false ? "NONE" : "DATED" })}
              />

              {type === "RECEIVE" ? (
                <>
                  {FEATURES.expiry && (
                    <label className={fieldLabelSmClass}>
                      <span className="text-muted-foreground">{t("expiryStatus")}</span>
                      <select value={l.expiryStatus} onChange={(e) => update(l.key, { expiryStatus: e.target.value as Line["expiryStatus"], expiryDate: "" })} className={fieldClass}>
                        {/* 16/11/2026: hạn dùng theo lô, mọi SP chọn được cả ba. */}
                        <option value="DATED">{ti("expiryDated")}</option>
                        <option value="UNKNOWN">{ti("expiryUnknown")}</option>
                        <option value="NONE">{ti("expiryNone")}</option>
                      </select>
                    </label>
                  )}
                  <label className={fieldLabelSmClass}>
                    <span className="text-muted-foreground">{t("lotNo")}</span>
                    <input required name={`lot-${i}`} value={l.lotNo} onChange={(e) => update(l.key, { lotNo: e.target.value })} className={fieldClass} />
                  </label>
                  {FEATURES.expiry && (
                    <label className={fieldLabelSmClass}>
                      <span className="text-muted-foreground">{t("expiry")}</span>
                      <input required={l.expiryStatus === "DATED"} disabled={l.expiryStatus !== "DATED"} type="date" name={`expiry-${i}`} value={l.expiryDate} onChange={(e) => update(l.key, { expiryDate: e.target.value })} className={fieldClass} />
                    </label>
                  )}
                  {FEATURES.expiry && (
                    <label className={fieldLabelSmClass}>
                      <span className="text-muted-foreground">{t("mfg")}</span>
                      <input type="date" name={`mfg-${i}`} value={l.mfgDate} onChange={(e) => update(l.key, { mfgDate: e.target.value })} className={fieldClass} />
                    </label>
                  )}
                  <label className={fieldLabelSmClass}>
                    <span className="text-muted-foreground">{t("unitCost")}</span>
                    <input required type="number" min={0} step={1} inputMode="numeric" name={`cost-${i}`} value={l.unitCostVnd} onChange={(e) => update(l.key, { unitCostVnd: e.target.value })} className={fieldClass} />
                  </label>
                </>
              ) : (
                <label className={cn(fieldLabelSmClass, "min-w-0 sm:col-span-2 md:col-span-3 xl:col-span-1")}>
                  <span className="text-muted-foreground">{t("batch")}</span>
                  <select
                    name={`batch-${i}`}
                    required={type === "ADJUST"}
                    value={l.batchId}
                    onChange={(e) => update(l.key, { batchId: e.target.value })}
                    className={fieldClass}
                  >
                    <option value="">{type === "ADJUST" ? "—" : t("autoFefo")}</option>
                    {batchOptions.map((b) => (
                      <option key={b.id} value={b.id}>
                        {/* Lô không hạn: bỏ phần hạn trống, nhãn = "số lô · tồn". */}
                        {[b.lotNo, ...(b.expiryDate ? [b.expiryDate] : []), qtyAt(b.id, l.stockType)].join(" · ")}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className={fieldLabelSmClass}>
                <span className="text-muted-foreground">{type === "ADJUST" ? t("qtySigned") : t("qty")}</span>
                <input
                  required
                  type="number"
                  step={1}
                  min={type === "ADJUST" ? undefined : 1}
                  inputMode="numeric"
                  name={`qty-${i}`}
                  value={l.qty}
                  onChange={(e) => update(l.key, { qty: e.target.value })}
                  className={fieldClass}
                />
              </label>
              <label className={fieldLabelSmClass}>
                <span className="text-muted-foreground">{t("stockType")}</span>
                <select
                  name={`stockType-${i}`}
                  value={l.stockType}
                  onChange={(e) => update(l.key, { stockType: e.target.value as StockType, batchId: "" })}
                  className={fieldClass}
                >
                  <option value="SELLABLE">{ti("SELLABLE")}</option>
                  <option value="TESTER">{ti("TESTER")}</option>
                </select>
              </label>
              {lines.length > 1 && (
                <div className="flex items-end self-end">
                  <Button type="button" variant="outline" size="icon-lg" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} title={t("remove")} aria-label={t("remove")}><Trash2 aria-hidden className="size-4 shrink-0" /></Button>
                </div>
              )}
            </fieldset>
          );
        })}
        <Button size="lg" type="button" variant="outline" onClick={() => setLines((ls) => [...ls, blank()])}><Plus aria-hidden className="size-4 shrink-0" /> {t("addLine")}</Button>
      </div>

      {state?.error && (
        <FormMessage>
          {t("error")}: {state.error}
        </FormMessage>
      )}
      <Button size="lg" type="submit" disabled={pending}><Save aria-hidden /> {t("saveDraft")}</Button>
    </form>
  );
}
