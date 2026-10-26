"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { hasLocale } from "next-intl";
import { z, ZodError } from "zod";
import { redirect } from "@/i18n/navigation";
import { routing, type StoreLocale } from "@/i18n/routing";
import { normalizeRefCode, REF_COOKIE } from "@/server/affiliates/referral";
import { OrderError } from "@/server/orders/errors";
import { createOrder, findOrderForCustomer } from "@/server/orders/orders";
import { submitPaymentProof } from "@/server/orders/payments";
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

/** Server Action của storefront (khách không đăng nhập). Mọi dữ liệu được kiểm lại ở domain. */

export type StoreActionState = { error?: string; ok?: boolean } | undefined;

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
  await writeCart(addLine(await readCart(), String(formData.get("variantId")), Number(formData.get("qty") ?? 1)));
  redirect({ href: intent === "buy" ? "/checkout" : "/cart", locale });
}

/** Đổi số lượng / xoá dòng (qty = 0). Trang giỏ tự render lại sau khi cookie đổi. */
export async function setCartQtyAction(formData: FormData) {
  await writeCart(setLine(await readCart(), String(formData.get("variantId")), Number(formData.get("qty"))));
}

export async function placeOrderAction(_prev: StoreActionState, formData: FormData): Promise<StoreActionState> {
  const locale = localeOf(formData);
  const items = await readCart();
  let order;
  try {
    if (items.length === 0) throw new OrderError("variant_unavailable", "Giỏ hàng trống");
    order = await createOrder(
      {
        channel: "WEB",
        paymentMethod: formData.get("paymentMethod"),
        name: formData.get("name"),
        phone: formData.get("phone"),
        zoneId: formData.get("zoneId"),
        addressLine: formData.get("addressLine"),
        note: formData.get("note") || undefined,
        locale,
        items,
        idempotencyKey: formData.get("idempotencyKey") || undefined,
      },
      { userId: null, affiliate: await referralFromCookie() },
    );
  } catch (e) {
    return { error: await errorText(e, locale) };
  }
  await writeCart([]);
  await rememberOrder(order.code, order.recipientPhone);
  redirect({ href: { pathname: `/order/${order.code}`, query: { placed: "1" } }, locale });
}

/** Tra đơn bằng mã đơn + SĐT; đúng thì ghi nhớ trên trình duyệt và mở trang đơn. */
export async function trackOrderAction(_prev: StoreActionState, formData: FormData): Promise<StoreActionState> {
  const locale = localeOf(formData);
  const order = await findOrderForCustomer(String(formData.get("code") ?? ""), String(formData.get("phone") ?? ""));
  if (!order) {
    const t = await getTranslations({ locale, namespace: "Track" });
    return { error: t("notFound") };
  }
  await rememberOrder(order.code, order.recipientPhone);
  redirect({ href: `/order/${order.code}`, locale });
}

export async function uploadProofAction(_prev: StoreActionState, formData: FormData): Promise<StoreActionState> {
  const locale = localeOf(formData);
  const code = String(formData.get("code") ?? "");
  try {
    const access = parseOrderAccess((await cookies()).get(ORDERS_COOKIE)?.value).find((a) => a.c === code);
    if (!access) throw new OrderError("not_found", "Không có quyền với đơn này");
    const file = formData.get("file");
    if (!(file instanceof File)) throw new OrderError("invalid_file", "Thiếu file");
    await submitPaymentProof({
      orderCode: code,
      phone: access.p,
      file: { data: Buffer.from(await file.arrayBuffer()), mime: file.type },
    });
  } catch (e) {
    return { error: await errorText(e, locale) };
  }
  refresh();
  return { ok: true };
}
