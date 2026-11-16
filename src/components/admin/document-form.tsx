"use client";

import { Trash2, Plus, Save } from "lucide-react";
import { startTransition, useActionState, useMemo, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { fieldClass, fieldLabelClass, fieldLabelSmClass, Notice } from "@/components/admin/ui";
import { createDocumentAction } from "@/server/inventory/actions";
import { cn } from "@/lib/utils";

type DocType = "RECEIVE" | "TRANSFER" | "ISSUE" | "ADJUST";
type StockType = "SELLABLE" | "TESTER";

export type FormData = {
  locations: { id: string; code: string; name: string; type: string; active: boolean }[];
  variants: { id: string; label: string; isBundle: boolean; requiresExpiry: boolean; inactive?: boolean; archived?: boolean }[];
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

type Line = {
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
  variantId: "",
  batchId: "",
  lotNo: "",
  expiryDate: "",
  expiryStatus: "DATED",
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
  const [lines, setLines] = useState<Line[]>(() =>
    replace?.lines.length
      ? replace.lines.map((l) => ({ ...blank(), variantId: l.variantId, batchId: l.batchId, qty: String(l.qty), stockType: l.stockType }))
      : [blank()],
  );

  const needsFrom = type === "TRANSFER" || type === "ISSUE";
  const needsTo = type !== "ISSUE";
  const stockLoc = type === "ADJUST" ? toId : fromId;
  const variants = data.variants.filter((v) => !v.isBundle);

  const update = (key: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const qtyAt = (batchId: string, stockType: StockType) =>
    data.batches.find((b) => b.id === batchId)?.balances.find((x) => x.locationId === stockLoc && x.stockType === stockType)
      ?.qty ?? 0;

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
        {needsFrom && locSelect(fromId, setFromId, t("chooseFrom"), "fromId", "from")}
        {needsTo && locSelect(toId, setToId, type === "ADJUST" ? t("chooseLocation") : t("chooseTo"), "toId", "to")}
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

      <div className="space-y-3">
        {lines.map((l, i) => {
          const batchOptions = data.batches.filter(
            (b) => b.variantId === l.variantId && (type === "ADJUST" ? b.posted !== false : qtyAt(b.id, l.stockType) > 0),
          );
          return (
            <fieldset key={l.key} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-6" aria-label={`${t("line")} ${i + 1}`}>
              <label className={cn(fieldLabelSmClass, "sm:col-span-2")}>
                <span className="text-muted-foreground">{t("variant")}</span>
                <select
                  required
                  value={l.variantId}
                  onChange={(e) => update(l.key, { variantId: e.target.value, batchId: "", expiryDate: "", expiryStatus: variants.find((v) => v.id === e.target.value)?.requiresExpiry === false ? "NONE" : "DATED" })}
                  className={fieldClass}
                  name={`variant-${i}`}
                >
                  <option value="">—</option>
                  {variants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                      {v.archived ? ` (${t("variantArchived")})` : v.inactive ? ` (${t("variantInactive")})` : ""}
                    </option>
                  ))}
                </select>
              </label>

              {type === "RECEIVE" ? (
                <>
                  <label className={fieldLabelSmClass}>
                    <span className="text-muted-foreground">{t("expiryStatus")}</span>
                    <select value={l.expiryStatus} onChange={(e) => update(l.key, { expiryStatus: e.target.value as Line["expiryStatus"], expiryDate: "" })} className={fieldClass}>
                      {variants.find((v) => v.id === l.variantId)?.requiresExpiry !== false && <option value="DATED">{ti("expiryDated")}</option>}
                      {variants.find((v) => v.id === l.variantId)?.requiresExpiry === false && <option value="NONE">{ti("expiryNone")}</option>}
                      <option value="UNKNOWN">{ti("expiryUnknown")}</option>
                    </select>
                  </label>
                  <label className={fieldLabelSmClass}>
                    <span className="text-muted-foreground">{t("lotNo")}</span>
                    <input required name={`lot-${i}`} value={l.lotNo} onChange={(e) => update(l.key, { lotNo: e.target.value })} className={fieldClass} />
                  </label>
                  <label className={fieldLabelSmClass}>
                    <span className="text-muted-foreground">{t("expiry")}</span>
                    <input required={l.expiryStatus === "DATED"} disabled={l.expiryStatus !== "DATED"} type="date" name={`expiry-${i}`} value={l.expiryDate} onChange={(e) => update(l.key, { expiryDate: e.target.value })} className={fieldClass} />
                  </label>
                  <label className={fieldLabelSmClass}>
                    <span className="text-muted-foreground">{t("mfg")}</span>
                    <input type="date" name={`mfg-${i}`} value={l.mfgDate} onChange={(e) => update(l.key, { mfgDate: e.target.value })} className={fieldClass} />
                  </label>
                  <label className={fieldLabelSmClass}>
                    <span className="text-muted-foreground">{t("unitCost")}</span>
                    <input required type="number" min={0} step={1} inputMode="numeric" name={`cost-${i}`} value={l.unitCostVnd} onChange={(e) => update(l.key, { unitCostVnd: e.target.value })} className={fieldClass} />
                  </label>
                </>
              ) : (
                <label className={cn(fieldLabelSmClass, "sm:col-span-2")}>
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
                        {b.lotNo} · {b.expiryDate} · {qtyAt(b.id, l.stockType)}
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
                <div className="flex items-end">
                  <Button type="button" variant="outline" size="icon-lg" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} title={t("remove")} aria-label={t("remove")}><Trash2 aria-hidden className="size-4 shrink-0" /></Button>
                </div>
              )}
            </fieldset>
          );
        })}
        <Button size="lg" type="button" variant="outline" onClick={() => setLines((ls) => [...ls, blank()])}><Plus aria-hidden className="size-4 shrink-0" /> {t("addLine")}</Button>
      </div>

      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {t("error")}: {state.error}
        </p>
      )}
      <Button size="lg" type="submit" disabled={pending}><Save aria-hidden /> {t("saveDraft")}</Button>
    </form>
  );
}
