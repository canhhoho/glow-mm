import "server-only";
import { variantDisplayName } from "@/lib/variant-label";
import { prisma } from "@/lib/db";
import { loadAddressCatalog } from "@/server/locations/locations";
import type { OrderChannel, OrderStatus, PaymentMethod, Prisma } from "@/generated/prisma/client";
import { salesBlockDays } from "@/server/inventory/documents";
import { productName } from "@/server/inventory/queries";
import { availableToSell } from "./availability";
import { preorderCapacity } from "./preorder";
import { normalizeMmPhone, phoneSearchDigits } from "@/lib/phone";
import { toUnicode } from "@/lib/myanmar";
import { ORDER_STATUSES, PREPARING_STATUSES } from "./state-machine";
import { pageNumber } from "@/lib/pagination";
import { optionalRange } from "@/lib/date-range";
import { addDays, yangonDayStart } from "@/lib/time";

/** Truy vấn cho admin đơn hàng (đọc, không thay đổi dữ liệu). */

export type OrderListFilter = { status?: string; paymentMethod?: string; channel?: string; q?: string; overdue?: boolean; affiliateId?: string; from?: string; to?: string; locationId?: string; page?: number; shippingDays?: number };

const CHANNELS = ["WEB", "FACEBOOK", "VIBER", "PHONE"] as const;

export async function listOrdersAdmin(filter: OrderListFilter, now = new Date()) {
  return (await listOrdersPageAdmin(filter, now, 200)).orders;
}

export async function listOrdersPageAdmin(filter: OrderListFilter, now = new Date(), pageSize = 50) {
  const where: Prisma.OrderWhereInput = {};
  if (filter.status === "PREPARING") where.status = { in: [...PREPARING_STATUSES] };
  if (filter.status && (ORDER_STATUSES as readonly string[]).includes(filter.status)) {
    where.status = filter.status as OrderStatus;
  }
  if (filter.paymentMethod === "COD" || filter.paymentMethod === "BANK_TRANSFER") {
    where.paymentMethod = filter.paymentMethod as PaymentMethod;
  }
  if (filter.channel && (CHANNELS as readonly string[]).includes(filter.channel)) {
    where.channel = filter.channel as OrderChannel;
  }
  if (filter.affiliateId) where.affiliateId = filter.affiliateId;
  if (filter.locationId) where.items = { some: { variant: { product: { stockLocationId: filter.locationId } } } };
  const { from, to } = optionalRange(filter);
  if (from || to) where.createdAt = { ...(from && { gte: yangonDayStart(from) }), ...(to && { lt: yangonDayStart(addDays(to,1)) }) };
  if (Number.isInteger(filter.shippingDays) && filter.shippingDays! > 0 && filter.shippingDays! <= 365) {
    where.status = "SHIPPING";
    where.deliveries = { some: { shippedAt: { lte: new Date(now.getTime() - filter.shippingDays! * 86400000) } } };
  }
  const q = filter.q ? toUnicode(filter.q.trim()) : "";
  if (q) {
    // SĐT đủ → khớp đúng; chỉ gõ số → khớp một phần; có chữ → chỉ tìm mã đơn / tên người nhận.
    const phone = normalizeMmPhone(q);
    const digits = phone ? "" : phoneSearchDigits(q);
    where.OR = [
      { code: { contains: q.toUpperCase() } },
      { recipientName: { contains: q, mode: "insensitive" } },
      ...(phone ? [{ recipientPhone: phone }] : digits ? [{ recipientPhone: { contains: digits } }] : []),
    ];
  }
  const overdueWhere: Prisma.OrderWhereInput = {
    status: "PENDING",
    reservations: { some: { status: "ACTIVE", expiresAt: { lte: now } } },
  };
  if (filter.overdue) where.AND = [overdueWhere];

  const take = Math.max(1, Math.min(200, Math.trunc(pageSize)));
  return prisma.$transaction(async tx => {
    const total = await tx.order.count({ where });
    const pages = Math.max(1, Math.ceil(total / take));
    const page = Math.min(pages, pageNumber(filter.page));
    const orders = await tx.order.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take, skip: (page-1)*take,
      include: { _count: { select: { items: true } }, affiliate: { select: { code: true } }, reservations: { where: { status: "ACTIVE", expiresAt: { lte: now } }, select: { id: true }, take: 1 } } });
    return { total, page, pages, orders: orders.map(({ reservations, ...o })=>({ ...o, overdue: o.status === "PENDING" && reservations.length > 0 })) };
  }, { isolationLevel: "RepeatableRead" });
}

export async function getOrderAdmin(id: string, now = new Date()) {
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: { include: { variant: { select: { weightGrams: true } }, allocations: { include: { batch: { select: { lotNo: true, expiryDate: true } } } } } },
      history: { orderBy: { createdAt: "asc" } },
      deliveries: { orderBy: { createdAt: "desc" } },
      reservations: true,
      documents: { select: { id: true, code: true, type: true, status: true } },
      affiliate: { select: { id: true, code: true, user: { select: { name: true } } } },
      payoutLines: { select: { amountMmk: true, kind: true } },
      uplineAffiliate: { select: { id: true, code: true, user: { select: { name: true } } } },
      account: { select: { name: true, email: true, phoneNumber: true } },
      pick: { include: { lines: { orderBy: { id: "asc" }, include: { batch: { select: { lotNo: true, expiryDate: true, variant: { select: { sku: true } } } }, location: { select: { code: true, name: true } } } } } },
    },
  });
  if (!order) return null;
  const userIds = [
    ...new Set([...order.history.map((h) => h.userId), order.createdById].filter((x): x is string => !!x)),
  ];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
  const holdExpiresAt = order.reservations.find((r) => r.status === "ACTIVE")?.expiresAt ?? null;
  return {
    ...order,
    userNames: Object.fromEntries(users.map((u) => [u.id, u.name])),
    holdExpiresAt,
    overdue: order.status === "PENDING" && !!holdExpiresAt && holdExpiresAt <= now,
  };
}

/** Dữ liệu cho form tạo đơn tay: danh mục địa chỉ VTP (theo ngôn ngữ giao diện), biến thể đang bán + tồn khả dụng. */
/**
 * Lựa chọn cho form tạo đơn (admin + cổng CTV). `withCommission` (cổng CTV): kèm hoa hồng CTV MMK/cái của từng
 * biến thể (mức ở Giá bán; null = không có hoa hồng) để CTV biết bán món nào được bao nhiêu.
 */
export async function orderFormOptions(locale: string, opts: { withCommission?: boolean; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const [catalog, variants, blockDays] = await Promise.all([
    loadAddressCatalog(locale),
    prisma.variant.findMany({
      where: { active: true, product: { published: true } },
      orderBy: { sku: "asc" },
      include: { product: { include: { translations: true } } },
    }),
    salesBlockDays(),
  ]);
  const ids = variants.map((v) => v.id);
  const [avail, capacity] = await Promise.all([prisma.$transaction((tx) => availableToSell(tx, ids, { now, blockDays })), preorderCapacity(prisma, ids)]);
  return {
    catalog,
    variants: variants.map((v) => ({
      id: v.id,
      label: `${v.sku} — ${variantDisplayName(productName(v.product.translations, v.product.slug), v.label)}`,
      priceMmk: v.priceMmk,
      available: avail.get(v.id) ?? 0,
      /** Số cái còn nhận đặt trước khi hết hàng (0 = không nhận / còn hàng) — cùng quy tắc storefront (19/11/2026). */
      preorder: (avail.get(v.id) ?? 0) > 0 ? 0 : (capacity.get(v.id) ?? 0),
      ...(opts.withCommission && { commissionMmk: v.affiliateCommissionMmk }),
    })),
  };
}
export type OrderFormOptions = Awaited<ReturnType<typeof orderFormOptions>>;

/** Khách cũ theo SĐT (điền sẵn form tạo đơn tay). */
export async function findCustomerByPhone(input: string) {
  const phone = normalizeMmPhone(input);
  if (!phone) return null;
  return prisma.customer.findUnique({
    where: { phone },
    include: { addresses: { orderBy: { id: "desc" }, take: 5 }, _count: { select: { orders: true } } },
  });
}

export async function sellableLocations() {
  return prisma.location.findMany({
    where: { sellable: true, active: true },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
}

export async function quarantineLocations() {
  return prisma.location.findMany({
    where: { type: "QUARANTINE", active: true },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
}
