"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/server/auth/session";
import { can } from "@/server/auth/roles";
import { finishBatchReview } from "@/server/catalog/batch-review-text";
import { refreshPrices } from "@/server/catalog/refresh-prices";
import type { ActionState } from "@/server/inventory/actions";
import { applyManualVnd, applyRun, cancelRun, createRate, previewRun } from "./runs";

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
  refreshPrices(); // tab Tỷ giá, bảng tính / thủ công VND dùng tỷ giá mới nhất (giá bán không tự đổi)
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


type ApplyOutcome = { applied: number; skipped: { sku: string; reason: string }[]; remaining: number; review: Awaited<ReturnType<typeof applyRun>>["review"] };

/** Câu kết quả + (tuỳ chọn) gửi duyệt / duyệt luôn sau khi lượt đã commit. */
async function outcomeText(res: ApplyOutcome, runId: string, userId: string, approve: boolean) {
  const t = await getTranslations("Pricing");
  let ok = t("appliedResult", { applied: res.applied, skipped: res.skipped.length, remaining: res.remaining });
  if (res.skipped.length) ok += ` (${res.skipped.map((s) => `${s.sku}: ${t(`skipShort.${s.reason}` as Parameters<typeof t>[0])}`).join(", ")})`;
  if (res.review) {
    const view = await finishBatchReview(res.review, userId, approve);
    // Form áp giá biến mất khi hết dòng chờ → lưu kết quả để trang bản tính giá hiện lại (BatchReviewSummary).
    await prisma.auditLog.create({ data: { userId, action: "pricing.apply.review", entity: "PriceUpdateRun", entityId: runId, data: view } });
    const tb = await getTranslations("BatchReview");
    ok += ` · ${tb("submitted", { n: view.submitted + view.already })}`;
    if (view.approved) ok += ` · ${tb("approved", { n: view.approved })}`;
    if (view.notReady.length) ok += ` · ${tb("notReady", { n: view.notReady.length })} ${view.notReady.map((r) => `${r.name} — ${r.reason}`).join("; ")}`;
    if (view.approveFailed.length) ok += ` · ${tb("approveFailed", { n: view.approveFailed.length })} ${view.approveFailed.map((r) => `${r.name} — ${r.reason}`).join("; ")}`;
    if (view.needsReview?.length) ok += ` · ${tb("needsReview", { n: view.needsReview.length })} ${view.needsReview.map((r) => r.name).join("; ")}`;
  }
  return ok;
}

/** §6.4: gửi duyệt = thao tác của người quản lý SP; "Duyệt luôn" chỉ người có quyền duyệt (server kiểm lại). */
async function reviewOptions(formData: FormData, role: Parameters<typeof can>[0]) {
  const submit = formData.get("submitNow") === "on" && can(role, "catalog:manage");
  const approve = submit && formData.get("approveNow") === "on";
  if (approve) await requirePermission("catalog:approve");
  return { submit, approve };
}

export async function applyRunAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const runId = String(formData.get("runId"));
  let ok: string;
  try {
    const user = await requirePermission("pricing:manage");
    const ids = formData.getAll("variantId").map(String);
    const { submit, approve } = await reviewOptions(formData, user.role);
    const res = await applyRun(runId, ids, user.id, new Date(), { submit });
    refreshPrices({ runId });
    ok = await outcomeText(res, runId, user.id, approve);
  } catch (e) {
    return { error: message(e) };
  }
  refreshPrices({ runId });
  return { ok };
}

/** Trang Giá bán — Thủ công kho VND: `payload` = JSON { locationId, rateId, lines[] } (máy chủ tự tính lại giá). */
export async function applyManualVndAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let ok: string;
  try {
    const user = await requirePermission("pricing:manage");
    const { submit, approve } = await reviewOptions(formData, user.role);
    const res = await applyManualVnd(JSON.parse(String(formData.get("payload") ?? "{}")), user.id, new Date(), { submit });
    refreshPrices({ runId: res.runId });
    ok = await outcomeText(res, res.runId, user.id, approve);
  } catch (e) {
    return { error: message(e) };
  }
  refreshPrices();
  return { ok };
}

/** Bản tính tự động: tính lại với lô cơ sở đã chọn cho từng dòng (`source:<variantId>` = dòng phiếu nhập). */
export async function recomputeRunAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let id: string;
  try {
    const user = await requirePermission("pricing:manage");
    const run = await prisma.priceUpdateRun.findUnique({ where: { id: String(formData.get("runId")) }, include: { lines: { select: { variantId: true } } } });
    if (!run || run.mode !== "AUTO") throw new Error("Không tìm thấy bản tính giá");
    const sources: Record<string, string> = {};
    for (const [k, v] of formData.entries()) if (k.startsWith("source:") && typeof v === "string" && v) sources[k.slice(7)] = v;
    const next = await previewRun(
      {
        locationId: run.locationId ?? undefined,
        rateId: run.rateId ?? undefined,
        marginPct: run.marginPct?.toString(),
        shipMmkPerKg: run.shipMmkPerKg ?? undefined,
        roundTo: run.roundTo,
        variantIds: [...new Set(run.lines.map((l) => l.variantId))],
        sources,
      },
      user.id,
    );
    id = next.id;
  } catch (e) {
    return { error: message(e) };
  }
  redirect(`/admin/pricing/runs/${id}`);
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
