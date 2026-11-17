"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Calculator, Pencil } from "lucide-react";
import { ActionForm } from "@/components/admin/action-form";
import { BatchReviewOptions } from "@/components/admin/batch-review";
import { Badge, DataTable, Td, fieldClass, fieldLabelClass } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { fmtDate, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { applyManualVndAction } from "@/server/pricing/actions";
import { priceVndManual } from "@/server/pricing/formula";
import type { ManualRate, ManualRow } from "@/server/pricing/manual";

type RowState = { sourceLineId: string; profit: string; ship: string; ctv: string };

const whole = (v: string) => (v.trim() !== "" && Number.isInteger(Number(v)) && Number(v) >= 0 ? Number(v) : null);

/**
 * Trang Giá bán — Thủ công, kho hàng nhập VN (16/11):
 *   Giá bán VND = Giá mua NCC (lần nhập chọn) + Lãi mong muốn VND
 *   Giá bán MMK = Giá bán VND ÷ tỷ giá + Vận chuyển MMK + CTV MMK, làm tròn lên theo cấu hình.
 * Tính trực tiếp trên trình duyệt bằng đúng hàm của máy chủ; khi lưu máy chủ tính lại (không nhận giá từ đây).
 * Giá cuối không sửa tay. CTV = hoa hồng cố định của SKU, có hiệu lực cùng giá khi duyệt.
 */
export function ManualVndForm({
  location,
  rows,
  rates,
  currentRateId,
  roundTo,
  canReview,
  canApprove,
}: {
  location: { id: string; code: string; name: string };
  rows: ManualRow[];
  rates: ManualRate[];
  currentRateId: string | null;
  roundTo: number;
  canReview: boolean;
  canApprove: boolean;
}) {
  const t = useTranslations("SellingPrices.manualPage");
  const [editing, setEditing] = useState<string[]>([]);
  const [rateId, setRateId] = useState(currentRateId ?? rates[0]?.id ?? "");
  const [state, setState] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(
      rows.map((r) => [
        r.variantId,
        {
          sourceLineId: r.sources[0]?.lineId ?? "",
          profit: r.lastProfitVnd != null ? String(r.lastProfitVnd) : "",
          ship: r.lastShipMmk != null ? String(r.lastShipMmk) : r.suggestedShipMmk != null ? String(r.suggestedShipMmk) : "",
          ctv: r.commission != null ? String(r.commission) : "",
        },
      ]),
    ),
  );
  const rate = rates.find((r) => r.id === rateId);
  const set = (id: string, patch: Partial<RowState>) => setState((s) => ({ ...s, [id]: { ...s[id], ...patch } }));

  const computed = useMemo(
    () =>
      rows.map((r) => {
        const st = state[r.variantId];
        const source = r.sources.find((s) => s.lineId === st.sourceLineId);
        const purchase = r.isBundle ? r.comboCostVnd : (source?.unitCostVnd ?? null);
        const profit = whole(st.profit);
        const ship = whole(st.ship);
        const ctv = whole(st.ctv);
        const ready = rate != null && purchase != null && profit != null && ship != null && ctv != null;
        const price = ready ? priceVndManual({ ...rate!, purchaseVnd: purchase!, profitVnd: profit!, shipMmk: ship!, commissionMmk: ctv!, roundTo }) : null;
        return { r, st, purchase, price, ready, changed: ready && (price !== r.price || ctv !== r.commission) };
      }),
    [rows, state, rate, roundTo],
  );
  const lines = computed
    .filter((c) => c.ready && editing.includes(c.r.variantId))
    .map((c) => ({
      variantId: c.r.variantId,
      ...(c.r.isBundle ? {} : { sourceLineId: c.st.sourceLineId }),
      profitVnd: whole(c.st.profit),
      shipMmk: whole(c.st.ship),
      commissionMmk: whole(c.st.ctv),
      expectedPriceMmk: c.r.price,
      expectedCommissionMmk: c.r.commission ?? "",
    }));
  const payload = JSON.stringify({ locationId: location.id, rateId, lines });
  const changedCount = computed.filter((c) => c.changed && editing.includes(c.r.variantId)).length;

  return (
    <ActionForm action={applyManualVndAction} submitLabel={t("save", { count: changedCount })} icon={<Calculator aria-hidden />} className="space-y-4">
      <input type="hidden" name="payload" value={payload} />
      <div className="flex flex-wrap items-end gap-4">
        <label className={fieldLabelClass}>
          <span className="text-muted-foreground">{t("rate")}</span>
          <select value={rateId} onChange={(e) => setRateId(e.target.value)} className={cn(fieldClass, "w-auto min-w-64")} data-testid="manual-rate">
            {rates.map((r) => (
              <option key={r.id} value={r.id}>
                {t("rateOption", { vnd: r.vndPerMmk, date: fmtDate(new Date(r.effectiveAt)) })}
                {r.current ? ` · ${t("rateCurrent")}` : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      {rate && !rate.current && <Notice tone="warning">{t("oldRate")}</Notice>}
      {/* Hướng dẫn dài (công thức, ý nghĩa lãi, lô nguồn) gom vào phần mở rộng — bảng chỉ còn cột cần thao tác. */}
      <details className="text-sm text-muted-foreground" data-testid="manual-help">
        <summary className="cursor-pointer select-none">{t("howTo")}</summary>
        <p className="mt-1">{t("formula", { round: fmtInt(roundTo) })}</p>
        <p className="mt-1">{t("profitNote")}</p>
      </details>
      <DataTable
        stack
        dense
        tableClassName="md:table-fixed [&_th]:whitespace-normal [&_th]:align-bottom"
        numeric={[1, 2, 3, 4, 5]}
        head={[t("colProduct"), t("colPurchase"), t("colProfit"), t("colShip"), t("colCtv"), t("colFinal"), <span key="act" className="sr-only md:not-sr-only">{t("colActions")}</span>]}
      >
        {computed.map((c) => {
          const id = c.r.variantId;
          const editable = editing.includes(id);
          const label = c.r.label && !c.r.standardLabel ? c.r.label : null;
          // Lý do chưa tính được giá (chỉ khi đang sửa) — hiện "—" thay vì 0.
          const missing = !rate ? t("missingRate") : c.purchase == null ? t("missingPurchase") : t("incomplete");
          const num = (key: "profit" | "ship" | "ctv", name: string, extra?: { id?: string }) => {
            // Chỉ báo lỗi khi đã gõ mà sai; ô trống thì lý do "Điền lãi, vận chuyển, CTV" hiện ở cột Giá bán.
            const invalid = editable && c.st[key].trim() !== "" && whole(c.st[key]) == null;
            return (
              <>
                <input
                  {...extra}
                  aria-label={`${name} ${c.r.sku}`}
                  aria-invalid={invalid || undefined}
                  aria-describedby={invalid ? `${key}-err-${id}` : undefined}
                  readOnly={!editable}
                  required={editable}
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={c.st[key]}
                  onChange={(e) => set(id, { [key]: e.target.value })}
                  className={cn(fieldClass, "text-right tabular-nums md:w-full", !editable && "bg-muted/40", invalid && "border-destructive")}
                />
                {invalid && <span id={`${key}-err-${id}`} className="mt-0.5 block text-xs text-destructive">{t("fieldInvalid")}</span>}
              </>
            );
          };
          return (
            <tr key={id} data-testid="manual-row" className={cn(c.changed && editable && "bg-primary/5")}>
              <Td className="md:w-[31%]">
                <span className="block font-medium break-words">{c.r.productName}</span>
                <span className="block text-xs break-all text-muted-foreground">
                  <span className="font-mono">{c.r.sku}</span>
                  {label && <> · {label}</>}
                </span>
                {c.r.isBundle && <Badge tone="brand">combo</Badge>}
              </Td>
              <Td label={t("colPurchase")} numeric className="md:w-[19%]">
                <div className="tabular-nums">{c.purchase != null ? fmtInt(c.purchase) : "—"}</div>
                {c.r.isBundle ? (
                  <span className="block text-xs text-muted-foreground">{t("comboLot")}</span>
                ) : c.r.sources.length === 0 ? (
                  <span className="block text-xs text-destructive">{t("noSource")}</span>
                ) : (
                  <select
                    aria-label={`${t("colLot")} ${c.r.sku}`}
                    title={t("colLot")}
                    disabled={!editable}
                    value={c.st.sourceLineId}
                    onChange={(e) => set(id, { sourceLineId: e.target.value })}
                    className={cn(fieldClass, "mt-1 w-full text-xs")}
                  >
                    {c.r.sources.map((s) => (
                      <option key={s.lineId} value={s.lineId}>
                        {t("lotOption", { lot: s.lotNo, doc: s.documentCode, date: s.postedAt ? fmtDate(new Date(s.postedAt)) : "—", price: fmtInt(s.unitCostVnd) })}
                      </option>
                    ))}
                  </select>
                )}
              </Td>
              <Td label={t("colProfit")} numeric>{num("profit", t("colProfit"), { id: `profit-${id}` })}</Td>
              <Td label={t("colShip")} numeric>{num("ship", t("colShip"))}</Td>
              <Td label={t("colCtv")} numeric>{num("ctv", t("colCtv"))}</Td>
              <Td label={t("colFinal")} numeric className="md:w-[12%]">
                {editable ? (
                  <>
                    <div className="text-base font-semibold tabular-nums" data-testid="manual-final">{c.price != null ? fmtInt(c.price) : "—"}</div>
                    {!c.ready && <div className="text-xs text-muted-foreground">{missing}</div>}
                  </>
                ) : (
                  <>
                    <div className="text-base font-semibold tabular-nums" data-testid="manual-final">{c.r.price > 0 ? fmtInt(c.r.price) : "—"}</div>
                    {c.r.price <= 0 && <div className="text-xs text-muted-foreground">{t("noPrice")}</div>}
                  </>
                )}
                {c.r.livePrice > 0 && c.r.livePrice !== (editable ? c.price : c.r.price) && (
                  <div className="text-xs text-muted-foreground">{t("live", { price: fmtInt(c.r.livePrice) })}</div>
                )}
                {c.r.pending && <div className="text-xs text-warning">{t("pending", { price: fmtInt(c.r.price) })}</div>}
              </Td>
              <Td label={t("colActions")} className="md:w-16">
                <Button
                  type="button"
                  size="icon-lg"
                  variant={editable ? "secondary" : "outline"}
                  aria-label={`${t("editPrice")} ${c.r.sku}`}
                  aria-pressed={editable}
                  title={t("editPrice")}
                  onClick={() => {
                    setEditing((ids) => (ids.includes(id) ? ids : [...ids, id]));
                    // Ô lãi vừa bỏ readOnly ở lần render sau → focus sau khi React cập nhật.
                    requestAnimationFrame(() => document.getElementById(`profit-${id}`)?.focus());
                  }}
                >
                  <Pencil aria-hidden className="size-4" />
                </Button>
              </Td>
            </tr>
          );
        })}
      </DataTable>
      {canReview && <BatchReviewOptions canApprove={canApprove} compact />}
    </ActionForm>
  );
}
