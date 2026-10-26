"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { ZodError } from "zod";
import { requireAffiliate } from "@/server/auth/session";
import type { ActionState } from "@/server/inventory/actions";
import { OrderError } from "@/server/orders/errors";
import { createOrder } from "@/server/orders/orders";

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
    if (e instanceof OrderError) return { error: t(`err.${e.code}`) };
    if (e instanceof ZodError) return { error: t("err.invalid_form") };
    throw e;
  }
  revalidatePath("/ctv");
  redirect(`/ctv/orders/${id}?created=1`);
}
