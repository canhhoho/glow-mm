"use client";

import { Plus, Save, Trash2 } from "lucide-react";
import { memo, startTransition, useActionState, useCallback, useMemo, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { fieldClass, fieldLabelClass, fieldLabelSmClass } from "@/components/admin/ui";
import { fmtInt } from "@/lib/format";
import { parseReceivePaste } from "@/lib/receive-paste";
import { cn } from "@/lib/utils";
import { createDocumentAction, updateDocumentAction } from "@/server/inventory/actions";
import type { ReceiveVariant } from "@/server/inventory/queries";
import { FEATURES } from "@/lib/features";

/** Biến thể với loại tiền đã chốt (SP chưa có kho lấy theo kho nhận của phiếu). */
type ResolvedVariant = ReceiveVariant & { currency: "VND" | "MMK" };

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
  /** Phí đưa về kho VND/đv (chỉ hàng VND): "" = chưa biết, "0" = đã biết không phát sinh (A3/A4 16/11). */
  inbound: string;
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
  inbound: "",
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
  const badInbound = r.inbound.trim() !== "" && !(Number.isInteger(Number(r.inbound)) && Number(r.inbound) >= 0);
  return !Number.isInteger(Number(r.qty)) || !e.lotNo || r.unitCost.trim() === "" || Number(r.unitCost) < 0 || badInbound || (r.expiryStatus === "DATED" && !e.expiryDate);
}

type Location = { id: string; code: string; name: string; sellable: boolean; pricingMode: "VN_IMPORT" | "LOCAL_MMK" | null };

/** Phiếu nhập nháp đang sửa: thông tin chung + dòng (mỗi dòng một lô của một biến thể). */
export type ReceiveDraft = {
  id: string;
  toId: string;
  shipmentId: string;
  reason: string;
  estimatedShip: string;
  lines: { variantId: string; qty: string; lotNo: string; expiryStatus: ExpiryStatus; expiryDate: string; mfgDate: string; unitCost: string; inbound: string; stockType: StockType }[];
};

/** Dòng ban đầu: mỗi biến thể một dòng trống; phiếu nháp đang sửa → điền dòng đầu, thêm dòng tách cho lô thứ 2…. */
function initialRows(variants: ReceiveVariant[], draft?: ReceiveDraft): { rows: Row[]; next: number } {
  const rows = variants.map((v, i) => newRow(v, i));
  let next = variants.length;
  if (!draft) return { rows, next };
  const index = new Map(variants.map((v, i) => [v.id, i]));
  const seen = new Set<string>();
  const extra = new Map<string, Row[]>();
  for (const l of draft.lines) {
    const i = index.get(l.variantId);
    if (i === undefined) continue; // biến thể đã ngừng dùng — bỏ qua
    const patch = { qty: l.qty, lotNo: l.lotNo, expiryStatus: l.expiryStatus, expiryDate: l.expiryDate, mfgDate: l.mfgDate, unitCost: l.unitCost, inbound: l.inbound, stockType: l.stockType };
    if (!seen.has(l.variantId)) {
      seen.add(l.variantId);
      rows[i] = { ...rows[i], ...patch };
    } else extra.set(l.variantId, [...(extra.get(l.variantId) ?? []), { ...newRow(variants[i], next++, true), ...patch }]);
  }
  return { rows: rows.flatMap((r) => (!r.split && extra.has(r.variantId) ? [r, ...extra.get(r.variantId)!] : [r])), next };
}

/**
 * Phiếu nhập hai bước: chọn SKU, sau đó nhập thông số; giữ dữ liệu khi quay lại lựa chọn.
 * `productId` (QT1b, nút "Nhập hàng" ở bước 2 trang SP): chọn sẵn các biến thể của SP + kho của SP.
 * `draft`: sửa phiếu nháp — mở thẳng bước 2 với dòng đã lưu; "Lưu nháp" cập nhật đúng phiếu đó.
 * Mỗi lần mở form một khoá chống trùng: bấm lưu 2 lần / gửi lại không tạo phiếu thứ hai.
 */
export function ReceiveBulkForm({
  locations,
  shipments,
  variants: allVariants,
  lastShip = null,
  productId,
  draft,
}: {
  locations: Location[];
  shipments: { id: string; code: string }[];
  variants: ReceiveVariant[];
  lastShip?: number | null;
  productId?: string;
  draft?: ReceiveDraft;
}) {
  const t = useTranslations("Docs");
  const ti = useTranslations("Inventory");
  const [state, action, pending] = useActionState(draft ? updateDocumentAction : createDocumentAction, undefined);
  const idempotencyKey = useRef<string | null>(null);
  const focus = productId ? allVariants.filter((v) => v.productId === productId) : [];
  const [step, setStep] = useState<1 | 2>(draft ? 2 : 1);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(draft ? draft.lines.map((l) => l.variantId) : focus.map((v) => v.id)));
  const [productFilter, setProductFilter] = useState(focus.length ? productId! : "");
  const [toId, setToId] = useState(() =>
    draft
      ? draft.toId
      : !focus.length
        ? ""
        : focus[0].stockLocationId
          ? (locations.some((l) => l.id === focus[0].stockLocationId) ? focus[0].stockLocationId : "")
          : // SP chưa có kho: gợi ý kho bán hàng nhập VN (đổi được trước khi tiếp tục).
            (locations.find((l) => l.sellable && l.pricingMode !== "LOCAL_MMK") ?? locations.find((l) => l.sellable))?.id ?? "",
  );
  const toLoc = locations.find((l) => l.id === toId);
  // SP chưa có kho (chưa nhập hàng): loại tiền theo kho nhận — kho đó thành kho bán của SP khi ghi sổ.
  const variants = useMemo(
    () => allVariants.map((v): ResolvedVariant => ({ ...v, currency: v.currency ?? (toLoc?.pricingMode === "LOCAL_MMK" ? "MMK" : "VND") })),
    [allVariants, toLoc],
  );
  const byId = useMemo(() => new Map(variants.map((v) => [v.id, v])), [variants]);
  const bySku = useMemo(() => new Map(variants.map((v) => [v.sku, v])), [variants]);
  /** Khối lượng (g) theo biến thể — chỉ cho biến thể chưa có khối lượng. */
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [shipmentId, setShipmentId] = useState(draft?.shipmentId ?? "");
  const [estimatedShip, setEstimatedShip] = useState(draft ? draft.estimatedShip : lastShip == null ? "" : String(lastShip));
  const [reason, setReason] = useState(draft?.reason ?? "");
  const [defaults, setDefaults] = useState<Defaults>({ lotNo: "", expiryDate: "", mfgDate: "", stockType: "SELLABLE" });
  const [init] = useState(() => initialRows(variants, draft));
  const [rows, setRows] = useState<Row[]>(init.rows);
  const nextKey = useRef(init.next);
  const [q, setQ] = useState("");
  const [brand, setBrand] = useState("");
  const [onlyFilled, setOnlyFilled] = useState(false);
  const [invalid, setInvalid] = useState<Set<number>>(new Set());
  const [clientError, setClientError] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteMsg, setPasteMsg] = useState<{ filled: number; errors: string[] } | null>(null);

  const brands = useMemo(() => [...new Set(variants.map((v) => v.brand))].sort((a, b) => a.localeCompare(b)), [variants]);

  const setWeight = useCallback((variantId: string, value: string) => setWeights((w) => ({ ...w, [variantId]: value })), []);

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

  // P24: nhập vào kho bán → chỉ SP thuộc kho đó hoặc SP chưa có kho (server cũng chặn). Chưa chọn kho → chưa hiện bảng.
  const inScope = useCallback((v: ReceiveVariant) => !!toLoc && (!toLoc.sellable || v.stockLocationId == null || v.stockLocationId === toLoc.id), [toLoc]);

  const visible = useMemo(() => {
    const needle = fold(q.trim());
    return rows.filter((r) => {
      if (onlyFilled && !hasQty(r)) return false;
      const v = byId.get(r.variantId)!;
      if (!inScope(v)) return false;
      if (!selected.has(v.id)) return false;
      if (brand && v.brand !== brand) return false;
      if (productFilter && v.productId !== productFilter) return false;
      return !needle || fold(`${v.sku} ${v.name} ${v.label} ${v.brand}`).includes(needle);
    });
  }, [rows, q, brand, onlyFilled, byId, inScope, productFilter, selected]);

  const selectedRows = rows.filter((r) => selected.has(r.variantId) && inScope(byId.get(r.variantId)!));
  const filled = selectedRows.filter(hasQty);
  // Chuyến hàng + "Cước tạm tính" đang tắt (`lib/features.ts`).
  const canUseShipment = FEATURES.shipments && ((!!toLoc && toLoc.sellable && toLoc.pricingMode !== "LOCAL_MMK") || (!!toLoc && !toLoc.sellable && filled.length > 0 && filled.every((r) => byId.get(r.variantId)!.currency === "VND")));
  const totalQty = filled.reduce((s, r) => s + Number(r.qty), 0);
  // Tổng tiền theo loại tiền (khu chờ kiểm tra có thể nhận cả SP Kho Thắm (VND) lẫn Kho Chi (MMK)).
  const totals = filled.reduce<Record<string, number>>((m, r) => {
    const c = byId.get(r.variantId)!.currency;
    m[c] = (m[c] ?? 0) + Number(r.qty) * (Number(r.unitCost) || 0);
    return m;
  }, {});
  const money = Object.entries(totals).map(([c, v]) => `${fmtInt(v)} ${c}`).join(" + ") || "0";

  const applyPaste = () => {
    const scoped = variants.filter((v) => inScope(v) && selected.has(v.id)).map((v) => v.sku);
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
          ...(p.expiryDate && { expiryStatus: "DATED" as const, expiryDate: p.expiryDate }),
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
          ? bySku.get((e.value ?? "").toUpperCase()) && inScope(bySku.get((e.value ?? "").toUpperCase())!)
            ? t("receivePasteNotSelected", { line: e.line, value: e.value ?? "" })
            : t("pasteErr.otherWarehouse", { line: e.line, value: e.value ?? "", warehouse: toLoc?.name ?? "" })
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
    const bad = selectedRows.filter((r) => (!r.split && !hasQty(r)) || (hasQty(r) && rowInvalid(r, defaults)));
    if (bad.length) {
      setInvalid(new Set(bad.map((r) => r.key)));
      setClientError(t("lineMissing", { count: bad.length }));
      setOnlyFilled(false);
      setQ("");
      setBrand("");
      requestAnimationFrame(() => document.getElementById(`rcv-${bad[0].key}`)?.scrollIntoView({ block: "center" }));
      return;
    }
    const payload = {
      type: "RECEIVE",
      toId,
      shipmentId: canUseShipment ? shipmentId || undefined : undefined,
      estimatedShipMmkPerKg: FEATURES.shipments && variants.some((v) => inScope(v) && v.currency === "VND") ? estimatedShip : undefined,
      reason: reason || undefined,
      lines: filled.map((r) => {
        const eff = effective(r, defaults);
        return {
          variantId: r.variantId,
          lotNo: eff.lotNo,
          expiryStatus: r.expiryStatus,
          expiryDate: eff.expiryDate || undefined,
          mfgDate: eff.mfgDate || undefined,
          ...(byId.get(r.variantId)!.currency === "MMK"
            ? { unitCostMmk: r.unitCost.trim() }
            : {
                unitCostVnd: r.unitCost.trim(),
                // Phí về kho đã biết (kể cả 0) → giá vốn thực tế = giá mua + phí; trống = chưa biết, không gửi.
                ...(r.inbound.trim() !== "" && { landedCostVnd: String(Number(r.unitCost) + Number(r.inbound)) }),
              }),
          qty: r.qty,
          stockType: eff.stockType,
        };
      }),
      weights: [...new Set(filled.map((r) => r.variantId))]
        .filter((id) => !byId.get(id)!.weightGrams && Number(weights[id]) > 0)
        .map((id) => ({ variantId: id, weightGrams: weights[id] })),
    };
    // Khoá chống trùng sinh một lần cho form này (gửi lại sau lỗi dùng lại khoá — server trả phiếu đã tạo nếu có).
    idempotencyKey.current ??= crypto.randomUUID();
    const fd = new FormData();
    fd.set("payload", JSON.stringify(draft ? payload : { ...payload, idempotencyKey: idempotencyKey.current }));
    if (draft) fd.set("id", draft.id);
    startTransition(() => action(fd));
  };

  const chooseStep = () => {
    setQ("");
    setBrand("");
    setOnlyFilled(false);
    setClientError("");
    setStep(1);
  };

  if (step === 1) {
    const needle = fold(q.trim());
    const choices = variants.filter((v) => (!toLoc || inScope(v)) && (!brand || v.brand === brand) && (!productFilter || v.productId === productFilter) && (!needle || fold(`${v.sku} ${v.name} ${v.label} ${v.brand}`).includes(needle)));
    const toggle = (id: string, checked: boolean) => setSelected((s) => {
      const next = new Set(s);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
    const count = variants.filter((v) => selected.has(v.id) && (!toLoc || inScope(v))).length;
    return <div className="space-y-4" data-testid="receive-selection">
      <h2 className="font-medium">{t("receiveSelectStep")}</h2>
      <p className="text-sm text-muted-foreground">{t("receiveSelectHelp")}</p>
      <label className={cn(fieldLabelClass, "max-w-xl")}>
        <span>{t("chooseTo")}</span>
        <select value={toId} onChange={(e) => {
          const id = e.target.value;
          const loc = locations.find((l) => l.id === id);
          setToId(id);
          if (loc?.sellable) setSelected((s) => new Set([...s].filter((vid) => { const w = byId.get(vid)?.stockLocationId; return w == null || w === id; })));
        }} className={fieldClass}>
          <option value="">—</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}
        </select>
      </label>
      {productFilter && focus.length > 0 && <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="receive-product-scope">
        <span>{t("productScope", { name: focus[0].name })}</span>
        <Button type="button" variant="outline" size="lg" onClick={() => setProductFilter("")}>{t("showAllProducts")}</Button>
      </div>}
      <div className="flex flex-wrap items-center gap-2">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("searchVariant")} placeholder={t("searchVariant")} className={cn(fieldClass, "w-full sm:w-72")} />
        <select value={brand} onChange={(e) => setBrand(e.target.value)} aria-label={t("filterBrand")} className={cn(fieldClass, "w-auto")}>
          <option value="">{t("allBrands")}</option>
          {brands.map((b) => <option key={b}>{b}</option>)}
        </select>
        <Button type="button" variant="outline" size="lg" disabled={!choices.length} onClick={() => setSelected((s) => new Set([...s, ...choices.map((v) => v.id)]))}>{t("receiveSelectAll")}</Button>
        <Button type="button" variant="outline" size="lg" disabled={!selected.size} onClick={() => setSelected(new Set())}>{t("receiveClearSelection")}</Button>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2 font-medium">{t("receiveChoose")}</th><th className="px-3 py-2 font-medium">{t("variant")}</th><th className="px-3 py-2 font-medium">{t("filterBrand")}</th></tr></thead>
          <tbody className="divide-y">
            {choices.map((v) => <tr key={v.id} className={cn(selected.has(v.id) && "bg-primary/5")}>
              <td className="px-3 py-2"><input id={`receive-pick-${v.id}`} type="checkbox" aria-label={`${t("receiveChoose")} ${v.sku}`} checked={selected.has(v.id)} onChange={(e) => toggle(v.id, e.target.checked)} className="size-4 accent-primary" /></td>
              <td className="px-3 py-2"><label htmlFor={`receive-pick-${v.id}`} className="block cursor-pointer"><span className="font-mono text-xs">{v.sku}</span><span className="block">{v.name} <span className="text-muted-foreground">({v.label})</span></span></label></td>
              <td className="px-3 py-2">{v.brand}</td>
            </tr>)}
            {!choices.length && <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">{t("noMatch")}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t bg-background py-3">
        <span role="status" className="text-sm">{t("receiveSelectedCount", { count })}</span>
        <Button type="button" size="lg" disabled={!toLoc || !count} onClick={() => { setQ(""); setBrand(""); setProductFilter(""); setOnlyFilled(false); setStep(2); }}>{t("receiveNext")}</Button>
        {!toLoc && <p className="text-sm text-muted-foreground">{t("chooseWarehouseFirst")}</p>}
      </div>
    </div>;
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-medium">{t("receiveDetailsStep")}</h2>
        <Button type="button" variant="outline" size="lg" onClick={chooseStep} disabled={pending}>{t("receiveBack")}</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={fieldLabelClass}>
          <span className="text-muted-foreground">{t("chooseTo")}</span>
          <select required disabled value={toId} className={fieldClass}>
            <option value="">—</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code} — {l.name}
              </option>
            ))}
          </select>
        </label>
        {canUseShipment && <label className={fieldLabelClass}>
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
        <label className={fieldLabelClass}>
          <span className="text-muted-foreground">{t("reason")}</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className={fieldClass} />
        </label>
      </div>

      <fieldset className="space-y-2 rounded-lg border p-3">
        <legend className="px-1 text-sm font-medium">{t("defaults")}</legend>
        <p className="text-xs text-muted-foreground">{t("defaultsHelp")}</p>
        <div className="grid gap-3 sm:grid-cols-4">
          <label className={fieldLabelSmClass}>
            <span className="text-muted-foreground">{t("defaultLot")}</span>
            <input value={defaults.lotNo} maxLength={50} onChange={(e) => setDefaults((d) => ({ ...d, lotNo: e.target.value }))} className={fieldClass} />
          </label>
          <label className={fieldLabelSmClass}>
            <span className="text-muted-foreground">{t("defaultExpiry")}</span>
            <input type="date" value={defaults.expiryDate} onChange={(e) => setDefaults((d) => ({ ...d, expiryDate: e.target.value }))} className={fieldClass} />
          </label>
          <label className={fieldLabelSmClass}>
            <span className="text-muted-foreground">{t("defaultMfg")}</span>
            <input type="date" value={defaults.mfgDate} onChange={(e) => setDefaults((d) => ({ ...d, mfgDate: e.target.value }))} className={fieldClass} />
          </label>
          <label className={fieldLabelSmClass}>
            <span className="text-muted-foreground">{t("defaultStockType")}</span>
            <select value={defaults.stockType} onChange={(e) => setDefaults((d) => ({ ...d, stockType: e.target.value as StockType }))} className={fieldClass}>
              <option value="SELLABLE">{ti("SELLABLE")}</option>
              <option value="TESTER">{ti("TESTER")}</option>
            </select>
          </label>
        </div>
      </fieldset>

      {FEATURES.shipments && variants.some((v) => inScope(v) && v.currency === "VND") && (
        <label className={cn(fieldLabelClass, "max-w-xl")}>
          <span>{t("estimateShip")}</span>
          <input type="number" min={0} max={2147483647} step={1} value={estimatedShip} onChange={(e) => setEstimatedShip(e.target.value)} className={fieldClass} />
          <span className="text-xs text-muted-foreground">{t("estimateHelp")}</span>
        </label>
      )}

      {productFilter && focus.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm" data-testid="receive-product-scope">
          <span>{t("productScope", { name: focus[0].name })}</span>
          <Button type="button" variant="outline" size="lg" onClick={() => setProductFilter("")}>
            {t("showAllProducts")}
          </Button>
        </div>
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
            <p className="text-success">{t("pasteDone", { count: pasteMsg.filled })}</p>
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

      <div className="overflow-x-auto rounded-xl border bg-card">
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
              <th className="px-2 py-2 font-medium">{t("weightGrams")}</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                  {toLoc ? t("noMatch") : t("chooseWarehouseFirst")}
                </td>
              </tr>
            ) : (
              visible.map((r) => (
                <ReceiveRow
                  key={r.key}
                  row={r}
                  variant={byId.get(r.variantId)!}
                  defaults={defaults}
                  invalid={invalid.has(r.key)}
                  weight={weights[r.variantId] ?? ""}
                  onWeight={setWeight}
                  onChange={update}
                  onSplit={split}
                  onRemove={remove}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t bg-background py-3">
        <Button size="lg" type="submit" disabled={pending}><Save aria-hidden /> {t("saveDraft")}</Button>
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
const small = cn(fieldClass, "text-xs");

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
  weight,
  onWeight,
  onChange,
  onSplit,
  onRemove,
}: {
  row: Row;
  variant: ResolvedVariant;
  defaults: Defaults;
  invalid: boolean;
  weight: string;
  onWeight: (variantId: string, value: string) => void;
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
        {/* 16/11/2026: hạn dùng chọn theo lô — Có ngày / Chưa biết hạn / Không có hạn (túi, phụ kiện…). */}
        {(
          <div className="flex flex-wrap gap-1">
            <select aria-label={label(t("expiryStatus"))} value={r.expiryStatus} onChange={(e) => onChange(r.key, { expiryStatus: e.target.value as ExpiryStatus, expiryDate: "" })} className={cn(small, "w-auto")}>
              <option value="DATED">{ti("expiryDated")}</option>
              <option value="UNKNOWN">{ti("expiryUnknown")}</option>
              <option value="NONE">{ti("expiryNone")}</option>
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
        {v.currency === "VND" && (
          <input
            aria-label={label(t("inboundFee"))}
            title={t("inboundFeeHint")}
            placeholder={t("inboundFee")}
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={r.inbound}
            onChange={(e) => onChange(r.key, { inbound: e.target.value })}
            className={cn(small, "mt-1 w-28")}
          />
        )}
      </td>
      <td className={cell}>
        <Cap>{t("stockType")}</Cap>
        <select aria-label={label(t("stockType"))} value={r.stockType} onChange={(e) => onChange(r.key, { stockType: e.target.value as StockType | "" })} className={cn(small, "w-auto")}>
          <option value="">{t("byDefault", { value: ti(d.stockType) })}</option>
          <option value="SELLABLE">{ti("SELLABLE")}</option>
          <option value="TESTER">{ti("TESTER")}</option>
        </select>
      </td>
      <td className={cell}>
        <Cap>{t("weightGrams")}</Cap>
        {v.weightGrams ? (
          <span className="text-xs text-muted-foreground tabular-nums">{v.weightGrams} g</span>
        ) : r.split ? null : (
          <input aria-label={label(t("weightGrams"))} type="number" min={1} max={100000} step={1} inputMode="numeric" value={weight} onChange={(e) => onWeight(v.id, e.target.value)} className={cn(small, "w-20")} />
        )}
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
