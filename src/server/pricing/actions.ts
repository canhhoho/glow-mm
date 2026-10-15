"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { ZodError } from "zod";
import { requirePermission } from "@/server/auth/session";
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
    await createRate({ mmkPerVnd: formData.get("mmkPerVnd"), note: opt(formData, "note") }, user.id);
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
          rateId: formData.get("rateId"),
          marginPct: formData.get("marginPct"),
          roundTo: opt(formData, "roundTo"),
          categoryId: opt(formData, "categoryId"),
          brandId: opt(formData, "brandId"),
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
    const res = await applyRun(runId, ids, user.id);
    const t = await getTranslations("Pricing");
    ok = t("appliedResult", { applied: res.applied, skipped: res.skipped.length });
    if (res.skipped.length) ok += ` (${res.skipped.join(", ")})`;
  } catch (e) {
    return { error: message(e) };
  }
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
