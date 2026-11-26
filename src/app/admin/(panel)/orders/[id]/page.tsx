import Link from "next/link";
import { notFound } from "next/navigation";
import { Printer } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { can } from "@/server/auth/roles";
import { isPhoneEmail } from "@/server/auth/customer-policy";
import { getOrderAdmin, quarantineLocations } from "@/server/orders/admin-queries";
import { setShippingPayerAction, updateTrackingAction } from "@/server/orders/actions";
import { affiliateOptions } from "@/server/affiliates/affiliates";
import { availableTransitions, TRANSITIONS } from "@/server/orders/state-machine";
import { ActionForm } from "@/components/admin/action-form";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/admin/order-badges";
import { TransitionForm, type TransitionField } from "@/components/admin/transition-form";
import { Badge, DataTable, fieldClass, fieldLabelClass, LinkButton, Page, PageHeader, Section, Td } from "@/components/admin/ui";
import { fmtDateTime, fmtDay, fmtInt } from "@/lib/format";
import { isSafeInternalPath } from "@/lib/safe-path";
import { vtpPreview } from "@/server/orders/vtp-data";
import { VtpSingleInfo } from "@/components/admin/vtp-single-info";
import { OrderAffiliateSection, OrderCodSection, OrderItemsSection, OrderReturnSection } from "@/components/admin/order-detail";

export default async function OrderPage({ params, searchParams }: PageProps<"/admin/orders/[id]">) {
  const user = await requirePagePermission("orders:view");
  const [{ id }, { from }] = await Promise.all([params, searchParams]);
  // Quay lại danh sách đúng tab/bộ lọc đã mở từ đó (chỉ nhận đường dẫn nội bộ /admin/orders…).
  const backHref = typeof from === "string" && from.startsWith("/admin/orders") && isSafeInternalPath(from) ? from : "/admin/orders";
  const canAssign = can(user.role, "orders:assign-affiliate");
  const [t, order, qcLocations, affiliates] = await Promise.all([
    getTranslations("Orders"),
    getOrderAdmin(id),
    quarantineLocations(),
    canAssign ? affiliateOptions() : [],
  ]);
  if (!order) notFound();

  // "returned" chỉ qua form Trả hàng (kèm phiếu nhập hàng trả vào Chờ kiểm tra).
  const transitions = availableTransitions(order).filter(
    (n) => n !== "returned" && can(user.role, TRANSITIONS[n].permission),
  );
  const fieldsFor = (n: string): TransitionField[] => {
    if (n === "ship") {
      // P24: không chọn kho xuất — mỗi SP xuất từ kho bán của nó.
      return [
        { name: "carrier", label: t("carrier"), required: true },
        { name: "trackingNo", label: t("trackingNo") },
      ];
    }
    if (n === "cancel") return [{ name: "reason", label: t("reason") }];
    return [];
  };
  const returnable = order.items.filter((i) => i.qty - i.returnedQty > 0);
  const canReturn =
    (order.status === "SHIPPING" || order.status === "COMPLETED") &&
    can(user.role, "orders:return") &&
    returnable.length > 0 &&
    qcLocations.length > 0;
  const showLabel = ["PAYMENT_CONFIRMED", "COD_CONFIRMED", "PACKING", "SHIPPING", "COMPLETED"].includes(order.status);
  const who = (userId: string | null) => (userId ? (order.userNames[userId] ?? userId) : t("system"));

  return (
    <Page>
      <PageHeader
        title={`${t("colCode")} ${order.code}`}
        back={{ href: backHref, label: t("back") }}
        actions={
          <>
          {can(user.role, "orders:ship") && ["PAYMENT_CONFIRMED", "COD_CONFIRMED", "PACKING"].includes(order.status) && <LinkButton href={`/admin/orders/export?id=${order.id}`}>{t("exportVtp")}</LinkButton>}
          {showLabel && (
            <LinkButton href={`/admin/orders/${order.id}/label`}>
              <Printer aria-hidden />
              {t("printLabel")}
            </LinkButton>
          )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2" data-testid="order-status">
        <OrderStatusBadge status={order.status} />
        {order.preorder && <Badge tone="warning">{t("preorderTag")}</Badge>}
        <PaymentStatusBadge status={order.paymentStatus} />
        {order.overdue && <Badge tone="danger">{t("overdue")}</Badge>}
      </div>
      {/* Hành động tiếp theo hợp lệ (chuyển trạng thái) nằm ngay dưới trạng thái, trước các khối thông tin. */}
      {/* Đơn hoàn tất chỉ còn trả hàng → không hiện "Không còn thao tác nào" ngay trên form Trả hàng. */}
      {(transitions.length > 0 || !canReturn) && (
        <Section title={t("actions")} testId="order-actions">
          {order.status === "AWAITING_STOCK" && <p className="text-sm text-muted-foreground" data-testid="preorder-hint">{t("preorderHint")}</p>}
          {order.status === "PENDING" && <p className="text-sm text-muted-foreground">{t(`confirmHint.${order.paymentMethod}`)}</p>}
          {transitions.includes("confirmPrepayment") && <p className="text-sm text-muted-foreground">{t("prepayHint")}</p>}
          {order.status === "SHIPPING" && order.paymentMethod === "COD" && <p className="text-sm text-muted-foreground">{t("codCompleteHint")}</p>}
          {transitions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noActions")}</p>
          ) : (
            <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
              {transitions.map((n) => (
                <TransitionForm
                  key={n}
                  orderId={order.id}
                  transition={n}
                  label={n === "complete" && order.paymentMethod === "COD" ? t("completeCod") : t(`t.${n}`)}
                  fields={fieldsFor(n)}
                  variant={n === "cancel" ? "destructive" : "default"}
                  confirm={n === "cancel" ? t("cancelConfirm") : n === "confirmPrepayment" ? t("prepayHint") : undefined}
                />
              ))}
            </div>
          )}
        </Section>
      )}

      {order.pick && (
        <Section title={t("bulk.pickTitle")} testId="order-pick" actions={!order.pick.consumedAt && <LinkButton href={`/admin/orders/pick-list?ids=${order.id}`}>{t("bulk.pickTitle")}</LinkButton>}>
          <p className="text-sm text-muted-foreground">{t("bulk.pickPrintedAt", { time: fmtDateTime(order.pick.printedAt) })}</p>
          <DataTable stack numeric={[3]} head={[t("sku"), t("bulk.pickLot"), t("warehouse"), t("bulk.pickQty")]}>
            {order.pick.lines.map((l) => (
              <tr key={l.id}>
                <Td className="font-mono text-xs">{l.batch.variant.sku}</Td>
                <Td label={t("bulk.pickLot")}>{l.batch.lotNo} · {fmtDay(l.batch.expiryDate)}</Td>
                <Td label={t("warehouse")}>{l.location.name} <span className="font-mono text-2xs text-muted-foreground">{l.location.code}</span></Td>
                <Td label={t("bulk.pickQty")} numeric>{fmtInt(l.qty)}</Td>
              </tr>
            ))}
          </DataTable>
        </Section>
      )}

      {order.paymentMethod === "COD" && <OrderCodSection order={order} canReconcile={can(user.role, "orders:reconcile-cod")} />}

      <Section className="grid gap-6 space-y-0 md:grid-cols-2 [&>*]:min-w-0">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">{t("recipient")}</dt>
          <dd>{order.recipientName}</dd>
          <dt className="text-muted-foreground">{t("phone")}</dt>
          <dd className="font-mono">
            {order.recipientPhone}
            {order.recipientPhone2 && <span data-testid="order-phone2"> · {order.recipientPhone2}</span>}
          </dd>
          <dt className="text-muted-foreground">{t("address")}</dt>
          <dd>{order.addressText}</dd>
          <dt className="text-muted-foreground">{t("zone")}</dt>
          <dd>{order.zoneName}</dd>
          {order.note && (
            <>
              <dt className="text-muted-foreground">{t("note")}</dt>
              <dd>{order.note}</dd>
            </>
          )}
        </dl>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">{t("colChannel")}</dt>
          <dd>{t(`channel.${order.channel}`)}</dd>
          <dt className="text-muted-foreground">{t("paymentMethod")}</dt>
          <dd>{t(`method.${order.paymentMethod}`)}</dd>
          <dt className="text-muted-foreground">{t("shippingPayer")}</dt>
          <dd>{order.shippingPayer === "SENDER" ? t("senderPays") : t("receiverPays")}</dd>
          <dt className="text-muted-foreground">{t("colCreated")}</dt>
          <dd>{fmtDateTime(order.createdAt)}</dd>
          <dt className="text-muted-foreground">{t("createdBy")}</dt>
          <dd>{order.createdById ? who(order.createdById) : t("customerSelf")}</dd>
          {order.account && (
            <>
              <dt className="text-muted-foreground">{t("customerAccount")}</dt>
              <dd data-testid="order-account">
                {/* Khách SĐT có email nội bộ <SĐT>@phone.glow.invalid → chỉ hiện SĐT. */}
                {order.account.name} ·{" "}
                <span className="font-mono">
                  {isPhoneEmail(order.account.email) ? (order.account.phoneNumber ?? order.account.email.split("@")[0]) : order.account.email}
                </span>
              </dd>
            </>
          )}
          {order.status === "PENDING" && (
            <>
              <dt className="text-muted-foreground">{t("holdUntil")}</dt>
              <dd>{order.holdExpiresAt ? fmtDateTime(order.holdExpiresAt) : t("holdNoExpiry")}</dd>
            </>
          )}
          {order.cancelReason && (
            <>
              <dt className="text-muted-foreground">{t("cancelReason")}</dt>
              <dd>{order.cancelReason}</dd>
            </>
          )}
        </dl>
      </Section>

      {/* 20/11/2026 (audit): Hàng + tổng tiền ngay sau khách / địa chỉ — thông tin lõi khi xác nhận / soạn đơn; phí ship, CTV xếp sau. */}
      <OrderItemsSection order={order} />

      <VtpSingleInfo order={vtpPreview(order)} />
      {can(user.role, "orders:ship") && ["PAYMENT_CONFIRMED", "COD_CONFIRMED", "PACKING"].includes(order.status) && (
        <Section>
          <ActionForm action={setShippingPayerAction} submitLabel={t("saveShippingPayer")} okText={t("shippingPayerSaved")} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="orderId" value={order.id} />
            <label className={fieldLabelClass}><span className="text-muted-foreground">{t("shippingPayer")}</span><select name="shippingPayer" defaultValue={order.shippingPayer} className={fieldClass}>
              <option value="RECEIVER">{t("receiverPays")}</option><option value="SENDER">{t("senderPays")}</option>
            </select></label>
          </ActionForm>
        </Section>
      )}

      <OrderAffiliateSection order={order} affiliates={affiliates} canAssign={canAssign} canManageRates={can(user.role, "affiliates:manage")} />

      {canReturn && (
        <OrderReturnSection order={order} returnable={returnable} qcLocations={qcLocations} />
      )}

      {order.deliveries.length > 0 && (
        <Section title={t("deliveries")} collapsible defaultOpen={order.status === "SHIPPING"} testId="order-deliveries">
          <ul className="space-y-1 text-sm">
            {order.deliveries.map((d) => (
              <li key={d.id}>
                {d.carrier} · <span className="font-mono">{d.trackingNo ?? "—"}</span> · {fmtDateTime(d.shippedAt)}
                {can(user.role, "orders:ship") && <ActionForm action={updateTrackingAction} submitLabel={t("saveTracking")} okText={t("trackingSaved")} className="mt-2 flex flex-wrap items-end gap-2"><input type="hidden" name="orderId" value={order.id} /><input type="hidden" name="deliveryId" value={d.id} /><label className={fieldLabelClass}><span className="text-muted-foreground">{t("carrier")}</span><input name="carrier" required maxLength={80} defaultValue={d.carrier} className={fieldClass} /></label><label className={fieldLabelClass}><span className="text-muted-foreground">{t("trackingNo")}</span><input name="trackingNo" maxLength={100} defaultValue={d.trackingNo ?? ""} className={fieldClass} /></label></ActionForm>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {order.documents.length > 0 && can(user.role, "stock:view") && (
        <Section title={t("documents")} collapsible testId="order-documents">
          <ul className="space-y-1 text-sm">
            {order.documents.map((d) => (
              <li key={d.id}>
                <Link href={`/admin/inventory/documents/${d.id}`} className="font-mono text-xs text-primary underline">
                  {d.code}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={t("history")} collapsible testId="order-history">
        <ol className="space-y-1 text-sm">
          {order.history.map((h) => (
            <li key={h.id} className="flex flex-wrap gap-2">
              <span className="text-muted-foreground tabular-nums">{fmtDateTime(h.createdAt)}</span>
              <span>{t(`status.${h.toStatus}`)}</span>
              <span className="text-muted-foreground">
                · {!h.fromStatus && !h.userId ? t("customerSelf") : who(h.userId)}
              </span>
              {h.note && <span>· {h.note}</span>}
            </li>
          ))}
        </ol>
      </Section>
    </Page>
  );
}
