import Link from "next/link";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { can } from "@/server/auth/roles";
import { prisma } from "@/lib/db";
import { salesBlockDays } from "@/server/inventory/documents";
import { preorderQueue } from "@/server/orders/preorder";
import { OrdersTabs } from "@/components/admin/orders-tabs";
import { TransitionForm } from "@/components/admin/transition-form";
import { Badge, DataTable, EmptyState, Page, PageHeader, Section, Td } from "@/components/admin/ui";
import { fmtDateTime, fmtInt } from "@/lib/format";

/**
 * QT3 — "Đơn đặt trước": đơn chờ hàng về theo thứ tự đặt; mỗi dòng báo đủ / thiếu theo tồn hiện tại (chia FIFO).
 * Đơn đủ hàng → "Hàng đã về — chuyển xử lý" (giữ hàng, về Chờ xác nhận như đơn mới). Server kiểm tồn lại khi bấm.
 */
export default async function PreordersPage() {
  const user = await requirePagePermission("orders:view");
  await connection();
  const [t, tp, blockDays] = await Promise.all([getTranslations("Orders"), getTranslations("Preorders"), salesBlockDays()]);
  const queue = await preorderQueue(prisma, { now: new Date(), blockDays });
  const canMove = can(user.role, "orders:confirm-payment");
  const ready = queue.filter((o) => o.enough).length;

  return (
    <Page>
      <PageHeader title={t("title")} description={tp("help")} />
      <OrdersTabs active="awaitingStock" />
      <p className="text-sm" data-testid="preorder-summary">
        {tp("summary", { count: queue.length, ready })}
      </p>
      {queue.length === 0 && <EmptyState>{tp("empty")}</EmptyState>}
      {queue.map((o, index) => (
        <Section
          key={o.id}
          testId="preorder-order"
          title={
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground tabular-nums">#{index + 1}</span>
              <Link href={`/admin/orders/${o.id}`} className="font-mono text-primary underline">
                {o.code}
              </Link>
              {o.enough ? <Badge tone="success">{tp("enough")}</Badge> : <Badge tone="warning">{tp("short")}</Badge>}
              {o.paymentStatus === "PAID" && <Badge tone="success">{tp("paid")}</Badge>}
            </span>
          }
        >
          <p className="text-sm text-muted-foreground">
            {fmtDateTime(o.createdAt)} · {o.recipientName} · {o.recipientPhone} · {t(`method.${o.paymentMethod}`)} · {fmtInt(o.totalMmk)} MMK
          </p>
          <DataTable stack head={[t("sku"), t("product"), t("qty"), tp("status")]} numeric={[2]}>
            {o.items.map((i) => (
              <tr key={i.id}>
                <Td className="font-mono text-xs">{i.sku}</Td>
                <Td label={t("product")}>{i.name}</Td>
                <Td label={t("qty")} numeric>
                  {fmtInt(i.qty)}
                </Td>
                <Td label={tp("status")}>{i.short > 0 ? <Badge tone="danger">{tp("missing", { n: i.short })}</Badge> : <Badge tone="success">{tp("ok")}</Badge>}</Td>
              </tr>
            ))}
          </DataTable>
          {canMove && (
            <div className="flex flex-wrap gap-2">
              {/* 21/11/2026: đơn chuyển khoản trả trước → ghi nhận tiền ngay; hàng về thì vào thẳng chuẩn bị giao. */}
              {o.paymentMethod === "BANK_TRANSFER" && o.paymentStatus === "UNPAID" && (
                <TransitionForm orderId={o.id} transition="confirmPrepayment" label={t("t.confirmPrepayment")} confirm={t("prepayHint")} />
              )}
              {o.enough && (o.paymentStatus === "PAID" ? (
                <TransitionForm orderId={o.id} transition="stockArrivedPaid" label={t("t.stockArrivedPaid")} />
              ) : (
                <TransitionForm orderId={o.id} transition="stockArrived" label={t("t.stockArrived")} />
              ))}
            </div>
          )}
        </Section>
      ))}
    </Page>
  );
}
