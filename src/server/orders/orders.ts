import "server-only";
import { isStandardVariantLabel } from "@/lib/variant-label";
import { STORE_PRODUCT } from "@/server/catalog/store-visibility";
import { z } from "zod";
import { localeSchema, mmText, phone2Schema, phoneSchema, rawId } from "@/lib/schemas";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { uplineSnapshot } from "@/server/affiliates/upline";
import { newCode } from "@/server/codes";
import { salesBlockDays } from "@/server/inventory/documents";
import { findActiveTownship, townshipLabel, vtpCodes } from "@/server/locations/locations";
import { pick } from "@/server/catalog/queries";
import type { Tx } from "@/server/inventory/ledger";
import { getBoolSetting, getNumberSetting } from "@/server/settings";
import { OrderError } from "./errors";
import { normalizeMmPhone } from "@/lib/phone";
import { orderTotals } from "./pricing";
import { reserveForOrder } from "./reservations";
import { planOrderStock } from "./preorder";
import { recordOrderEvent } from "@/server/analytics/record";
import { commissionPerUnitSnapshot, saleRateSnapshotBp } from "@/server/affiliates/commission";

/**
 * Tạo đơn — dùng chung cho storefront (khách tự đặt) và admin (đơn từ FB/Viber/điện thoại).
 * Giá và phí ship luôn lấy từ DB, không tin số liệu từ client.
 * Một transaction: khách/địa chỉ → đơn + dòng (snapshot) → giữ hàng → lịch sử.
 * QT3: thiếu hàng nhưng đặt trước được → đơn `AWAITING_STOCK` (`preorder`), không giữ hàng (`planOrderStock`).
 */

const HOUR_MS = 60 * 60 * 1000;

export const createOrderSchema = z.object({
  channel: z.enum(["WEB", "FACEBOOK", "VIBER", "PHONE"]).default("WEB"),
  paymentMethod: z.enum(["COD", "BANK_TRANSFER"]),
  shippingPayer: z.enum(["RECEIVER", "SENDER"]).default("RECEIVER"),
  name: mmText(100).pipe(z.string().min(1)),
  phone: phoneSchema,
  /** SĐT phụ người nhận (P15, không bắt buộc). */
  phone2: phone2Schema,
  /** Thị trấn VTP (P15) — server tra lại cả 3 cấp. */
  townshipId: rawId,
  addressLine: mmText(500).pipe(z.string().min(3)),
  note: mmText(500).optional(),
  locale: localeSchema.default("my"),
  items: z
    .array(z.object({ variantId: rawId, qty: z.coerce.number().int().positive().max(99) }))
    .min(1)
    .max(50),
  idempotencyKey: z.string().min(8).max(100).optional(),
});

/**
 * `userId` = nhân viên / CTV tạo đơn tay; null = khách đặt trên web (kênh luôn là WEB).
 * `affiliate` (P10): mã từ cookie link giới thiệu (khách web — mã sai/CTV đã khoá thì bỏ qua),
 * hoặc id CTV khi CTV tự lên đơn / nhân viên gán (không hợp lệ → lỗi).
 * `accountId` (P14): tài khoản khách đặt đơn trên web (Server Action bắt buộc đăng nhập; domain không ép).
 */
export type CreateOrderContext = {
  analytics?: unknown;
  userId: string | null;
  accountId?: string | null;
  now?: Date;
  affiliate?: { source: "LINK"; code: string } | { source: "AFFILIATE" | "STAFF"; id: string };
};

export async function createOrder(raw: unknown, ctx: CreateOrderContext) {
  const input = createOrderSchema.parse(raw);
  const channel = ctx.userId ? input.channel : "WEB";
  // `userId` = nhân viên/CTV tạo đơn. Đơn web của khách (kể cả đã đăng nhập — tài khoản nằm ở `accountId`) luôn có
  // userId null → tắt "Nhận đơn trên web" chặn MỌI đơn khách trên web, khớp trang checkout; đơn nhân viên/CTV vẫn đi qua.
  if (!ctx.userId && !(await getBoolSetting("store.checkoutEnabled"))) {
    throw new OrderError("checkout_disabled", "Đang tạm ngừng nhận đơn trên web");
  }
  const phone = normalizeMmPhone(input.phone);
  if (!phone) throw new OrderError("invalid_phone", "Số điện thoại không hợp lệ");
  const phone2 = input.phone2 ? normalizeMmPhone(input.phone2) : null;
  if (input.phone2 && !phone2) throw new OrderError("invalid_phone", "Số điện thoại phụ không hợp lệ", { field: "phone2" });

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
        // QT3 + 19/11/2026: MỌI đơn (khách trên web, nhân viên, CTV tạo tay) thiếu hàng mà còn hạn mức đặt trước → đơn đặt trước.
        const stock = await planOrderStock(tx, items, { now, blockDays });
        const status = stock.preorder ? ("AWAITING_STOCK" as const) : ("PENDING" as const);
        const township = await findActiveTownship(input.townshipId, tx);
        if (!township) throw new OrderError("invalid_zone", "Địa chỉ giao hàng không hợp lệ");
        // P15: phí ship do đơn vị vận chuyển (VTP) thu trực tiếp khi giao → đơn chỉ tính tiền hàng.
        const totals = orderTotals(lines, 0);
        const affiliate = await resolveAffiliate(tx, ctx.affiliate);

        const customer = await tx.customer.upsert({
          where: { phone },
          update: { name: input.name },
          create: { phone, name: input.name },
        });
        const address =
          (await tx.address.findFirst({
            where: { customerId: customer.id, townshipId: township.id, line: input.addressLine },
          })) ??
          (await tx.address.create({ data: { customerId: customer.id, townshipId: township.id, line: input.addressLine } }));

        const order = await tx.order.create({
          data: {
            code: newCode("OD", now),
            customerId: customer.id,
            addressId: address.id,
            recipientName: input.name,
            recipientPhone: phone,
            recipientPhone2: phone2 && phone2 !== phone ? phone2 : null,
            addressText: input.addressLine,
            zoneName: townshipLabel(township),
            townshipId: township.id,
            ...vtpCodes(township),
            channel,
            paymentMethod: input.paymentMethod,
            shippingPayer: ctx.userId ? input.shippingPayer : "RECEIVER",
            subtotalMmk: totals.subtotalMmk,
            shippingFeeMmk: totals.shippingFeeMmk,
            totalMmk: totals.totalMmk,
            locale: input.locale,
            note: input.note || null,
            idempotencyKey: input.idempotencyKey,
            createdById: ctx.userId,
            accountId: ctx.accountId ?? null,
            createdAt: now,
            status,
            preorder: stock.preorder,
            ...(affiliate && {
              affiliateId: affiliate.id,
              affiliateSource: ctx.affiliate!.source,
              commissionRateBp: saleRateSnapshotBp(),
              ...(await uplineSnapshot(tx, affiliate.parentId)),
            }),
            // Đơn có CTV: chốt mức hoa hồng cố định của từng biến thể (null = dòng tính theo % của đơn).
            items: {
              create: lines.map(({ variantId, sku, name, qty, unitPriceMmk, affiliateCommissionMmk }) => ({
                variantId, sku, name, qty, unitPriceMmk, commissionPerUnitMmk: commissionPerUnitSnapshot(affiliateCommissionMmk, !!affiliate),
              })),
            },
            history: { create: { toStatus: status, userId: ctx.userId, createdAt: now } },
          },
        });

        if (!stock.preorder) {
          await reserveForOrder(
            tx,
            { orderId: order.id, items, expiresAt: new Date(now.getTime() + holdHours * HOUR_MS) },
            { now, blockDays },
          );
        }
        await tx.auditLog.create({
          data: {
            userId: ctx.userId,
            action: "order.create",
            entity: "Order",
            entityId: order.id,
            data: { code: order.code, channel, ...(stock.preorder && { preorder: true }), ...(affiliate && { affiliateId: affiliate.id, affiliateSource: ctx.affiliate!.source }) },
          },
        });
        await recordOrderEvent(tx, "purchase", order, { context: ctx.analytics });
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
    select: { id: true, parentId: true },
  });
  if (!a && ref.source !== "LINK") throw new OrderError("invalid_affiliate", "CTV không tồn tại hoặc đã bị khoá");
  return a;
}

/**
 * Giá hiện hành + snapshot tên/sku. Biến thể ngừng bán hoặc sản phẩm chưa đăng → lỗi.
 * Giá ≤ 0 (chưa tính giá / nhập thiếu) → lỗi cho mọi kênh, kể cả đơn nhân viên/CTV; quà/tester không đi qua đây.
 */
async function priceLines(tx: Tx, items: { variantId: string; qty: number }[], locale: string) {
  const variants = await tx.variant.findMany({
    where: { id: { in: items.map((i) => i.variantId) }, active: true, product: STORE_PRODUCT },
    include: { product: { include: { translations: true } } },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));
  return items.map((i) => {
    const v = byId.get(i.variantId);
    if (!v) throw new OrderError("variant_unavailable", "Sản phẩm không còn bán", { variantId: i.variantId });
    if (v.priceMmk <= 0) {
      throw new OrderError("price_missing", `Sản phẩm ${v.sku} chưa có giá bán`, { variantId: v.id, sku: v.sku });
    }
    const tr = pick(v.product.translations, locale);
    return {
      variantId: v.id,
      sku: v.sku,
      // Snapshot cho khách: không chép nhãn hệ thống "Tiêu chuẩn" (tiếng của admin) vào tên dòng; đơn cũ giữ nguyên.
      name: isStandardVariantLabel(v.label) ? (tr?.name ?? v.sku) : `${tr?.name ?? v.sku} — ${v.label}`,
      qty: i.qty,
      unitPriceMmk: v.priceMmk,
      affiliateCommissionMmk: v.affiliateCommissionMmk,
    };
  });
}

/** Phần đơn khách được xem (trang đơn storefront). */
const customerOrderInclude = {
  // Khách không được thấy mức hoa hồng CTV chốt trên dòng đơn.
  items: { omit: { commissionPerUnitMmk: true } },
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
