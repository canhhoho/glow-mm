"use client";

import { Plus, Trash2 } from "lucide-react";
import { memo, startTransition, useActionState, useCallback, useMemo, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/admin/ui";
import { fmtInt } from "@/lib/format";
import { parseReceivePaste } from "@/lib/receive-paste";
import { cn } from "@/lib/utils";
import { createDocumentAction } from "@/server/inventory/actions";
import type { ReceiveVariant } from "@/server/inventory/queries";

type StockType = "SELLABLE" | "TESTER";
type ExpiryStatus = "DATED" | "NONE" | "UNKNOWN";

type Row = {
  key: number;
  variantId: string;
  /** Dòng tách thêm (lô thứ 2…) — được xoá. */
  split: boolean;
  qty: string;
  lotNo: string;
  expiryStatus: ExpiryStatus;
  expiryDate: string;
  mfgDate: string;
  /** Giá mua theo loại tiền của kho SP (VND hoặc MMK, P24). */
  unitCost: string;
  /** "" = theo giá trị chung. */
  stockType: StockType | "";
};

type Defaults = { lotNo: string; expiryDate: string; mfgDate: string; stockType: StockType };

/** `key` ổn định: dòng gốc = chỉ số biến thể (server/client trùng nhau → không lệch hydration); dòng tách = bộ đếm riêng của form. */
const newRow = (v: ReceiveVariant, key: number, split = false): Row => ({
  key,
  variantId: v.id,
  split,
  qty: "",
  lotNo: "",
  expiryStatus: v.requiresExpiry ? "DATED" : "NONE",
  expiryDate: "",
  mfgDate: "",
  unitCost: v.lastCost == null ? "" : String(v.lastCost),
  stockType: "",
});

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
const hasQty = (r: Row) => Number(r.qty) > 0;

/** Giá trị thực của dòng sau khi áp giá trị chung. */
function effective(r: Row, d: Defaults) {
  return {
    lotNo: r.lotNo.trim() || d.lotNo.trim(),
    expiryDate: r.expiryStatus === "DATED" ? r.expiryDate || d.expiryDate : "",
    mfgDate: r.mfgDate || d.mfgDate,
    stockType: r.stockType || d.stockType,
  };
}

function rowInvalid(r: Row, d: Defaults) {
  const e = effective(r, d);
  return !Number.isInteger(Number(r.qty)) || !e.lotNo || r.unitCost.trim() === "" || Number(r.unitCost) < 0 || (r.expiryStatus === "DATED" && !e.expiryDate);
}

type Location = { id: string; code: string; name: string; sellable: boolean; pricingMode: "VN_IMPORT" | "LOCAL_MMK" | null };

/** Phiếu nhập nhiều SP: bảng mọi biến thể, chỉ dòng có SL > 0 vào phiếu; dán từ Excel để điền nhanh. */
export function ReceiveBulkForm({ locations, shipments, variants, lastShip = null }: { locations: Location[]; shipments: { id: string; code: string }[]; variants: ReceiveVariant[]; lastShip?: number | null }) {
  const t = useTranslations("Docs");
  const ti = useTranslations("Inventory");
  const [state, action, pending] = useActionState(createDocumentAction, undefined);
  const byId = useMemo(() => new Map(variants.map((v) => [v.id, v])), [variants]);
  const bySku = useMemo(() => new Map(variants.map((v) => [v.sku, v])), [variants]);

  const [toId, setToId] = useState("");
  const [shipmentId, setShipmentId] = useState("");
  const [estimatedShip, setEstimatedShip] = useState(lastShip == null ? "" : String(lastShip));
  const [reason, setReason] = useState("");
  const [defaults, setDefaults] = useState<Defaults>({ lotNo: "", expiryDate: "", mfgDate: "", stockType: "SELLABLE" });
  const [rows, setRows] = useState<Row[]>(() => variants.map((v, i) => newRow(v, i)));
  const nextKey = useRef(variants.length);
  const [q, setQ] = useState("");
  const [brand, setBrand] = useState("");
  const [onlyFilled, setOnlyFilled] = useState(false);
  const [invalid, setInvalid] = useState<Set<number>>(new Set());
  const [clientError, setClientError] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteMsg, setPasteMsg] = useState<{ filled: number; errors: string[] } | null>(null);

  const brands = useMemo(() => [...new Set(variants.map((v) => v.brand))].sort((a, b) => a.localeCompare(b)), [variants]);

  const update = useCallback((key: number, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setInvalid((s) => (s.has(key) ? new Set([...s].filter((k) => k !== key)) : s));
  }, []);

  const split = useCallback(
    (key: number) =>
      setRows((rs) => {
        const i = rs.findIndex((r) => r.key === key);
        const v = byId.get(rs[i].variantId)!;
        let end = i;
        while (end + 1 < rs.length && rs[end + 1].variantId === v.id) end++;
        return [...rs.slice(0, end + 1), { ...newRow(v, nextKey.current++, true), unitCost: rs[i].unitCost }, ...rs.slice(end + 1)];
      }),
    [byId],
  );
  const remove = useCallback((key: number) => setRows((rs) => rs.filter((r) => r.key !== key)), []);

  // P24: nhập vào kho bán → chỉ SP thuộc kho đó (server cũng chặn). Chưa chọn kho → chưa hiện bảng.
  const toLoc = locations.find((l) => l.id === toId);
  const inScope = useCallback((v: ReceiveVariant) => !!toLoc && (!toLoc.sellable || v.stockLocationId === toLoc.id), [toLoc]);

  const visible = useMemo(() => {
    const needle = fold(q.trim());
    return rows.filter((r) => {
      if (onlyFilled && !hasQty(r)) return false;
      const v = byId.get(r.variantId)!;
      if (!inScope(v)) return false;
      if (brand && v.brand !== brand) return false;
      return !needle || fold(`${v.sku} ${v.name} ${v.label} ${v.brand}`).includes(needle);
    });
  }, [rows, q, brand, onlyFilled, byId, inScope]);

  const filled = rows.filter((r) => hasQty(r) && inScope(byId.get(r.variantId)!));
  const canUseShipment = (!!toLoc && toLoc.sellable && toLoc.pricingMode !== "LOCAL_MMK") || (!!toLoc && !toLoc.sellable && filled.length > 0 && filled.every((r) => byId.get(r.variantId)!.currency === "VND"));
  const totalQty = filled.reduce((s, r) => s + Number(r.qty), 0);
  // Tổng tiền theo loại tiền (khu chờ kiểm tra có thể nhận cả SP Kho Thắm (VND) lẫn Kho Chi (MMK)).
  const totals = filled.reduce<Record<string, number>>((m, r) => {
    const c = byId.get(r.variantId)!.currency;
    m[c] = (m[c] ?? 0) + Number(r.qty) * (Number(r.unitCost) || 0);
    return m;
  }, {});
  const money = Object.entries(totals).map(([c, v]) => `${fmtInt(v)} ${c}`).join(" + ") || "0";

  const applyPaste = () => {
    const scoped = variants.filter(inScope).map((v) => v.sku);
    const known = new Set(variants.map((v) => v.sku.toUpperCase()));
    const { rows: pasted, errors } = parseReceivePaste(pasteText, scoped);
    setRows((rs) => {
      const next = [...rs];
      for (const p of pasted) {
        const v = bySku.get(p.sku)!;
        const patch: Partial<Row> = {
          qty: String(p.qty),
          lotNo: p.lotNo,
          mfgDate: p.mfgDate,
          ...(v.requiresExpiry && { expiryStatus: "DATED" as const, expiryDate: p.expiryDate }),
          ...(p.unitCostVnd != null && { unitCost: String(p.unitCostVnd) }),
          ...(p.stockType && { stockType: p.stockType }),
        };
        // Ghi vào dòng trống (hoặc cùng lô) của SKU; hết thì tách thêm dòng.
        const target = next.findIndex((r) => r.variantId === v.id && (!hasQty(r) || (r.lotNo && r.lotNo === p.lotNo)));
        if (target >= 0) next[target] = { ...next[target], ...patch };
        else {
          let end = next.findLastIndex((r) => r.variantId === v.id);
          if (end < 0) end = next.length - 1;
          next.splice(end + 1, 0, { ...newRow(v, nextKey.current++, true), ...patch });
        }
      }
      return next;
    });
    setPasteMsg({
      filled: pasted.length,
      errors: errors.map((e) =>
        // SKU có nhưng thuộc kho khác → báo rõ thay vì "không có SKU".
        e.code === "sku" && known.has((e.value ?? "").toUpperCase())
          ? t("pasteErr.otherWarehouse", { line: e.line, value: e.value ?? "", warehouse: toLoc?.name ?? "" })
          : t(`pasteErr.${e.code}`, { line: e.line, value: e.value ?? "" }),
      ),
    });
    if (pasted.length) {
      setOnlyFilled(true);
      setQ("");
      setBrand("");
      if (errors.length === 0) {
        setPasteText("");
        setPasteOpen(false);
      }
    }
  };

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setClientError("");
    if (filled.length === 0) return setClientError(t("noLines"));
    const bad = filled.filter((r) => rowInvalid(r, defaults));
    if (bad.length) {
      setInvalid(new Set(bad.map((r) => r.key)));
      setClientError(t("lineMissing", { count: bad.length }));
      setOnlyFilled(true);
      setQ("");
      setBrand("");
      requestAnimationFrame(() => document.getElementById(`rcv-${bad[0].key}`)?.scrollIntoView({ block: "center" }));
      return;
    }
    const payload = {
      type: "RECEIVE",
      toId,
      shipmentId: canUseShipment ? shipmentId || undefined : undefined,
      estimatedShipMmkPerKg: variants.some((v) => inScope(v) && v.currency === "VND") ? estimatedShip : undefined,
      reason: reason || undefined,
      lines: filled.map((r) => {
        const eff = effective(r, defaults);
        return {
          variantId: r.variantId,
          lotNo: eff.lotNo,
          expiryStatus: r.expiryStatus,
          expiryDate: eff.expiryDate || undefined,
          mfgDate: eff.mfgDate || undefined,
          ...(byId.get(r.variantId)!.currency === "MMK" ? { unitCostMmk: r.unitCost.trim() } : { unitCostVnd: r.unitCost.trim() }),
          qty: r.qty,
          stockType: eff.stockType,
        };
      }),
    };
    const fd = new FormData();
    fd.set("payload", JSON.stringify(payload));
    startTransition(() => action(fd));
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid content-start gap-1 text-sm">
          <span className="text-muted-foreground">{t("chooseTo")}</span>
          <select required value={toId} onChange={(e) => setToId(e.target.value)} className={fieldClass}>
            <option value="">—</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code} — {l.name}
              </option>
            ))}
          </select>
        </label>
        {canUseShipment && <label className="grid content-start gap-1 text-sm">
          <span className="text-muted-foreground">{t("shipment")}</span>
          <select value={shipmentId} onChange={(e) => setShipmentId(e.target.value)} className={fieldClass}>
            <option value="">{t("none")}</option>
            {shipments.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code}
              </option>
            ))}
          </select>
        </label>}
        <label className="grid content-start gap-1 text-sm">
          <span className="text-muted-foreground">{t("reason")}</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className={fieldClass} />
        </label>
      </div>

      <fieldset className="space-y-2 rounded-lg border p-3">
        <legend className="px-1 text-sm font-medium">{t("defaults")}</legend>
        <p className="text-xs text-muted-foreground">{t("defaultsHelp")}</p>
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="grid content-start gap-1 text-xs">
            <span className="text-muted-foreground">{t("defaultLot")}</span>
            <input value={defaults.lotNo} maxLength={50} onChange={(e) => setDefaults((d) => ({ ...d, lotNo: e.target.value }))} className={fieldClass} />
          </label>
          <label className="grid content-start gap-1 text-xs">
            <span className="text-muted-foreground">{t("defaultExpiry")}</span>
            <input type="date" value={defaults.expiryDate} onChange={(e) => setDefaults((d) => ({ ...d, expiryDate: e.target.value }))} className={fieldClass} />
          </label>
          <label className="grid content-start gap-1 text-xs">
            <span className="text-muted-foreground">{t("defaultMfg")}</span>
            <input type="date" value={defaults.mfgDate} onChange={(e) => setDefaults((d) => ({ ...d, mfgDate: e.target.value }))} className={fieldClass} />
          </label>
          <label className="grid content-start gap-1 text-xs">
            <span className="text-muted-foreground">{t("defaultStockType")}</span>
            <select value={defaults.stockType} onChange={(e) => setDefaults((d) => ({ ...d, stockType: e.target.value as StockType }))} className={fieldClass}>
              <option value="SELLABLE">{ti("SELLABLE")}</option>
              <option value="TESTER">{ti("TESTER")}</option>
            </select>
          </label>
        </div>
      </fieldset>

      {variants.some((v) => inScope(v) && v.currency === "VND") && (
        <label className="grid max-w-xl gap-1 text-sm">
          <span>{t("estimateShip")}</span>
          <input type="number" min={0} max={2147483647} step={1} value={estimatedShip} onChange={(e) => setEstimatedShip(e.target.value)} className={fieldClass} />
          <span className="text-xs text-muted-foreground">{t("estimateHelp")}</span>
        </label>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchVariant")} aria-label={t("searchVariant")} className={cn(fieldClass, "w-full sm:w-72")} />
          <select value={brand} onChange={(e) => setBrand(e.target.value)} aria-label={t("filterBrand")} className={cn(fieldClass, "w-auto")}>
            <option value="">{t("allBrands")}</option>
            {brands.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={onlyFilled} onChange={(e) => setOnlyFilled(e.target.checked)} className="size-4 accent-primary" />
            {t("onlyFilled")}
          </label>
          <Button type="button" variant="outline" size="lg" className="ml-auto" onClick={() => setPasteOpen((o) => !o)} aria-expanded={pasteOpen}>
            {t("paste")}
          </Button>
        </div>

        {pasteOpen && (
          <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">{t("pasteHelp")}</p>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={6}
              aria-label={t("paste")}
              placeholder={"KC-001\t10\tL2401\t31/12/2028\t90000"}
              className={cn(fieldClass, "h-auto py-2 font-mono text-xs")}
            />
            <Button type="button" size="lg" onClick={applyPaste} disabled={!pasteText.trim()}>
              {t("pasteApply")}
            </Button>
          </div>
        )}
        {pasteMsg && (
          <div role="status" className="space-y-1 text-sm">
            <p className="text-emerald-700 dark:text-emerald-400">{t("pasteDone", { count: pasteMsg.filled })}</p>
            {pasteMsg.errors.length > 0 && (
              <ul className="list-inside list-disc text-destructive">
                {pasteMsg.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm max-md:block max-md:[&_tbody]:block max-md:[&_tr]:grid max-md:[&_tr]:grid-cols-2 max-md:[&_tr]:gap-2 max-md:[&_tr]:p-3 max-md:[&_td]:p-0">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground max-md:hidden">
            <tr>
              <th className="px-2 py-2 font-medium">{t("variant")}</th>
              <th className="w-24 px-2 py-2 font-medium">{t("qty")}</th>
              <th className="px-2 py-2 font-medium">{t("lotNo")}</th>
              <th className="px-2 py-2 font-medium">{t("expiry")}</th>
              <th className="px-2 py-2 font-medium">{t("mfg")}</th>
              <th className="px-2 py-2 font-medium">{toLoc?.pricingMode === "LOCAL_MMK" ? t("unitCostMmk") : toLoc && !toLoc.sellable ? t("unitCostAny") : t("unitCost")}</th>
              <th className="px-2 py-2 font-medium">{t("stockType")}</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                  {toLoc ? t("noMatch") : t("chooseWarehouseFirst")}
                </td>
              </tr>
            ) : (
              visible.map((r) => (
                <ReceiveRow key={r.key} row={r} variant={byId.get(r.variantId)!} defaults={defaults} invalid={invalid.has(r.key)} onChange={update} onSplit={split} onRemove={remove} />
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t bg-background py-3">
        <Button size="lg" type="submit" disabled={pending}><Plus aria-hidden className="size-4 shrink-0" /> {t("saveDraft")}</Button>
        <span className="text-sm text-muted-foreground" aria-live="polite">
          {t("summary", { lines: filled.length, qty: fmtInt(totalQty), money })}
        </span>
        {(clientError || state?.error) && (
          <p role="alert" className="w-full text-sm text-destructive">
            {t("error")}: {clientError || state?.error}
          </p>
        )}
      </div>
    </form>
  );
}

const cell = "px-2 py-1.5 align-top";
const small = cn(fieldClass, "h-8 text-xs");

/** Nhãn ô chỉ hiện trên điện thoại (bảng xếp thành thẻ, không có hàng tiêu đề). Ẩn với trình đọc màn hình vì ô đã có aria-label. */
function Cap({ children }: { children: React.ReactNode }) {
  return (
    <span aria-hidden className="mb-0.5 block text-[11px] text-muted-foreground md:hidden">
      {children}
    </span>
  );
}

const ReceiveRow = memo(function ReceiveRow({
  row: r,
  variant: v,
  defaults: d,
  invalid,
  onChange,
  onSplit,
  onRemove,
}: {
  row: Row;
  variant: ReceiveVariant;
  defaults: Defaults;
  invalid: boolean;
  onChange: (key: number, patch: Partial<Row>) => void;
  onSplit: (key: number) => void;
  onRemove: (key: number) => void;
}) {
  const t = useTranslations("Docs");
  const ti = useTranslations("Inventory");
  const filled = hasQty(r);
  const label = (field: string) => `${field} ${v.sku}`;
  const costLabel = v.currency === "MMK" ? t("unitCostMmk") : t("unitCost");
  return (
    <tr id={`rcv-${r.key}`} className={cn(filled && "bg-primary/5", invalid && "bg-destructive/10")}>
      <td className={cn(cell, "min-w-48 max-md:col-span-2")}>
        <div className="font-mono text-xs">{v.sku}</div>
        <div className="text-xs">
          {v.name} <span className="text-muted-foreground">({v.label})</span>
        </div>
        {r.split && <div className="text-xs text-muted-foreground">{t("splitLot")}</div>}
      </td>
      <td className={cell}>
        <Cap>{t("qty")}</Cap>
        <input aria-label={label(t("qty"))} type="number" min={0} step={1} inputMode="numeric" value={r.qty} onChange={(e) => onChange(r.key, { qty: e.target.value })} className={cn(small, "w-20 font-medium")} />
      </td>
      <td className={cell}>
        <Cap>{t("lotNo")}</Cap>
        <input aria-label={label(t("lotNo"))} value={r.lotNo} maxLength={50} placeholder={d.lotNo} onChange={(e) => onChange(r.key, { lotNo: e.target.value })} className={cn(small, "min-w-24")} />
      </td>
      <td className={cn(cell, "max-md:col-span-2")}>
        <Cap>{t("expiry")}</Cap>
        {r.expiryStatus === "NONE" ? (
          <span className="text-xs text-muted-foreground">{ti("expiryNone")}</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            <select aria-label={label(t("expiryStatus"))} value={r.expiryStatus} onChange={(e) => onChange(r.key, { expiryStatus: e.target.value as ExpiryStatus, expiryDate: "" })} className={cn(small, "w-auto")}>
              <option value="DATED">{ti("expiryDated")}</option>
              <option value="UNKNOWN">{ti("expiryUnknown")}</option>
            </select>
            {r.expiryStatus === "DATED" && (
              <input aria-label={label(t("expiry"))} type="date" value={r.expiryDate || ""} title={!r.expiryDate && d.expiryDate ? d.expiryDate : undefined} onChange={(e) => onChange(r.key, { expiryDate: e.target.value })} className={cn(small, "w-36", !r.expiryDate && d.expiryDate && "text-muted-foreground")} />
            )}
          </div>
        )}
        {r.expiryStatus === "DATED" && !r.expiryDate && d.expiryDate && <div className="text-[11px] text-muted-foreground">{t("usesDefault", { value: d.expiryDate })}</div>}
      </td>
      <td className={cell}>
        <Cap>{t("mfg")}</Cap>
        <input aria-label={label(t("mfg"))} type="date" value={r.mfgDate} onChange={(e) => onChange(r.key, { mfgDate: e.target.value })} className={cn(small, "w-36 max-w-full")} />
      </td>
      <td className={cell}>
        <Cap>{costLabel}</Cap>
        <input aria-label={label(costLabel)} type="number" min={0} step={1} inputMode="numeric" value={r.unitCost} onChange={(e) => onChange(r.key, { unitCost: e.target.value })} className={cn(small, "w-28")} />
      </td>
      <td className={cell}>
        <Cap>{t("stockType")}</Cap>
        <select aria-label={label(t("stockType"))} value={r.stockType} onChange={(e) => onChange(r.key, { stockType: e.target.value as StockType | "" })} className={cn(small, "w-auto")}>
          <option value="">{t("byDefault", { value: ti(d.stockType) })}</option>
          <option value="SELLABLE">{ti("SELLABLE")}</option>
          <option value="TESTER">{ti("TESTER")}</option>
        </select>
      </td>
      <td className={cn(cell, "whitespace-nowrap max-md:col-span-2")}>
        <Button type="button" variant="outline" size="lg" onClick={() => onSplit(r.key)} title={t("splitLotHelp")}><Plus aria-hidden className="size-4 shrink-0" /> {t("addLot")}</Button>
        {r.split && (
          <Button type="button" variant="ghost" size="icon-lg" onClick={() => onRemove(r.key)} title={t("remove")} aria-label={t("remove")}><Trash2 aria-hidden className="size-4 shrink-0" /></Button>
        )}
      </td>
    </tr>
  );
});
