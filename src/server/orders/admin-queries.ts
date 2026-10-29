import "server-only";
import { prisma } from "@/lib/db";
import { loadAddressCatalog } from "@/server/locations/locations";
import type { OrderChannel, OrderStatus, Prisma } from "@/generated/prisma/client";
import { salesBlockDays } from "@/server/inventory/documents";
import { productName } from "@/server/inventory/queries";
import { availableToSell } from "./availability";
import { normalizeMmPhone } from "@/lib/phone";
import { ORDER_STATUSES } from "./state-machine";

/** Truy vấn cho admin đơn hàng (đọc, không thay đổi dữ liệu). */

export type OrderListFilter = { status?: string; channel?: string; q?: string; overdue?: boolean; affiliateId?: string };

const CHANNELS = ["WEB", "FACEBOOK", "VIBER", "PHONE"] as const;

export async function listOrdersAdmin(filter: OrderListFilter, now = new Date()) {
  const where: Prisma.OrderWhereInput = {};
  if (filter.status && (ORDER_STATUSES as readonly string[]).includes(filter.status)) {
    where.status = filter.status as OrderStatus;
  }
  if (filter.channel && (CHANNELS as readonly string[]).includes(filter.channel)) {
    where.channel = filter.channel as OrderChannel;
  }
  if (filter.affiliateId) where.affiliateId = filter.affiliateId;
  const q = filter.q?.trim();
  if (q) {
    const phone = normalizeMmPhone(q);
    where.OR = [
      { code: { contains: q.toUpperCase() } },
      { recipientName: { contains: q, mode: "insensitive" } },
      ...(phone ? [{ recipientPhone: phone }] : [{ recipientPhone: { contains: q.replace(/\D/g, "") || q } }]),
    ];
  }
  const overdueWhere: Prisma.OrderWhereInput = {
    status: "PENDING",
    reservations: { some: { status: "ACTIVE", expiresAt: { lte: now } } },
  };
  if (filter.overdue) Object.assign(where, overdueWhere);

  const [orders, overdueIds] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { _count: { select: { items: true } }, affiliate: { select: { code: true } } },
    }),
    prisma.order.findMany({ where: overdueWhere, select: { id: true } }),
  ]);
  const overdue = new Set(overdueIds.map((o) => o.id));
  return orders.map((o) => ({ ...o, overdue: overdue.has(o.id) }));
}

export async function getOrderAdmin(id: string, now = new Date()) {
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: { include: { allocations: { include: { batch: { select: { lotNo: true, expiryDate: true } } } } } },
      history: { orderBy: { createdAt: "asc" } },
      paymentProofs: { orderBy: { createdAt: "desc" }, include: { file: { select: { url: true, mime: true } } } },
      deliveries: { orderBy: { createdAt: "desc" } },
      reservations: true,
      documents: { select: { id: true, code: true, type: true, status: true } },
      affiliate: { select: { id: true, code: true, user: { select: { name: true } } } },
      payoutLines: { select: { amountMmk: true, kind: true } },
      uplineAffiliate: { select: { id: true, code: true, user: { select: { name: true } } } },
      account: { select: { name: true, email: true } },
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
export async function orderFormOptions(locale: string, now = new Date()) {
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
  const avail = await prisma.$transaction((tx) => availableToSell(tx, ids, { now, blockDays }));
  return {
    catalog,
    variants: variants.map((v) => ({
      id: v.id,
      label: `${v.sku} — ${productName(v.product.translations, v.product.slug)} (${v.label})`,
      priceMmk: v.priceMmk,
      available: avail.get(v.id) ?? 0,
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
    where: { sellable: true },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
}

export async function quarantineLocations() {
  return prisma.location.findMany({
    where: { type: "QUARANTINE" },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
}
