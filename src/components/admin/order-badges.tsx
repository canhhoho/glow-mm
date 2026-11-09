import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/admin/ui";
import type { OrderStatus, PaymentStatus } from "@/generated/prisma/client";

const STATUS_TONE: Record<OrderStatus, "neutral" | "success" | "warning" | "danger" | "brand"> = {
  AWAITING_STOCK: "warning",
  PENDING: "warning",
  PAYMENT_CONFIRMED: "brand",
  COD_CONFIRMED: "brand",
  PACKING: "brand",
  SHIPPING: "brand",
  COMPLETED: "success",
  CANCELLED: "neutral",
  RETURNED: "danger",
};

const PAY_TONE: Record<PaymentStatus, "neutral" | "success" | "warning" | "danger"> = {
  UNPAID: "neutral",
  PROOF_SUBMITTED: "warning",
  PAID: "success",
  REJECTED: "danger",
  REFUNDED: "neutral",
};

export async function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const t = await getTranslations("Orders");
  return <Badge tone={STATUS_TONE[status]}>{t(`status.${status}`)}</Badge>;
}

export async function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const t = await getTranslations("Orders");
  return <Badge tone={PAY_TONE[status]}>{t(`pay.${status}`)}</Badge>;
}
