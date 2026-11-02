"use client";

import { startTransition, useActionState, useMemo, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/admin/ui";
import { createDocumentAction } from "@/server/inventory/actions";

type DocType = "RECEIVE" | "TRANSFER" | "ISSUE" | "ADJUST";
type StockType = "SELLABLE" | "TESTER";

export type FormData = {
  locations: { id: string; code: string; name: string; type: string }[];
  variants: { id: string; label: string; isBundle: boolean }[];
  batches: {
    id: string;
    variantId: string;
    lotNo: string;
    expiryDate: string;
    balances: { locationId: string; stockType: StockType; qty: number }[];
  }[];
  shipments: { id: string; code: string }[];
};

type Line = {
  key: number;
  variantId: string;
  batchId: string;
  lotNo: string;
  expiryDate: string;
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
  mfgDate: "",
  unitCostVnd: "",
  qty: "",
  stockType: "SELLABLE",
});

/** Form tạo phiếu kho nhiều dòng; gửi JSON tới server action (validate lại ở server). */
export function DocumentForm({ type, data }: { type: DocType; data: FormData }) {
  const t = useTranslations("Docs");
  const ti = useTranslations("Inventory");
  const [state, action, pending] = useActionState(createDocumentAction, undefined);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [shipmentId, setShipmentId] = useState("");
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<Line[]>([blank()]);

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
    if (needsFrom) base.fromId = fromId;
    if (needsTo) base.toId = toId;
    if (type === "RECEIVE" && shipmentId) base.shipmentId = shipmentId;
    base.lines = lines.map((l) =>
      type === "RECEIVE"
        ? {
            variantId: l.variantId,
            lotNo: l.lotNo,
            expiryDate: l.expiryDate,
            mfgDate: l.mfgDate || undefined,
            unitCostVnd: l.unitCostVnd,
            qty: l.qty,
            stockType: l.stockType,
          }
        : { variantId: l.variantId, batchId: l.batchId || undefined, qty: l.qty, stockType: l.stockType },
    );
    return JSON.stringify(base);
  }, [type, reason, fromId, toId, shipmentId, lines, needsFrom, needsTo]);

  const locSelect = (value: string, onChange: (v: string) => void, label: string, name: string) => (
    <label className="grid content-start gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <select name={name} required value={value} onChange={(e) => onChange(e.target.value)} className={fieldClass}>
        <option value="">—</option>
        {data.locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.code} — {l.name}
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
    startTransition(() => action(fd));
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <input type="hidden" name="payload" value={payload} />
      <div className="grid gap-3 sm:grid-cols-3">
        {needsFrom && locSelect(fromId, setFromId, t("chooseFrom"), "fromId")}
        {needsTo && locSelect(toId, setToId, type === "ADJUST" ? t("chooseLocation") : t("chooseTo"), "toId")}
        {type === "RECEIVE" && (
          <label className="grid content-start gap-1 text-sm">
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
        <label className="grid content-start gap-1 text-sm sm:col-span-3">
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
            (b) => b.variantId === l.variantId && (type === "ADJUST" || qtyAt(b.id, l.stockType) > 0),
          );
          return (
            <fieldset key={l.key} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-6" aria-label={`${t("line")} ${i + 1}`}>
              <label className="grid content-start gap-1 text-xs sm:col-span-2">
                <span className="text-muted-foreground">{t("variant")}</span>
                <select
                  required
                  value={l.variantId}
                  onChange={(e) => update(l.key, { variantId: e.target.value, batchId: "" })}
                  className={fieldClass}
                  name={`variant-${i}`}
                >
                  <option value="">—</option>
                  {variants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </label>

              {type === "RECEIVE" ? (
                <>
                  <label className="grid content-start gap-1 text-xs">
                    <span className="text-muted-foreground">{t("lotNo")}</span>
                    <input required name={`lot-${i}`} value={l.lotNo} onChange={(e) => update(l.key, { lotNo: e.target.value })} className={fieldClass} />
                  </label>
                  <label className="grid content-start gap-1 text-xs">
                    <span className="text-muted-foreground">{t("expiry")}</span>
                    <input required type="date" name={`expiry-${i}`} value={l.expiryDate} onChange={(e) => update(l.key, { expiryDate: e.target.value })} className={fieldClass} />
                  </label>
                  <label className="grid content-start gap-1 text-xs">
                    <span className="text-muted-foreground">{t("mfg")}</span>
                    <input type="date" name={`mfg-${i}`} value={l.mfgDate} onChange={(e) => update(l.key, { mfgDate: e.target.value })} className={fieldClass} />
                  </label>
                  <label className="grid content-start gap-1 text-xs">
                    <span className="text-muted-foreground">{t("unitCost")}</span>
                    <input required type="number" min={0} step={1} inputMode="numeric" name={`cost-${i}`} value={l.unitCostVnd} onChange={(e) => update(l.key, { unitCostVnd: e.target.value })} className={fieldClass} />
                  </label>
                </>
              ) : (
                <label className="grid content-start gap-1 text-xs sm:col-span-2">
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

              <label className="grid content-start gap-1 text-xs">
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
              <label className="grid content-start gap-1 text-xs">
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
                  <Button type="button" variant="outline" size="lg" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                    {t("remove")}
                  </Button>
                </div>
              )}
            </fieldset>
          );
        })}
        <Button size="lg" type="button" variant="outline" onClick={() => setLines((ls) => [...ls, blank()])}>
          + {t("addLine")}
        </Button>
      </div>

      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {t("error")}: {state.error}
        </p>
      )}
      <Button size="lg" type="submit" disabled={pending}>
        {t("saveDraft")}
      </Button>
    </form>
  );
}
