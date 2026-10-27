import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { toUnicode } from "@/lib/myanmar";
import { manualShipping } from "@/server/adapters/shipping";
import { uplineSnapshot } from "@/server/affiliates/upline";
import { newCode } from "@/server/codes";
import { salesBlockDays } from "@/server/inventory/documents";
import type { Tx } from "@/server/inventory/ledger";
import { getBoolSetting, getNumberSetting } from "@/server/settings";
import { OrderError } from "./errors";
import { normalizeMmPhone, orderTotals } from "./pricing";
import { reserveForOrder } from "./reservations";

/**
 * Tạo đơn — dùng chung cho storefront (khách tự đặt) và admin (đơn từ FB/Viber/điện thoại).
 * Giá và phí ship luôn lấy từ DB, không tin số liệu từ client.
 * Một transaction: khách/địa chỉ → đơn + dòng (snapshot) → giữ hàng → lịch sử.
 */

const HOUR_MS = 60 * 60 * 1000;
const id = z.string().min(1);
const text = (max: number) => z.string().trim().max(max).transform(toUnicode);

export const createOrderSchema = z.object({
  channel: z.enum(["WEB", "FACEBOOK", "VIBER", "PHONE"]).default("WEB"),
  paymentMethod: z.enum(["COD", "BANK_TRANSFER"]),
  name: text(100).pipe(z.string().min(1)),
  phone: z.string().trim().min(1).max(30),
  zoneId: id,
  addressLine: text(500).pipe(z.string().min(3)),
  note: text(500).optional(),
  locale: z.enum(["my", "en"]).default("my"),
  items: z
    .array(z.object({ variantId: id, qty: z.coerce.number().int().positive().max(99) }))
    .min(1)
    .max(50),
  idempotencyKey: z.string().min(8).max(100).optional(),
});
export type CreateOrderInput = z.input<typeof createOrderSchema>;

/**
 * `userId` = nhân viên / CTV tạo đơn tay; null = khách đặt trên web (kênh luôn là WEB).
 * `affiliate` (P10): mã từ cookie link giới thiệu (khách web — mã sai/CTV đã khoá thì bỏ qua),
 * hoặc id CTV khi CTV tự lên đơn / nhân viên gán (không hợp lệ → lỗi).
 */
export type CreateOrderContext = {
  userId: string | null;
  now?: Date;
  affiliate?: { source: "LINK"; code: string } | { source: "AFFILIATE" | "STAFF"; id: string };
};

export async function createOrder(raw: unknown, ctx: CreateOrderContext) {
  const input = createOrderSchema.parse(raw);
  const channel = ctx.userId ? input.channel : "WEB";
  if (!ctx.userId && !(await getBoolSetting("store.checkoutEnabled"))) {
    throw new OrderError("checkout_disabled", "Đang tạm ngừng nhận đơn trên web");
  }
  const phone = normalizeMmPhone(input.phone);
  if (!phone) throw new OrderError("invalid_phone", "Số điện thoại không hợp lệ");

  if (input.idempotencyKey) {
    const existing = await prisma.order.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return existing;
  }

  // Gộp dòng trùng biến thể.
  const qtyByVariant = new Map<string, number>();
  for (const i of input.items) qtyByVariant.set(i.variantId, (qtyByVariant.get(i.variantId) ?? 0) + i.qty);
  const items = [...qtyByVariant].map(([variantId, qty]) => ({ variantId, qty }));

  const now = ctx.now ?? new Date();
  const [blockDays, holdHours] = await Promise.all([
    salesBlockDays(),
    getNumberSetting(input.paymentMethod === "COD" ? "cod.confirmHours" : "reservation.transferHours"),
  ]);

  try {
    return await prisma.$transaction(
      async (tx) => {
        const lines = await priceLines(tx, items, input.locale);
        const zone = await tx.shippingZone.findFirst({ where: { id: input.zoneId, active: true } });
        if (!zone) throw new OrderError("invalid_zone", "Vùng giao hàng không hợp lệ");

        const shipping = manualShipping(async (zoneId) =>
          tx.shippingRate.findFirst({ where: { zoneId }, select: { feeMmk: true, freeFromMmk: true, etaDays: true } }),
        );
        const subtotal = orderTotals(lines, 0).subtotalMmk;
        const quote = await shipping.quote({ zoneId: zone.id, subtotalMmk: subtotal });
        if (!quote) throw new OrderError("invalid_zone", "Vùng giao hàng chưa có bảng phí");
        const totals = orderTotals(lines, quote.feeMmk);
        const affiliate = await resolveAffiliate(tx, ctx.affiliate);

        const customer = await tx.customer.upsert({
          where: { phone },
          update: { name: input.name },
          create: { phone, name: input.name },
        });
        const address =
          (await tx.address.findFirst({
            where: { customerId: customer.id, zoneId: zone.id, line: input.addressLine },
          })) ?? (await tx.address.create({ data: { customerId: customer.id, zoneId: zone.id, line: input.addressLine } }));

        const order = await tx.order.create({
          data: {
            code: newCode("OD", now),
            customerId: customer.id,
            addressId: address.id,
            recipientName: input.name,
            recipientPhone: phone,
            addressText: input.addressLine,
            zoneName: `${zone.nameMy} / ${zone.nameEn}`,
            channel,
            paymentMethod: input.paymentMethod,
            subtotalMmk: totals.subtotalMmk,
            shippingFeeMmk: totals.shippingFeeMmk,
            totalMmk: totals.totalMmk,
            locale: input.locale,
            note: input.note || null,
            idempotencyKey: input.idempotencyKey,
            createdById: ctx.userId,
            createdAt: now,
            ...(affiliate && {
              affiliateId: affiliate.id,
              affiliateSource: ctx.affiliate!.source,
              commissionRateBp: affiliate.commissionRateBp,
              ...(await uplineSnapshot(tx, affiliate.parentId)),
            }),
            items: { create: lines.map(({ variantId, sku, name, qty, unitPriceMmk }) => ({ variantId, sku, name, qty, unitPriceMmk })) },
            history: { create: { toStatus: "PENDING", userId: ctx.userId, createdAt: now } },
          },
        });

        await reserveForOrder(
          tx,
          { orderId: order.id, items, expiresAt: new Date(now.getTime() + holdHours * HOUR_MS) },
          { now, blockDays },
        );
        await tx.auditLog.create({
          data: {
            userId: ctx.userId,
            action: "order.create",
            entity: "Order",
            entityId: order.id,
            data: { code: order.code, channel, ...(affiliate && { affiliateId: affiliate.id, affiliateSource: ctx.affiliate!.source }) },
          },
        });
        return order;
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
  } catch (e) {
    // Hai request cùng idempotencyKey chạy song song: request thua trả về đơn đã tạo.
    if (input.idempotencyKey && e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const existing = await prisma.order.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (existing) return existing;
    }
    throw e;
  }
}

/** CTV đang hoạt động (cả hồ sơ CTV lẫn tài khoản). Link giới thiệu không hợp lệ → bỏ qua; id không hợp lệ → lỗi. */
async function resolveAffiliate(tx: Tx, ref: CreateOrderContext["affiliate"]) {
  if (!ref) return null;
  const a = await tx.affiliate.findFirst({
    where: { ...(ref.source === "LINK" ? { code: ref.code } : { id: ref.id }), active: true, user: { active: true } },
    select: { id: true, commissionRateBp: true, parentId: true },
  });
  if (!a && ref.source !== "LINK") throw new OrderError("invalid_affiliate", "CTV không tồn tại hoặc đã bị khoá");
  return a;
}

/** Giá hiện hành + snapshot tên/sku. Biến thể ngừng bán hoặc sản phẩm chưa đăng → lỗi. */
async function priceLines(tx: Tx, items: { variantId: string; qty: number }[], locale: string) {
  const variants = await tx.variant.findMany({
    where: { id: { in: items.map((i) => i.variantId) }, active: true, product: { published: true } },
    include: { product: { include: { translations: true } } },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));
  return items.map((i) => {
    const v = byId.get(i.variantId);
    if (!v) throw new OrderError("variant_unavailable", "Sản phẩm không còn bán", { variantId: i.variantId });
    const tr = v.product.translations.find((t) => t.locale === locale) ?? v.product.translations[0];
    return {
      variantId: v.id,
      sku: v.sku,
      name: `${tr?.name ?? v.sku} — ${v.label}`,
      qty: i.qty,
      unitPriceMmk: v.priceMmk,
    };
  });
}

/** Phần đơn khách được xem (trang đơn storefront). */
const customerOrderInclude = {
  items: true,
  paymentProofs: { orderBy: { createdAt: "desc" }, select: { id: true, status: true, createdAt: true } },
  deliveries: { orderBy: { createdAt: "desc" } },
  history: { orderBy: { createdAt: "asc" }, select: { toStatus: true, createdAt: true } },
  reservations: { where: { status: "ACTIVE" }, select: { expiresAt: true }, take: 1 },
} satisfies Prisma.OrderInclude;

/** Tra đơn cho khách: phải khớp cả mã đơn và SĐT. */
export async function findOrderForCustomer(code: string, phoneInput: string) {
  const phone = normalizeMmPhone(phoneInput);
  if (!phone) return null;
  const order = await prisma.order.findUnique({ where: { code: code.trim().toUpperCase() }, include: customerOrderInclude });
  return order && order.recipientPhone === phone ? order : null;
}

/** Đơn thuộc tài khoản khách đang đăng nhập (P14). */
export async function findOrderForAccount(code: string, userId: string) {
  const order = await prisma.order.findUnique({ where: { code: code.trim().toUpperCase() }, include: customerOrderInclude });
  return order && order.accountId === userId ? order : null;
}
