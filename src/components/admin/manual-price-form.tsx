"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Calculator } from "lucide-react";
import { ActionForm } from "@/components/admin/action-form";
import { BatchReviewOptions } from "@/components/admin/batch-review";
import { Badge, DataTable, Td, fieldClass, fieldLabelClass } from "@/components/admin/ui";
import { Notice } from "@/components/ui/notice";
import { fmtDate, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { applyManualVndAction } from "@/server/pricing/actions";
import { convertVndToMmk, priceVndManual } from "@/server/pricing/formula";
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
        const sellVnd = purchase != null && profit != null ? purchase + profit : null;
        const sellMmk = rate && sellVnd != null ? convertVndToMmk(sellVnd, rate) : null;
        const price = ready ? priceVndManual({ ...rate!, purchaseVnd: purchase!, profitVnd: profit!, shipMmk: ship!, commissionMmk: ctv!, roundTo }) : null;
        return { r, st, purchase, sellVnd, sellMmk, price, ready, changed: ready && (price !== r.price || ctv !== r.commission) };
      }),
    [rows, state, rate, roundTo],
  );
  const lines = computed
    .filter((c) => c.ready)
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
  const changedCount = computed.filter((c) => c.changed).length;

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
        <p className="text-sm text-muted-foreground" data-testid="manual-formula">{t("formula", { round: fmtInt(roundTo) })}</p>
      </div>
      {rate && !rate.current && <Notice tone="warning">{t("oldRate")}</Notice>}
      <Notice tone="info">{t("profitNote")}</Notice>
      <DataTable
        stack
        dense
        tableClassName="[&_th]:whitespace-normal [&_th]:align-bottom"
        numeric={[2, 4, 7]}
        head={[t("colSku"), t("colLot"), t("colPurchase"), t("colProfit"), t("colSellVnd"), t("colShip"), t("colCtv"), t("colFinal")]}
      >
        {computed.map((c) => (
          <tr key={c.r.variantId} data-testid="manual-row" className={cn(c.changed && "bg-primary/5")}>
            <Td className="min-w-36 align-top">
              <div className="font-mono text-xs">{c.r.sku}</div>
              <div className="text-xs">
                {c.r.productName} <span className="text-muted-foreground">({c.r.label})</span>
              </div>
              {c.r.isBundle && <Badge tone="brand">combo</Badge>}
            </Td>
            <Td label={t("colLot")} className="align-top">
              {c.r.isBundle ? (
                <span className="text-xs text-muted-foreground">{t("comboLot")}</span>
              ) : c.r.sources.length === 0 ? (
                <span className="text-xs text-destructive">{t("noSource")}</span>
              ) : (
                <select
                  aria-label={`${t("colLot")} ${c.r.sku}`}
                  value={c.st.sourceLineId}
                  onChange={(e) => set(c.r.variantId, { sourceLineId: e.target.value })}
                  className={cn(fieldClass, "w-auto max-w-44 text-xs")}
                >
                  {c.r.sources.map((s) => (
                    <option key={s.lineId} value={s.lineId}>
                      {t("lotOption", { lot: s.lotNo, doc: s.documentCode, date: s.postedAt ? fmtDate(new Date(s.postedAt)) : "—", price: fmtInt(s.unitCostVnd) })}
                    </option>
                  ))}
                </select>
              )}
            </Td>
            <Td label={t("colPurchase")} className="align-top tabular-nums md:text-right">{c.purchase != null ? fmtInt(c.purchase) : "—"}</Td>
            <Td label={t("colProfit")} className="align-top">
              <input aria-label={`${t("colProfit")} ${c.r.sku}`} type="number" min={0} step={1} inputMode="numeric" value={c.st.profit} onChange={(e) => set(c.r.variantId, { profit: e.target.value })} className={cn(fieldClass, "w-24")} />
            </Td>
            <Td label={t("colSellVnd")} className="align-top tabular-nums md:text-right">
              {c.sellVnd != null ? fmtInt(c.sellVnd) : "—"}
              {c.sellMmk != null && <div className="text-xs text-muted-foreground">≈ {fmtInt(c.sellMmk)} MMK</div>}
            </Td>
            <Td label={t("colShip")} className="align-top">
              <input aria-label={`${t("colShip")} ${c.r.sku}`} type="number" min={0} step={1} inputMode="numeric" value={c.st.ship} onChange={(e) => set(c.r.variantId, { ship: e.target.value })} className={cn(fieldClass, "w-20")} />
            </Td>
            <Td label={t("colCtv")} className="align-top">
              <input aria-label={`${t("colCtv")} ${c.r.sku}`} type="number" min={0} step={1} inputMode="numeric" value={c.st.ctv} onChange={(e) => set(c.r.variantId, { ctv: e.target.value })} className={cn(fieldClass, "w-20")} />
            </Td>
            <Td label={t("colFinal")} className="align-top whitespace-nowrap tabular-nums md:text-right">
              <div className="text-base font-semibold" data-testid="manual-final">{c.price != null ? fmtInt(c.price) : "—"}</div>
              <div className="text-xs text-muted-foreground">{t("live", { price: fmtInt(c.r.livePrice) })}</div>
              {c.r.pending && <div className="text-xs text-warning">{t("pending", { price: fmtInt(c.r.price) })}</div>}
              {!c.ready && <div className="text-xs text-muted-foreground">{t("incomplete")}</div>}
            </Td>
          </tr>
        ))}
      </DataTable>
      {canReview && <BatchReviewOptions canApprove={canApprove} />}
    </ActionForm>
  );
}
