import { RotateCcw } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { getOrderAdmin, quarantineLocations } from "@/server/orders/admin-queries";
import { returnItemsAction } from "@/server/orders/actions";
import { assignOrderAffiliateAction, setOrderCommissionRatesAction } from "@/server/affiliates/actions";
import type { affiliateOptions } from "@/server/affiliates/affiliates";
import { bpToPercent, hasFixedCommission, splitCommissions } from "@/server/affiliates/commission";
import { getNumberSetting } from "@/server/settings";
import { CommissionBadge } from "@/components/admin/affiliate-parts";
import { ActionForm } from "@/components/admin/action-form";
import { CodSettlement } from "@/components/admin/cod-settlement";
import { checkboxClass, DataTable, fieldClass, fieldLabelClass, fieldLabelSmClass, Section, Td } from "@/components/admin/ui";
import { fmtDateTime, fmtDay, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Các khối của trang Chi tiết đơn (`admin/(panel)/orders/[id]/page.tsx`), tách ra cho trang chính chỉ còn đầu trang,
 * thao tác chuyển trạng thái và bố cục (design-system P3, 26/11/2026). Chỉ hiển thị + gọi action sẵn có, không thêm nghiệp vụ.
 */
type Order = NonNullable<Awaited<ReturnType<typeof getOrderAdmin>>>;

/** COD: thu hộ, đối soát tiền về (chỉ đơn COD). */
export async function OrderCodSection({ order, canReconcile }: { order: Order; canReconcile: boolean }) {
  const tc = await getTranslations("Cod");
  return (
    <Section title={tc("title")}>
  <p className="text-sm text-muted-foreground">{tc("help")}</p>
  <p className="text-sm">{tc("collectedAt")}: {fmtDateTime(order.codCollectedAt)} · {order.codRemittedAt ? tc("remitted") : order.codCollectedAt ? tc("waiting") : tc("notCollected")}</p>
  {order.codRemittedAt && <p className="text-sm">{tc("received")}: {fmtInt(order.codRemittedMmk)} MMK · {tc("fee")}: {fmtInt(order.codCarrierFeeMmk)} MMK · {order.codRemittanceRef} · {fmtDateTime(order.codRemittedAt)}</p>}
  {order.codAdjustmentMmk != null && <p className="text-sm">{tc("adjustment")}: {fmtInt(order.codAdjustmentMmk)} MMK · {order.codSettlementNote}</p>}
  {order.codRemittedAt && (order.status === "RETURNED" || order.paymentStatus === "REFUNDED" || order.items.some((i) => i.returnedQty > 0)) && <p className="text-sm text-muted-foreground">{tc("exception")}</p>}
  {canReconcile && order.codCollectedAt && !order.codRemittedAt && ((order.status === "COMPLETED" || order.status === "RETURNED") ? <CodSettlement orderId={order.id} total={order.totalMmk} exception={order.status !== "COMPLETED" || order.paymentStatus !== "PAID" || order.items.some((i) => i.returnedQty > 0)} /> : <p className="text-sm text-muted-foreground">{tc("exception")}</p>)}
</Section>
  );
}

/** Hàng + tổng tiền. */
export async function OrderItemsSection({ order }: { order: Order }) {
  const t = await getTranslations("Orders");
  return (
    <Section title={t("items")}>
  <DataTable
    stack
    numeric={[1, 2, 3, 4]}
    head={[t("product"), t("qty"), t("ret.returned"), t("unitPrice"), t("lineTotal"), t("lots")]}
  >
    {order.items.map((i) => (
      <tr key={i.id}>
        {/* Chuẩn bảng SP: tên (snapshot lúc đặt) là dòng chính, SKU dòng phụ. */}
        <Td className="md:w-[38%]">
          <span className="block font-medium break-words">{i.name}</span>
          <span className="block font-mono text-xs break-all text-muted-foreground">{i.sku}</span>
        </Td>
        <Td label={t("qty")} numeric>
          {fmtInt(i.qty)}
        </Td>
        <Td label={t("ret.returned")} numeric>
          {i.returnedQty > 0 ? fmtInt(i.returnedQty) : "—"}
        </Td>
        <Td label={t("unitPrice")} numeric>
          {fmtInt(i.unitPriceMmk)}
        </Td>
        <Td label={t("lineTotal")} numeric>
          {fmtInt(i.qty * i.unitPriceMmk)}
        </Td>
        <Td label={t("lots")} className="text-xs">
          {i.allocations.length === 0
            ? "—"
            : i.allocations.map((a) => (
                <div key={a.id} className="font-mono">
                  {a.batch.lotNo} · {fmtDay(a.batch.expiryDate)} × {a.qty}
                </div>
              ))}
        </Td>
      </tr>
    ))}
  </DataTable>
  <dl className="ml-auto grid max-w-xs grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
    <dt>{t("subtotal")}</dt>
    <dd className="text-right tabular-nums">{fmtInt(order.subtotalMmk)} MMK</dd>
    {order.shippingFeeMmk > 0 && (
      <>
        <dt>{t("shipping")}</dt>
        <dd className="text-right tabular-nums">{fmtInt(order.shippingFeeMmk)} MMK</dd>
      </>
    )}
    <dt className="font-medium">{t("total")}</dt>
    <dd className="text-right font-medium tabular-nums" data-testid="order-total">
      {fmtInt(order.totalMmk)} MMK
    </dd>
    {order.shippingFeeMmk === 0 && <dd className="col-span-2 text-xs text-muted-foreground">{t("shippingNote")}</dd>}
  </dl>
</Section>
  );
}

/** CTV của đơn: hoa hồng (bán + tầng trên), gán CTV, chỉnh % theo đơn. */
export async function OrderAffiliateSection({
  order,
  affiliates,
  canAssign,
  canManageRates,
}: {
  order: Order;
  affiliates: Awaited<ReturnType<typeof affiliateOptions>>;
  canAssign: boolean;
  canManageRates: boolean;
}) {
  const [t, ta, holdDays] = await Promise.all([getTranslations("Orders"), getTranslations("Affiliates"), getNumberSetting("affiliate.holdDays")]);
  const { commission, uplineCommission } = splitCommissions({ ...order, lines: order.payoutLines }, { now: new Date(), holdDays });
  const affiliatePaid = order.payoutLines.length > 0;
  // Đơn huỷ không phát sinh hoa hồng → khoá đổi CTV / % (server cũng chặn).
  const affiliateCancelled = order.status === "CANCELLED";
  return (
    <Section title={ta("orderSection")} className="space-y-2" testId="order-affiliate">
  {order.affiliate ? (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      <dt className="text-muted-foreground">{t("colAffiliate")}</dt>
      <dd>
        <span className="font-mono">{order.affiliate.code}</span> — {order.affiliate.user.name}
        {order.affiliateSource && <span className="ml-2 text-xs text-muted-foreground">({ta(`source.${order.affiliateSource}`)})</span>}
      </dd>
      <dt className="text-muted-foreground">{ta("colCommission")}</dt>
      <dd className="flex flex-wrap items-center gap-2">
        <span className="tabular-nums">{fmtInt(commission.commissionMmk)} MMK</span>
        <span className="text-xs text-muted-foreground">
          {/* 18/11/2026: hoa hồng bán hàng theo mức ở Giá bán; đơn cũ còn chốt % thì hiện %. */}
          (
          {order.commissionRateBp != null
            ? `${ta("rate")}: ${bpToPercent(order.commissionRateBp)}%${hasFixedCommission(order.items) ? ` · ${ta("fixedPerProduct")}` : ""}`
            : ta("byPriceList")}
          )
        </span>
        <CommissionBadge state={commission.state} />
      </dd>
      {order.uplineAffiliate && uplineCommission && (
        <>
          <dt className="text-muted-foreground">{ta("tree.parent")}</dt>
          <dd className="flex flex-wrap items-center gap-2" data-testid="order-upline">
            <span>
              <span className="font-mono">{order.uplineAffiliate.code}</span> — {order.uplineAffiliate.user.name}
            </span>
            <span className="tabular-nums">{fmtInt(uplineCommission.commissionMmk)} MMK</span>
            <span className="text-xs text-muted-foreground">({bpToPercent(order.uplineRateBp ?? 0)}%)</span>
            <CommissionBadge state={uplineCommission.state} />
          </dd>
        </>
      )}
    </dl>
  ) : (
    <p className="text-sm text-muted-foreground">{ta("none")}</p>
  )}
  {canAssign &&
    (affiliatePaid || affiliateCancelled ? (
      <p className="text-xs text-muted-foreground">{affiliatePaid ? ta("paidLocked") : ta("cancelledLocked")}</p>
    ) : (
      <ActionForm action={assignOrderAffiliateAction} submitLabel={ta("assign")} okText={ta("assigned")} variant="outline">
        <input type="hidden" name="orderId" value={order.id} />
        <select
          name="affiliateId"
          defaultValue={order.affiliateId ?? ""}
          aria-label={t("colAffiliate")}
          className={cn(fieldClass, "max-w-sm")}
        >
          <option value="">{ta("assignNone")}</option>
          {order.affiliate && !affiliates.some((a) => a.id === order.affiliate!.id) && (
            <option value={order.affiliate.id}>
              {order.affiliate.code} — {order.affiliate.user.name} ({ta("locked")})
            </option>
          )}
          {affiliates.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </ActionForm>
    ))}
  {canManageRates && order.affiliate && !affiliatePaid && !affiliateCancelled && (order.commissionRateBp != null || order.uplineAffiliate) && (
    <ActionForm
      action={setOrderCommissionRatesAction}
      submitLabel={ta("orderRates.save")}
      okText={ta("orderRates.saved")}
      variant="outline"
      className="space-y-2 border-t pt-3"
    >
      <input type="hidden" name="orderId" value={order.id} />
      <p className="text-xs text-muted-foreground">{ta("orderRates.hint")}</p>
      <div className="flex flex-wrap gap-3" data-testid="order-rates">
        {order.commissionRateBp != null && (
        <label className={fieldLabelClass}>
          <span className="text-muted-foreground">{ta("orderRates.sale")}</span>
          <input
            name="commissionPercent"
            type="number"
            required
            min={0}
            max={50}
            step={0.01}
            inputMode="decimal"
            defaultValue={bpToPercent(order.commissionRateBp)}
            className={cn(fieldClass, "w-28")}
          />
        </label>
        )}
        {order.uplineAffiliate && (
          <label className={fieldLabelClass}>
            <span className="text-muted-foreground">{ta("orderRates.upline")}</span>
            <input
              name="uplinePercent"
              type="number"
              required
              min={0}
              max={20}
              step={0.01}
              inputMode="decimal"
              defaultValue={bpToPercent(order.uplineRateBp ?? 0)}
              className={cn(fieldClass, "w-28")}
            />
          </label>
        )}
      </div>
    </ActionForm>
  )}
</Section>
  );
}

/** Trả hàng: số lượng trả từng dòng → phiếu nhập hàng trả vào vị trí Chờ kiểm tra. */
export async function OrderReturnSection({
  order,
  returnable,
  qcLocations,
}: {
  order: Order;
  returnable: Order["items"];
  qcLocations: Awaited<ReturnType<typeof quarantineLocations>>;
}) {
  const t = await getTranslations("Orders");
  return (
    <Section title={t("ret.title")} collapsible testId="order-return">
  <p className="text-xs text-muted-foreground">{t("ret.hint")}</p>
  <ActionForm
    action={returnItemsAction}
    submitLabel={t("ret.submit")}
    okText={t("ret.done")}
    confirm={t("ret.confirm")}
    className="space-y-3" icon={<RotateCcw aria-hidden />}
  >
    <input type="hidden" name="orderId" value={order.id} />
    <ul className="space-y-2">
      {returnable.map((i) => (
        <li key={i.id} className="flex flex-wrap items-center gap-2 text-sm">
          <input
            name={`qty:${i.id}`}
            type="number"
            min={0}
            max={i.qty - i.returnedQty}
            defaultValue={0}
            aria-label={`${t("ret.title")} ${i.sku}`}
            className={cn(fieldClass, "w-20")}
          />
          <span>
            <span className="font-mono text-xs">{i.sku}</span> {i.name}{" "}
            <span className="text-muted-foreground">
              ({t("ret.returnable")}: {i.qty - i.returnedQty})
            </span>
          </span>
        </li>
      ))}
    </ul>
    <div className="flex flex-wrap items-end gap-3">
      <label className={fieldLabelSmClass}>
        <span className="text-muted-foreground">{t("ret.reason")}</span>
        <input name="reason" required maxLength={500} className={cn(fieldClass, "w-64")} />
      </label>
      {qcLocations.length > 1 && (
        <label className={fieldLabelSmClass}>
          <span className="text-muted-foreground">{t("ret.location")}</span>
          <select name="toLocationId" className={cn(fieldClass, "w-48")}>
            {qcLocations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code} — {l.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="flex min-h-9 items-center gap-2 text-sm">
        <input type="checkbox" name="refunded" className={checkboxClass} />
        {t("ret.refunded")}
      </label>
    </div>
  </ActionForm>
</Section>
  );
}
