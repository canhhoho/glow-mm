"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { getTranslations } from "next-intl/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/server/auth/session";
import { can } from "@/server/auth/roles";
import { finishBatchReview } from "@/server/catalog/batch-review-text";
import { CATALOG_TAG } from "@/server/catalog/category-tree";
import type { ActionState } from "@/server/inventory/actions";
import { applyRun, cancelRun, createRate, previewRun } from "./runs";

function message(e: unknown): string {
  if (e instanceof ZodError) return e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  if (e instanceof Error) return e.message;
  return String(e);
}

const opt = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
};

export async function createRateAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("pricing:manage");
    await createRate(
      { mmkPerUsd: formData.get("mmkPerUsd"), vndPerUsd: formData.get("vndPerUsd"), note: opt(formData, "note") },
      user.id,
    );
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath("/admin/pricing");
  return { ok: "rate" };
}

export async function previewRunAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let id: string;
  try {
    const user = await requirePermission("pricing:manage");
    id = (
      await previewRun(
        {
          locationId: opt(formData, "locationId"),
          rateId: opt(formData, "rateId"),
          marginPct: opt(formData, "marginPct"),
          shipMmkPerKg: opt(formData, "shipMmkPerKg"),
          roundTo: opt(formData, "roundTo"),
          categoryId: opt(formData, "categoryId"),
          brandId: opt(formData, "brandId"),
          receiptId: opt(formData, "receiptId"),
          ...(formData.has("variantIds") && { variantIds: formData.getAll("variantIds") }),
        },
        user.id,
      )
    ).id;
  } catch (e) {
    return { error: message(e) };
  }
  redirect(`/admin/pricing/runs/${id}`);
}

export async function applyRunAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const runId = String(formData.get("runId"));
  let ok: string;
  try {
    const user = await requirePermission("pricing:manage");
    const ids = formData.getAll("variantId").map(String);
    // §6.4: gửi duyệt = thao tác của người quản lý SP; "Duyệt luôn" chỉ người có quyền duyệt (server kiểm lại).
    const submit = formData.get("submitNow") === "on" && can(user.role, "catalog:manage");
    const approve = submit && formData.get("approveNow") === "on";
    if (approve) await requirePermission("catalog:approve");
    const res = await applyRun(runId, ids, user.id, new Date(), { submit });
    const t = await getTranslations("Pricing");
    ok = t("appliedResult", { applied: res.applied, skipped: res.skipped.length, remaining: res.remaining });
    if (res.skipped.length) ok += ` (${res.skipped.map((s) => `${s.sku}: ${t(`skipShort.${s.reason}`)}`).join(", ")})`;
    if (res.review) {
      const view = await finishBatchReview(res.review, user.id, approve);
      // Form áp giá biến mất khi hết dòng chờ → lưu kết quả để trang bản tính giá hiện lại (BatchReviewSummary).
      await prisma.auditLog.create({ data: { userId: user.id, action: "pricing.apply.review", entity: "PriceUpdateRun", entityId: runId, data: view } });
      const tb = await getTranslations("BatchReview");
      ok += ` · ${tb("submitted", { n: view.submitted + view.already })}`;
      if (view.approved) ok += ` · ${tb("approved", { n: view.approved })}`;
      if (view.notReady.length) ok += ` · ${tb("notReady", { n: view.notReady.length })} ${view.notReady.map((r) => `${r.name} — ${r.reason}`).join("; ")}`;
      if (view.approveFailed.length) ok += ` · ${tb("approveFailed", { n: view.approveFailed.length })} ${view.approveFailed.map((r) => `${r.name} — ${r.reason}`).join("; ")}`;
    }
  } catch (e) {
    return { error: message(e) };
  }
  updateTag(CATALOG_TAG); // giá mới hiện ngay trên storefront (P20)
  revalidatePath(`/admin/pricing/runs/${runId}`);
  revalidatePath("/admin/pricing");
  return { ok };
}

export async function cancelRunAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const runId = String(formData.get("runId"));
  try {
    const user = await requirePermission("pricing:manage");
    await cancelRun(runId, user.id);
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath(`/admin/pricing/runs/${runId}`);
  return { ok: "cancelled" };
}
