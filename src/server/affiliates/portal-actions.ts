"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { ZodError } from "zod";
import { clientIp } from "@/lib/client-ip";
import { requireAffiliate } from "@/server/auth/session";
import type { ActionState } from "@/server/inventory/actions";
import { OrderError } from "@/server/orders/errors";
import { createOrder } from "@/server/orders/orders";
import { orderErrorText } from "@/server/orders/error-text";
import { MIN_STAFF_PASSWORD } from "@/server/auth/roles";
import { ApplicationError, submitApplication } from "./applications";

/** Server Action của cổng CTV (P10c). CTV lấy từ phiên đăng nhập — không nhận id CTV từ form. */

/** CTV tự lên đơn cho khách: đơn PENDING như đơn thường, gắn CTV (nguồn AFFILIATE), người tạo = CTV. */
export async function createAffiliateOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let id: string;
  try {
    const user = await requireAffiliate();
    const payload = JSON.parse(String(formData.get("payload") ?? "{}"));
    id = (await createOrder(payload, { userId: user.id, affiliate: { source: "AFFILIATE", id: user.affiliateId } })).id;
  } catch (e) {
    const t = await getTranslations("Orders");
    // Cùng câu báo lỗi chi tiết như admin (SKU thiếu hàng còn/cần, SKU chưa có giá…).
    if (e instanceof OrderError) return { error: await orderErrorText(e) };
    if (e instanceof ZodError) return { error: t("err.invalid_form") };
    throw e;
  }
  revalidatePath("/ctv");
  redirect(`/ctv/orders/${id}?created=1`);
}

/** Đăng ký làm CTV qua link mời (trang công khai /ctv/join, không cần đăng nhập). */
export async function submitApplicationAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const t = await getTranslations("Ctv");
  try {
    const ip = clientIp(await headers());
    await submitApplication(
      {
        invite: String(fd.get("invite") ?? ""),
        name: String(fd.get("name") ?? ""),
        phone: String(fd.get("phone") ?? ""),
        email: String(fd.get("email") ?? ""),
        password: String(fd.get("password") ?? ""),
        confirmPassword: String(fd.get("confirmPassword") ?? ""),
      },
      { ip, honeypot: String(fd.get("website") ?? "") },
    );
  } catch (e) {
    if (e instanceof ApplicationError) return { error: t(`join.errors.${e.code}`) };
    if (e instanceof ZodError) {
      const issue = e.issues[0];
      if (issue?.message === "mismatch") return { error: t("join.errors.mismatch") };
      if (issue?.path[0] === "password") return { error: t("join.errors.tooShort", { min: MIN_STAFF_PASSWORD }) };
      if (issue?.path[0] === "email") return { error: t("join.errors.email") };
      return { error: t("join.errors.invalid") };
    }
    throw e;
  }
  return { ok: "sent" };
}
