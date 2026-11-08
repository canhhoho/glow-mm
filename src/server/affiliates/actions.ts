"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { ZodError } from "zod";
import { formId } from "@/lib/schemas";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/server/auth/session";
import { MIN_STAFF_PASSWORD } from "@/server/auth/roles";
import type { ActionState } from "@/server/inventory/actions";
import { resetStaffPassword } from "@/server/users/users";
import {
  AffiliateError,
  assignOrderAffiliate,
  createAffiliate,
  deleteAffiliate,
  recordPayout,
  setAffiliateActive,
  setAffiliateParent,
  setOrderCommissionRates,
  updateAffiliate,
} from "./affiliates";
import { ApplicationError, approveApplication, rejectApplication } from "./applications";

/** Server Action quản lý CTV (quyền `affiliates:manage`) + gán CTV cho đơn (`orders:assign-affiliate`). */

const id = formId(64);

async function message(e: unknown): Promise<string> {
  const t = await getTranslations("Affiliates");
  if (e instanceof AffiliateError) return t(`errors.${e.code}`);
  if (e instanceof ApplicationError) return t(`errors.app_${e.code}`);
  if (e instanceof ZodError) {
    const field = e.issues[0]?.path[0];
    if (field === "email") return t("errors.email");
    if (field === "password" || (field === undefined && e.issues[0]?.code === "too_small")) {
      return t("errors.tooShort", { min: MIN_STAFF_PASSWORD });
    }
    if (field === "commissionPercent") return t("errors.percent");
    if (field === "uplinePercent") return t("errors.uplinePercent");
    return t("errors.invalid");
  }
  return e instanceof Error ? e.message : String(e);
}

const profile = (fd: FormData) => ({
  name: String(fd.get("name") ?? ""),
  phone: String(fd.get("phone") ?? ""),
  code: String(fd.get("code") ?? ""),
  commissionPercent: String(fd.get("commissionPercent") ?? ""),
  uplinePercent: String(fd.get("uplinePercent") ?? ""),
  payoutInfo: String(fd.get("payoutInfo") ?? ""),
});

export async function createAffiliateAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let affiliateId: string;
  try {
    const user = await requirePermission("affiliates:manage");
    const a = await createAffiliate(
      {
        ...profile(fd),
        email: String(fd.get("email") ?? ""),
        password: String(fd.get("password") ?? ""),
        parentId: String(fd.get("parentId") ?? ""),
      },
      user.id,
    );
    affiliateId = a.id;
  } catch (e) {
    return { error: await message(e) };
  }
  revalidatePath("/admin/affiliates");
  redirect(`/admin/affiliates/${affiliateId}?created=1`);
}

export async function updateAffiliateAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("affiliates:manage");
    const affiliateId = id.parse(fd.get("id"));
    await updateAffiliate(affiliateId, { ...profile(fd), email: String(fd.get("email") ?? "") || undefined }, user.id);
    revalidatePath(`/admin/affiliates/${affiliateId}`);
  } catch (e) {
    return { error: await message(e) };
  }
  revalidatePath("/admin/affiliates");
  return { ok: "saved" };
}

export async function deleteAffiliateAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("affiliates:manage");
    await deleteAffiliate(id.parse(fd.get("id")), { userId: user.id, role: user.role });
  } catch (e) {
    return { error: await message(e) };
  }
  revalidatePath("/admin/affiliates", "layout");
  redirect("/admin/affiliates");
}

export async function setAffiliateActiveAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("affiliates:manage");
    const affiliateId = id.parse(fd.get("id"));
    await setAffiliateActive(affiliateId, fd.get("active") === "true", user.id);
    revalidatePath(`/admin/affiliates/${affiliateId}`);
  } catch (e) {
    return { error: await message(e) };
  }
  revalidatePath("/admin/affiliates");
  return { ok: "saved" };
}

export async function resetAffiliatePasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("affiliates:manage");
    const a = await prisma.affiliate.findUnique({ where: { id: id.parse(fd.get("id")) }, select: { userId: true } });
    if (!a) throw new AffiliateError("not_found", "Không tìm thấy CTV");
    await resetStaffPassword(a.userId, String(fd.get("password") ?? ""), user.id);
  } catch (e) {
    return { error: await message(e) };
  }
  return { ok: "reset" };
}

export async function recordPayoutAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("affiliates:manage");
    const affiliateId = id.parse(fd.get("id"));
    const file = fd.get("proof");
    const proof = file instanceof File && file.size > 0 ? { data: Buffer.from(await file.arrayBuffer()), mime: file.type } : null;
    await recordPayout(affiliateId, { note: String(fd.get("note") ?? "") }, user.id, { proof });
    revalidatePath(`/admin/affiliates/${affiliateId}`);
  } catch (e) {
    return { error: await message(e) };
  }
  revalidatePath("/admin/affiliates");
  revalidatePath("/admin/affiliates/commissions");
  return { ok: "paid" };
}

/** `parentId` rỗng = bỏ cấp trên. Chỉ áp cho đơn mới. */
export async function setAffiliateParentAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("affiliates:manage");
    const affiliateId = id.parse(fd.get("id"));
    const parentId = String(fd.get("parentId") ?? "").trim();
    await setAffiliateParent(affiliateId, parentId || null, user.id);
    revalidatePath(`/admin/affiliates/${affiliateId}`);
  } catch (e) {
    return { error: await message(e) };
  }
  revalidatePath("/admin/affiliates");
  return { ok: "saved" };
}

export async function approveApplicationAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let affiliateId: string;
  try {
    const user = await requirePermission("affiliates:manage");
    const a = await approveApplication(
      id.parse(fd.get("id")),
      {
        code: String(fd.get("code") ?? ""),
        commissionPercent: String(fd.get("commissionPercent") ?? ""),
        payoutInfo: String(fd.get("payoutInfo") ?? ""),
      },
      user.id,
    );
    affiliateId = a.id;
  } catch (e) {
    return { error: await message(e) };
  }
  revalidatePath("/admin/affiliates", "layout");
  redirect(`/admin/affiliates/${affiliateId}?approved=1`);
}

export async function rejectApplicationAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("affiliates:manage");
    await rejectApplication(id.parse(fd.get("id")), fd.get("note"), user.id);
  } catch (e) {
    return { error: await message(e) };
  }
  revalidatePath("/admin/affiliates", "layout");
  return { ok: "rejected" };
}

/** Chỉnh % hoa hồng chốt trên đơn chưa chi trả (P13, chỉ admin). */
export async function setOrderCommissionRatesAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const orderId = String(fd.get("orderId"));
  try {
    const user = await requirePermission("affiliates:manage");
    await setOrderCommissionRates(
      orderId,
      { commissionPercent: String(fd.get("commissionPercent") ?? ""), uplinePercent: String(fd.get("uplinePercent") ?? "") },
      { userId: user.id, role: user.role },
    );
  } catch (e) {
    return { error: await message(e) };
  }
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/affiliates", "layout");
  return { ok: "rates" };
}

/** `affiliateId` rỗng = bỏ CTV khỏi đơn. */
export async function assignOrderAffiliateAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const orderId = String(fd.get("orderId"));
  try {
    const user = await requirePermission("orders:assign-affiliate");
    const raw = String(fd.get("affiliateId") ?? "").trim();
    await assignOrderAffiliate(orderId, raw || null, { userId: user.id, role: user.role });
  } catch (e) {
    return { error: await message(e) };
  }
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  return { ok: "assigned" };
}
