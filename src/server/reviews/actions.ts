"use server";

import { refresh, revalidatePath, updateTag } from "next/cache";
import { getTranslations } from "next-intl/server";
import { hasLocale } from "next-intl";
import { ZodError } from "zod";
import { routing } from "@/i18n/routing";
import { requirePermission } from "@/server/auth/session";
import { customerOrder } from "@/server/accounts/order-access";
import type { StoreActionState } from "@/server/cart/actions";
import type { ActionState } from "@/server/inventory/actions";
import { OrderError } from "@/server/orders/errors";
import { moderateReview, REVIEWS_TAG, submitReview } from "./reviews";

/** Khách gửi đánh giá từ trang đơn (quyền truy cập đơn = cookie mã đơn + SĐT hoặc tài khoản, như upload biên lai). */
export async function submitReviewAction(_prev: StoreActionState, formData: FormData): Promise<StoreActionState> {
  const l = formData.get("locale");
  const locale = hasLocale(routing.locales, l) ? l : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "Review" });
  try {
    const code = String(formData.get("code") ?? "");
    const order = await customerOrder(code);
    if (!order) throw new OrderError("not_found", "Không có quyền với đơn này");
    await submitReview(
      { productId: formData.get("productId"), rating: formData.get("rating"), body: formData.get("body") || undefined },
      { code: order.code, phone: order.recipientPhone },
    );
  } catch (e) {
    if (e instanceof ZodError) return { error: t("errRating") };
    if (e instanceof OrderError) return { error: t("errGeneric") };
    throw e;
  }
  refresh();
  return { ok: true };
}

export async function moderateReviewAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("reviews:moderate");
    await moderateReview(String(formData.get("reviewId")), formData.get("decision") === "approve", user.id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  updateTag(REVIEWS_TAG); // trang SP hiện/ẩn đánh giá ngay (P20)
  revalidatePath("/admin/reviews");
  return { ok: "done" };
}
