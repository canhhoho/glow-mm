"use server";

import { cookies, headers } from "next/headers";
import { redirect as nextRedirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { hasLocale } from "next-intl";
import { z, ZodError } from "zod";
import { redirect } from "@/i18n/navigation";
import { routing, type StoreLocale } from "@/i18n/routing";
import { clientIp } from "@/lib/client-ip";
import { localePrefix } from "@/lib/site";
import { hitRateLimit } from "@/server/rate-limit";
import { prisma } from "@/lib/db";
import { claimOrders } from "@/server/accounts/claims";
import { normalizeRefCode, REF_COOKIE } from "@/server/affiliates/referral";
import { createAddress } from "@/server/accounts/accounts";
import { getCustomerUser, requireCustomer } from "@/server/auth/customer-session";
import { OrderError } from "@/server/orders/errors";
import { createOrder, findOrderForCustomer } from "@/server/orders/orders";
import {
  addLine,
  addOrderAccess,
  CART_COOKIE,
  ORDERS_COOKIE,
  parseCart,
  parseOrderAccess,
  serializeCart,
  setLine,
} from "./cart";

/** Server Action của storefront. Mọi dữ liệu được kiểm lại ở domain. */

export type StoreActionState = { error?: string; ok?: boolean; fieldErrors?: Record<string, string>; cartError?: boolean; sku?: string } | undefined;

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};

function localeOf(fd: FormData): StoreLocale {
  const l = fd.get("locale");
  return hasLocale(routing.locales, l) ? l : routing.defaultLocale;
}

async function readCart() {
  return parseCart((await cookies()).get(CART_COOKIE)?.value);
}

async function writeCart(lines: ReturnType<typeof parseCart>) {
  const jar = await cookies();
  if (lines.length === 0) jar.delete(CART_COOKIE);
  else jar.set(CART_COOKIE, serializeCart(lines), COOKIE_OPTS);
}

/**
 * Giỏ sau khi bỏ dòng trỏ tới biến thể ĐÃ BỊ XOÁ HẲN (SP nháp bị xoá, dữ liệu cũ…). Trang giỏ/checkout (`getCartDetails`)
 * vốn không hiện các dòng này → đặt hàng cũng không được vấp vào chúng (trước đây báo "không còn bán" mà giỏ trông bình
 * thường). Biến thể còn nhưng ngừng bán / SP ẩn vẫn giữ để trang giỏ báo rõ từng dòng. Có dòng bị bỏ → ghi lại cookie.
 */
async function readLiveCart() {
  const lines = await readCart();
  if (lines.length === 0) return lines;
  const found = await prisma.variant.findMany({ where: { id: { in: lines.map((l) => l.variantId) } }, select: { id: true } });
  const ids = new Set(found.map((v) => v.id));
  const live = lines.filter((l) => ids.has(l.variantId));
  if (live.length !== lines.length) await writeCart(live);
  return live;
}

/** CTV giới thiệu (cookie do proxy đặt khi khách mở link `?ref=`) — đọc phía server, không tin dữ liệu form. */
async function referralFromCookie() {
  const code = normalizeRefCode((await cookies()).get(REF_COOKIE)?.value);
  return code ? { source: "LINK" as const, code } : undefined;
}

async function rememberOrder(code: string, phone: string) {
  const jar = await cookies();
  const list = addOrderAccess(parseOrderAccess(jar.get(ORDERS_COOKIE)?.value), { c: code, p: phone });
  jar.set(ORDERS_COOKIE, JSON.stringify(list), { ...COOKIE_OPTS, maxAge: 60 * 60 * 24 * 90 });
}

async function errorText(e: unknown, locale: StoreLocale): Promise<string> {
  const t = await getTranslations({ locale, namespace: "Checkout" });
  if (e instanceof OrderError) return t(`err.${e.code}`);
  if (e instanceof ZodError) return t("err.invalid_form");
  console.error(e);
  return t("err.unknown");
}

/** Nút bấm trên trang SP: "Thêm giỏ hàng" (mặc định) → giỏ; "Mua ngay" (intent=buy) → thẳng checkout. */
const addIntent = z.enum(["cart", "buy"]).catch("cart");

export async function addToCartAction(formData: FormData) {
  const locale = localeOf(formData);
  const intent = addIntent.parse(formData.get("intent") ?? "cart");
  await writeCart(addLine(await readLiveCart(), String(formData.get("variantId")), Number(formData.get("qty") ?? 1)));
  if (intent === "buy" && !(await getCustomerUser())) {
    // Redirect của Server Action render thẳng trang đích, không qua proxy → tự chuyển tới đăng nhập (P14c).
    const prefix = localePrefix(locale);
    nextRedirect(`${prefix}/login?next=${encodeURIComponent(`${prefix}/checkout`)}`);
  }
  redirect({ href: intent === "buy" ? "/checkout" : "/cart", locale });
}

/** Đổi số lượng / xoá dòng (qty = 0). Trang giỏ tự render lại sau khi cookie đổi. */
export async function setCartQtyAction(formData: FormData) {
  await writeCart(setLine(await readLiveCart(), String(formData.get("variantId")), Number(formData.get("qty"))));
}

/** Đặt hàng trên web: bắt buộc tài khoản khách (P14c) — đơn gắn `accountId`, tuỳ chọn lưu địa chỉ vào sổ. */
export async function placeOrderAction(_prev: StoreActionState, formData: FormData): Promise<StoreActionState> {
  const locale = localeOf(formData);
  const user = await requireCustomer(locale, "/checkout");
  const items = await readLiveCart();
  if (items.length === 0) {
    // Giỏ trống mà form mang idempotencyKey của một đơn đã tạo (bấm đặt hàng lần 2 sau khi lần 1 đã thành công và xoá giỏ)
    // → mở đơn đó thay vì báo lỗi.
    const key = formData.get("idempotencyKey");
    const placed = typeof key === "string" && key
      ? await prisma.order.findFirst({ where: { idempotencyKey: key, accountId: user.id }, select: { code: true } })
      : null;
    if (placed) redirect({ href: { pathname: `/order/${placed.code}`, query: { placed: "1" } }, locale });
  }
  let order;
  try {
    if (items.length === 0) throw new OrderError("cart_empty", "Giỏ hàng trống");
    order = await createOrder(
      {
        channel: "WEB",
        paymentMethod: formData.get("paymentMethod"),
        name: formData.get("name"),
        phone: formData.get("phone"),
        phone2: formData.get("phone2") || undefined,
        townshipId: formData.get("townshipId"),
        addressLine: formData.get("addressLine"),
        note: formData.get("note") || undefined,
        locale,
        items,
        idempotencyKey: formData.get("idempotencyKey") || undefined,
      },
      // Đăng nhập bằng tài khoản CTV → đơn tính cho chính CTV đó (mua cho mình / đặt hộ khách), bỏ qua link giới thiệu.
      {
        userId: null,
        accountId: user.id,
        analytics: { sessionId: formData.get("analyticsSessionId"), device: formData.get("analyticsDevice") },
        affiliate: user.affiliate ? { source: "AFFILIATE", id: user.affiliate.id } : await referralFromCookie(),
      },
    );
  } catch (e) {
    const error = await errorText(e, locale);
    const fieldErrors: Record<string, string> = {};
    if (e instanceof ZodError) {
      // Câu riêng theo ô để khách biết sửa gì; ô không có câu riêng dùng câu chung.
      const tc = await getTranslations({ locale, namespace: "Checkout" });
      const FIELD_ERR: Record<string, string> = {
        name: "err.invalid_name",
        phone: "err.invalid_phone",
        phone2: "err.invalid_phone",
        townshipId: "err.invalid_zone",
        addressLine: "err.invalid_address",
      };
      for (const issue of e.issues) {
        const field = String(issue.path[0]);
        if (["name", "phone", "phone2", "townshipId", "addressLine", "note", "paymentMethod"].includes(field)) {
          fieldErrors[field] ??= FIELD_ERR[field] ? tc(FIELD_ERR[field]) : error;
        }
      }
    }
    if (e instanceof OrderError && e.code === "invalid_phone") fieldErrors[e.details?.field === "phone2" ? "phone2" : "phone"] = error;
    if (e instanceof OrderError && e.code === "invalid_zone") fieldErrors.townshipId = error;
    const cartError = e instanceof OrderError && ["out_of_stock", "variant_unavailable", "price_missing", "cart_empty"].includes(e.code);
    const variantId = e instanceof OrderError && typeof e.details?.variantId === "string" ? e.details.variantId : undefined;
    const shortages = e instanceof OrderError && Array.isArray(e.details?.variants) ? e.details.variants.flatMap((row: unknown) => row && typeof row === "object" && "variantId" in row && typeof row.variantId === "string" ? [row.variantId] : []) : [];
    const ids = [...new Set([...(variantId ? [variantId] : []), ...shortages])].slice(0, 50);
    const variants = cartError && ids.length ? await prisma.variant.findMany({ where: { id: { in: ids } }, select: { sku: true } }) : [];
    return { error, fieldErrors, cartError, ...(variants.length > 0 && { sku: variants.map(v=>v.sku).join(", ") }) };
  }
  await writeCart([]);
  // Đơn thuộc tài khoản → không cần nhớ mã + SĐT trong cookie. Lưu sổ địa chỉ lỗi (vd đã đủ 10) không chặn đặt hàng.
  if (formData.get("saveAddress") === "on") {
    await createAddress(user.id, {
      recipientName: order.recipientName,
      phone: order.recipientPhone,
      phone2: order.recipientPhone2 ?? undefined,
      townshipId: order.townshipId,
      line: order.addressText,
      note: formData.get("note") || undefined,
    }).catch(() => {});
  }
  redirect({ href: { pathname: `/order/${order.code}`, query: { placed: "1" } }, locale });
}

/** Tra đơn bằng mã đơn + SĐT; đúng thì ghi nhớ trên trình duyệt và mở trang đơn. */
export async function trackOrderAction(_prev: StoreActionState, formData: FormData): Promise<StoreActionState> {
  const locale = localeOf(formData);
  const t = await getTranslations({ locale, namespace: "Track" });
  // Chống dò mã đơn: 20 lần / 10 phút / IP (mạng di động dùng chung IP → không đặt quá chặt).
  if (!(await hitRateLimit(`track:${clientIp(await headers()) || "unknown"}`, 20, 10 * 60_000))) return { error: t("tooMany") };
  const order = await findOrderForCustomer(String(formData.get("code") ?? ""), String(formData.get("phone") ?? ""));
  if (!order) return { error: t("notFound") };
  await rememberOrder(order.code, order.recipientPhone);
  // Đang đăng nhập: đơn vừa chứng minh được (mã + SĐT) gắn luôn vào tài khoản.
  const user = await getCustomerUser();
  if (user) await claimOrders(user.id, [{ c: order.code, p: order.recipientPhone }]);
  redirect({ href: `/order/${order.code}`, locale });
}
