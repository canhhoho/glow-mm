import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { can } from "@/server/auth/roles";
import { getOrderAdmin, quarantineLocations, sellableLocations } from "@/server/orders/admin-queries";
import { returnItemsAction, reviewProofAction } from "@/server/orders/actions";
import { assignOrderAffiliateAction } from "@/server/affiliates/actions";
import { affiliateOptions } from "@/server/affiliates/affiliates";
import { bpToPercent, splitCommissions } from "@/server/affiliates/commission";
import { getNumberSetting } from "@/server/settings";
import { CommissionBadge } from "@/components/admin/affiliate-parts";
import { availableTransitions, TRANSITIONS } from "@/server/orders/state-machine";
import { ActionButton } from "@/components/admin/action-button";
import { ActionForm } from "@/components/admin/action-form";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/admin/order-badges";
import { TransitionForm, type TransitionField } from "@/components/admin/transition-form";
import { Badge, DataTable, fieldClass, LinkButton, PageHeader, Td } from "@/components/admin/ui";
import { fmtDateTime, fmtDay, fmtInt } from "@/lib/format";

export default async function OrderPage({ params }: PageProps<"/admin/orders/[id]">) {
  const user = await requirePagePermission("orders:view");
  const { id } = await params;
  const canAssign = can(user.role, "orders:assign-affiliate");
  const [t, ta, order, locations, qcLocations, affiliates, holdDays] = await Promise.all([
    getTranslations("Orders"),
    getTranslations("Affiliates"),
    getOrderAdmin(id),
    sellableLocations(),
    quarantineLocations(),
    canAssign ? affiliateOptions() : [],
    getNumberSetting("affiliate.holdDays"),
  ]);
  if (!order) notFound();
  const { commission, uplineCommission } = splitCommissions({ ...order, lines: order.payoutLines }, { now: new Date(), holdDays });
  const affiliatePaid = order.payoutLines.length > 0;

  // "returned" chỉ qua form Trả hàng (kèm phiếu nhập hàng trả vào Chờ kiểm tra).
  const transitions = availableTransitions(order).filter(
    (n) => n !== "returned" && can(user.role, TRANSITIONS[n].permission),
  );
  const fieldsFor = (n: string): TransitionField[] => {
    if (n === "pack" && locations.length > 1) {
      return [
        {
          name: "fromLocationId",
          label: t("fromLocation"),
          required: true,
          options: locations.map((l) => ({ value: l.id, label: `${l.code} — ${l.name}` })),
        },
      ];
    }
    if (n === "ship") {
      return [
        { name: "carrier", label: t("carrier"), required: true },
        { name: "trackingNo", label: t("trackingNo") },
      ];
    }
    if (n === "cancel") return [{ name: "reason", label: t("reason") }];
    return [];
  };
  const canReview = can(user.role, "orders:confirm-payment");
  const returnable = order.items.filter((i) => i.qty - i.returnedQty > 0);
  const canReturn =
    (order.status === "SHIPPING" || order.status === "COMPLETED") &&
    can(user.role, "orders:return") &&
    returnable.length > 0 &&
    qcLocations.length > 0;
  const showLabel = ["PACKING", "SHIPPING", "COMPLETED"].includes(order.status);
  const who = (userId: string | null) => (userId ? (order.userNames[userId] ?? userId) : t("system"));

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        title={`${t("colCode")} ${order.code}`}
        actions={[
          showLabel && (
            <LinkButton key="label" href={`/admin/orders/${order.id}/label`}>
              {t("printLabel")}
            </LinkButton>
          ),
          <LinkButton key="back" href="/admin/orders">
            ← {t("back")}
          </LinkButton>,
        ]}
      />

      <div className="flex flex-wrap items-center gap-2" data-testid="order-status">
        <OrderStatusBadge status={order.status} />
        <PaymentStatusBadge status={order.paymentStatus} />
        {order.overdue && <Badge tone="danger">{t("overdue")}</Badge>}
      </div>

      <section className="grid gap-6 md:grid-cols-2">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">{t("recipient")}</dt>
          <dd>{order.recipientName}</dd>
          <dt className="text-muted-foreground">{t("phone")}</dt>
          <dd className="font-mono">{order.recipientPhone}</dd>
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
          <dt className="text-muted-foreground">{t("colCreated")}</dt>
          <dd>{fmtDateTime(order.createdAt)}</dd>
          <dt className="text-muted-foreground">{t("createdBy")}</dt>
          <dd>{order.createdById ? who(order.createdById) : t("customerSelf")}</dd>
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
      </section>

      <section className="space-y-2 rounded-lg border p-4" data-testid="order-affiliate">
        <h2 className="font-medium">{ta("orderSection")}</h2>
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
                ({ta("rate")}: {bpToPercent(order.commissionRateBp ?? 0)}%)
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
          (affiliatePaid ? (
            <p className="text-xs text-muted-foreground">{ta("paidLocked")}</p>
          ) : (
            <ActionForm action={assignOrderAffiliateAction} submitLabel={ta("assign")} okText={ta("assigned")} variant="outline">
              <input type="hidden" name="orderId" value={order.id} />
              <select
                name="affiliateId"
                defaultValue={order.affiliateId ?? ""}
                aria-label={t("colAffiliate")}
                className={`${fieldClass} max-w-sm`}
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
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">{t("items")}</h2>
        <DataTable head={[t("sku"), t("product"), t("qty"), t("ret.returned"), t("unitPrice"), t("lineTotal"), t("lots")]}>
          {order.items.map((i) => (
            <tr key={i.id}>
              <Td className="font-mono text-xs">{i.sku}</Td>
              <Td>{i.name}</Td>
              <Td className="text-right tabular-nums">{fmtInt(i.qty)}</Td>
              <Td className="text-right tabular-nums">{i.returnedQty > 0 ? fmtInt(i.returnedQty) : "—"}</Td>
              <Td className="text-right tabular-nums">{fmtInt(i.unitPriceMmk)}</Td>
              <Td className="text-right tabular-nums">{fmtInt(i.qty * i.unitPriceMmk)}</Td>
              <Td className="text-xs">
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
          <dt>{t("shipping")}</dt>
          <dd className="text-right tabular-nums">{fmtInt(order.shippingFeeMmk)} MMK</dd>
          <dt className="font-medium">{t("total")}</dt>
          <dd className="text-right font-medium tabular-nums" data-testid="order-total">
            {fmtInt(order.totalMmk)} MMK
          </dd>
        </dl>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">{t("actions")}</h2>
        {transitions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noActions")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {transitions.map((n) => (
              <TransitionForm
                key={n}
                orderId={order.id}
                transition={n}
                label={t(`t.${n}`)}
                fields={fieldsFor(n)}
                variant={n === "cancel" ? "destructive" : "default"}
                confirm={n === "cancel" ? t("cancelConfirm") : undefined}
              />
            ))}
          </div>
        )}
      </section>

      {canReturn && (
        <section className="space-y-2">
          <h2 className="font-medium">{t("ret.title")}</h2>
          <p className="text-xs text-muted-foreground">{t("ret.hint")}</p>
          <ActionForm
            action={returnItemsAction}
            submitLabel={t("ret.submit")}
            okText={t("ret.done")}
            confirm={t("ret.confirm")}
            className="space-y-3 rounded-lg border p-3"
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
                    className={`${fieldClass} w-20`}
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
              <label className="space-y-1 text-xs">
                <span className="text-muted-foreground">{t("ret.reason")}</span>
                <input name="reason" required maxLength={500} className={`${fieldClass} w-64`} />
              </label>
              {qcLocations.length > 1 && (
                <label className="space-y-1 text-xs">
                  <span className="text-muted-foreground">{t("ret.location")}</span>
                  <select name="toLocationId" className={`${fieldClass} w-48`}>
                    {qcLocations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.code} — {l.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="flex min-h-9 items-center gap-2 text-sm">
                <input type="checkbox" name="refunded" />
                {t("ret.refunded")}
              </label>
            </div>
          </ActionForm>
        </section>
      )}

      {order.paymentMethod === "BANK_TRANSFER" && (
        <section className="space-y-2">
          <h2 className="font-medium">{t("proofs")}</h2>
          {order.paymentProofs.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noProofs")}</p>
          ) : (
            <ul className="space-y-2">
              {order.paymentProofs.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm">
                  <a href={p.file.url} target="_blank" rel="noreferrer" className="text-primary underline">
                    {t("viewFile")}
                  </a>
                  <span className="text-muted-foreground">{fmtDateTime(p.createdAt)}</span>
                  <Badge tone={p.status === "APPROVED" ? "success" : p.status === "REJECTED" ? "danger" : "warning"}>
                    {t(`proof.${p.status}`)}
                  </Badge>
                  {p.note && <span>{p.note}</span>}
                  {p.status === "PENDING" && canReview && (
                    <span className="flex gap-2">
                      <ActionButton
                        action={reviewProofAction}
                        fields={{ proofId: p.id, orderId: order.id, decision: "approve" }}
                        label={t("approve")}
                      />
                      <ActionButton
                        action={reviewProofAction}
                        fields={{ proofId: p.id, orderId: order.id, decision: "reject" }}
                        label={t("reject")}
                        variant="outline"
                      />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {order.deliveries.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">{t("deliveries")}</h2>
          <ul className="space-y-1 text-sm">
            {order.deliveries.map((d) => (
              <li key={d.id}>
                {d.carrier} · <span className="font-mono">{d.trackingNo ?? "—"}</span> · {fmtDateTime(d.shippedAt)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {order.documents.length > 0 && can(user.role, "stock:view") && (
        <section className="space-y-2">
          <h2 className="font-medium">{t("documents")}</h2>
          <ul className="space-y-1 text-sm">
            {order.documents.map((d) => (
              <li key={d.id}>
                <Link href={`/admin/inventory/documents/${d.id}`} className="font-mono text-xs text-primary underline">
                  {d.code}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-medium">{t("history")}</h2>
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
      </section>
    </div>
  );
}
