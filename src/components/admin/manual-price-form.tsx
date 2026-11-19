"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Calculator, Pencil } from "lucide-react";
import { ActionForm } from "@/components/admin/action-form";
import { BatchReviewOptions } from "@/components/admin/batch-review";
import { Badge, DataTable, Td, fieldClass } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { fmtDate, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { applyManualPricingAction } from "@/server/pricing/actions";
import { priceMmkManual, priceVndManual } from "@/server/pricing/formula";
import type { ManualRate, ManualRow } from "@/server/pricing/manual";

/** `sourceLineId` "" = giá mua hiện tại của phân loại (sửa được ở ô Giá mua); khác "" = một lần nhập đã ghi sổ. */
type RowState = { sourceLineId: string; purchase: string; profit: string; ship: string; ctv: string };
type Mode = "VN_IMPORT" | "LOCAL_MMK";

const whole = (v: string) => (v.trim() !== "" && Number.isInteger(Number(v)) && Number(v) >= 0 ? Number(v) : null);

/**
 * Trang Giá bán — Thủ công (một bảng cho cả hai kho, 19/11/2026):
 *  - kho hàng nhập VN: Giá bán MMK = (giá mua VND + lãi VND) ÷ tỷ giá + vận chuyển MMK + CTV MMK;
 *  - kho mua tại Myanmar (Kho Chi): Giá bán MMK = giá mua MMK + lãi MMK + CTV MMK — không tỷ giá, không vận chuyển
 *    (khách tự trả phí chở nội địa);
 * làm tròn lên theo cấu hình. Giá mua = giá mua hiện tại của phân loại (sửa được, lưu cùng lần lưu giá — kể cả SP chưa có
 * hàng) hoặc một lần nhập đã ghi sổ. Tính trên trình duyệt bằng đúng hàm của máy chủ; khi lưu máy chủ tính lại.
 * Giá cuối không sửa tay. CTV = hoa hồng cố định của SKU, có hiệu lực cùng giá khi duyệt.
 */
export function ManualPriceForm({
  mode,
  location,
  rows,
  rates,
  currentRateId,
  roundTo,
  canReview,
  canApprove,
  editAll = false,
}: {
  mode: Mode;
  location: { id: string; code: string; name: string };
  rows: ManualRow[];
  rates: ManualRate[];
  currentRateId: string | null;
  roundTo: number;
  canReview: boolean;
  canApprove: boolean;
  /** Mở sẵn sửa mọi dòng (tính lại theo tỷ giá mới); dòng thiếu dữ liệu vẫn hiện lý do và không được gửi. */
  editAll?: boolean;
}) {
  const t = useTranslations("SellingPrices.manualPage");
  const mmk = mode === "LOCAL_MMK";
  const [editing, setEditing] = useState<string[]>(() => (editAll ? rows.map((r) => r.variantId) : []));
  const [rateId, setRateId] = useState(currentRateId ?? rates[0]?.id ?? "");
  const lotPrice = (s: ManualRow["sources"][number]) => (mmk ? s.unitCostMmk : s.unitCostVnd);
  const [state, setState] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(
      rows.map((r) => {
        // Giá mua hiện tại; dữ liệu cũ chưa có → lấy giá của lần nhập gần nhất làm giá trị đầu (lưu lại thì thành giá mua hiện tại).
        const seed = r.purchasePrice ?? (r.sources[0] ? lotPrice(r.sources[0]) : null);
        const profit = mmk ? r.lastProfitMmk : r.lastProfitVnd;
        return [
          r.variantId,
          {
            sourceLineId: "",
            purchase: seed != null ? String(seed) : "",
            profit: profit != null ? String(profit) : "",
            ship: mmk ? "0" : r.lastShipMmk != null ? String(r.lastShipMmk) : r.suggestedShipMmk != null ? String(r.suggestedShipMmk) : "",
            ctv: r.commission != null ? String(r.commission) : "",
          },
        ];
      }),
    ),
  );
  const rate = rates.find((r) => r.id === rateId);
  const lotText = (s?: ManualRow["sources"][number]) =>
    s && t("lotOption", { lot: s.lotNo, doc: s.documentCode, date: s.postedAt ? fmtDate(new Date(s.postedAt)) : "—", price: fmtInt(lotPrice(s)), currency: mmk ? "MMK" : "VND" });
  const set = (id: string, patch: Partial<RowState>) => setState((s) => ({ ...s, [id]: { ...s[id], ...patch } }));

  const computed = useMemo(
    () =>
      rows.map((r) => {
        const st = state[r.variantId];
        const source = r.sources.find((s) => s.lineId === st.sourceLineId);
        const purchase = r.isBundle ? r.comboCost : source ? lotPrice(source) : whole(st.purchase);
        const profit = whole(st.profit);
        const ship = mmk ? 0 : whole(st.ship);
        const ctv = whole(st.ctv);
        const ready = (mmk || rate != null) && purchase != null && profit != null && ship != null && ctv != null;
        const price = !ready
          ? null
          : mmk
            ? priceMmkManual({ purchaseMmk: purchase!, profitMmk: profit!, commissionMmk: ctv!, roundTo })
            : priceVndManual({ ...rate!, purchaseVnd: purchase!, profitVnd: profit!, shipMmk: ship!, commissionMmk: ctv!, roundTo });
        return { r, st, purchase, price, ready, changed: ready && (price !== r.price || ctv !== r.commission) };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lotPrice chỉ phụ thuộc mmk
    [rows, state, rate, roundTo, mmk],
  );
  const lines = computed
    .filter((c) => c.ready && editing.includes(c.r.variantId))
    .map((c) => {
      const current = !c.r.isBundle && c.st.sourceLineId === "";
      const purchase = current ? whole(c.st.purchase) : null;
      return {
        variantId: c.r.variantId,
        ...(c.r.isBundle ? {} : { sourceLineId: c.st.sourceLineId }),
        // Giá mua hiện tại đổi trên trang → lưu cùng (máy chủ ghi qua setPurchasePrices rồi mới tính giá).
        ...(current && purchase != null && purchase !== c.r.purchasePrice && { purchase }),
        ...(mmk ? { profitMmk: whole(c.st.profit) } : { profitVnd: whole(c.st.profit), shipMmk: whole(c.st.ship) }),
        commissionMmk: whole(c.st.ctv),
        expectedPriceMmk: c.r.price,
        expectedCommissionMmk: c.r.commission ?? "",
      };
    });
  // Tính lại theo tỷ giá mới: dòng giá không đổi cũng được xác nhận (hết cảnh báo tỷ giá mới).
  const payload = JSON.stringify({ locationId: location.id, ...(!mmk && { rateId }), lines, ...(editAll && { confirmUnchanged: true }) });
  const changedCount = computed.filter((c) => c.changed && editing.includes(c.r.variantId)).length;

  const colPurchase = mmk ? t("colPurchaseMmk") : t("colPurchase");
  const colProfit = mmk ? t("colProfitMmk") : t("colProfit");
  // Kho Myanmar không có cột Vận chuyển → chia lại độ rộng.
  const cols = mmk
    ? ["md:w-[26%]", "md:w-[11%]", "md:w-[20%]", "md:w-[11%]", "md:w-[11%]", "md:w-[12%]", "md:w-[9%]"]
    : ["md:w-[23%]", "md:w-[9%]", "md:w-[18%]", "md:w-[11%]", "md:w-[10%]", "md:w-[10%]", "md:w-[11%]", "md:w-[8%]"];
  const head = [
    t("colProduct"),
    colPurchase,
    t("colLot"),
    colProfit,
    ...(mmk ? [] : [t("colShip")]),
    t("colCtv"),
    t("colFinal"),
    <span key="act" className="sr-only md:not-sr-only">{t("colActions")}</span>,
  ];
  const numeric = mmk ? [1, 3, 4, 5] : [1, 3, 4, 5, 6];

  return (
    <ActionForm action={applyManualPricingAction} submitLabel={editAll ? t("saveConfirm", { count: lines.length, changed: changedCount }) : t("save", { count: changedCount })} icon={<Calculator aria-hidden />} className="flex flex-wrap items-end gap-x-6 gap-y-4" actionsClassName="ml-auto">
      <input type="hidden" name="payload" value={payload} />
      {/* Thanh cấu hình ngang trên bảng: tỷ giá (chỉ kho nhập VN) + mức làm tròn + hướng dẫn tính. */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 basis-full rounded-lg border bg-muted/30 px-3 py-2" data-testid="manual-toolbar">
        {!mmk && (
          <label className="flex min-w-0 flex-wrap items-center gap-2 text-sm max-sm:w-full">
            <span className="font-medium">{t("rate")}</span>
            <select value={rateId} onChange={(e) => setRateId(e.target.value)} className={cn(fieldClass, "w-full min-w-0 bg-background sm:w-auto sm:min-w-64")} data-testid="manual-rate">
              {rates.map((r) => (
                <option key={r.id} value={r.id}>
                  {t("rateOption", { vnd: r.vndPerMmk, date: fmtDate(new Date(r.effectiveAt)) })}
                  {r.current ? ` · ${t("rateCurrent")}` : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="text-xs text-muted-foreground">{t("roundNote", { round: fmtInt(roundTo) })}</span>
        {/* Hướng dẫn dài (công thức, ý nghĩa lãi, giá mua) gom vào phần mở rộng — bảng chỉ còn cột cần thao tác. */}
        <details className="basis-full text-sm text-muted-foreground md:ml-auto md:basis-auto" data-testid="manual-help">
          <summary className="cursor-pointer select-none md:text-right">{t("howTo")}</summary>
          <p className="mt-1 max-w-2xl">{t(mmk ? "formulaMmk" : "formula", { round: fmtInt(roundTo) })}</p>
          <p className="mt-1 max-w-2xl">{t("profitNote")}</p>
        </details>
      </div>
      {!mmk && rate && !rate.current && <Notice tone="warning" className="basis-full">{t("oldRate")}</Notice>}
      <DataTable
        stack
        dense
        middle
        className="basis-full"
        tableClassName="md:table-fixed [&_th]:whitespace-normal [&_th]:align-bottom"
        // Chia cột theo nội dung: tên SP rộng nhất, lô nguồn đủ đọc mã lô/phiếu, ô số vừa 7–9 chữ số.
        cols={cols}
        numeric={numeric}
        head={head}
      >
        {computed.map((c) => {
          const id = c.r.variantId;
          const editable = editing.includes(id);
          const label = c.r.label && !c.r.standardLabel ? c.r.label : null;
          const current = !c.r.isBundle && c.st.sourceLineId === "";
          // Lý do chưa tính được giá (chỉ khi đang sửa) — hiện "—" thay vì 0.
          const missing = !mmk && !rate ? t("missingRate") : c.purchase == null ? t("missingPurchase") : t(mmk ? "incompleteMmk" : "incomplete");
          const num = (key: "purchase" | "profit" | "ship" | "ctv", name: string, extra?: { id?: string }) => {
            // Chỉ báo lỗi khi đã gõ mà sai; ô trống thì lý do hiện ở cột Giá bán.
            const invalid = editable && c.st[key].trim() !== "" && whole(c.st[key]) == null;
            return (
              <>
                <input
                  {...extra}
                  aria-label={`${name} ${c.r.sku}`}
                  aria-invalid={invalid || undefined}
                  aria-describedby={invalid ? `${key}-err-${id}` : undefined}
                  readOnly={!editable}
                  // Tính lại theo tỷ giá mới (editAll): dòng thiếu dữ liệu chỉ hiện lý do và bị bỏ qua — không chặn lưu cả bảng.
                  required={editable && !editAll}
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
              <Td>
                <span className="block font-medium break-words">{c.r.productName}</span>
                <span className="block text-xs break-all text-muted-foreground">
                  <span className="font-mono">{c.r.sku}</span>
                  {label && <> · {label}</>}
                </span>
                {c.r.isBundle && <Badge tone="brand">combo</Badge>}
              </Td>
              <Td label={colPurchase} numeric>
                {/* Giá mua hiện tại: sửa được ngay (giá thật, đổi khi nhà cung cấp báo giá mới); lần nhập: chỉ hiển thị. */}
                {current ? num("purchase", colPurchase) : <span className="tabular-nums">{c.purchase != null ? fmtInt(c.purchase) : "—"}</span>}
              </Td>
              <Td label={t("colLot")}>
                {c.r.isBundle ? (
                  <span className="block text-xs text-muted-foreground">{t("comboLot")}</span>
                ) : (
                  <select
                    aria-label={`${t("colLot")} ${c.r.sku}`}
                    // Cột hẹp có thể cắt chữ → tooltip hiện đủ lô · phiếu · ngày · giá của lô đang chọn.
                    title={lotText(c.r.sources.find((s) => s.lineId === c.st.sourceLineId)) ?? t("currentPurchase")}
                    disabled={!editable}
                    value={c.st.sourceLineId}
                    onChange={(e) => set(id, { sourceLineId: e.target.value })}
                    className={cn(fieldClass, "w-full min-w-0 text-xs")}
                  >
                    <option value="">{t("currentPurchase")}</option>
                    {c.r.sources.map((s) => (
                      <option key={s.lineId} value={s.lineId}>
                        {lotText(s)}
                      </option>
                    ))}
                  </select>
                )}
              </Td>
              <Td label={colProfit} numeric>{num("profit", colProfit, { id: `profit-${id}` })}</Td>
              {!mmk && <Td label={t("colShip")} numeric>{num("ship", t("colShip"))}</Td>}
              <Td label={t("colCtv")} numeric>{num("ctv", t("colCtv"))}</Td>
              <Td label={t("colFinal")} numeric>
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
              <Td label={t("colActions")} className="md:text-center">
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
      {/* Hàng thao tác: ô gửi duyệt / duyệt luôn bên trái, nút Lưu bên phải (actionsClassName="ml-auto"). */}
      {canReview ? <BatchReviewOptions canApprove={canApprove} compact /> : <span aria-hidden />}
    </ActionForm>
  );
}
