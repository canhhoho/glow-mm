"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requirePermission } from "@/server/auth/session";
import type { ActionState } from "@/server/inventory/actions";
import { NUMERIC_SETTING_KEYS, saveSettings } from "./settings";

export async function saveSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("settings:manage");
    const raw: Record<string, unknown> = Object.fromEntries(NUMERIC_SETTING_KEYS.map((k) => [k, formData.get(k)]));
    raw["payment.bankInstructions"] = formData.get("payment.bankInstructions") ?? "";
    await saveSettings(raw, user.id);
  } catch (e) {
    if (e instanceof ZodError) return { error: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
    return { error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath("/admin/settings");
  return { ok: "saved" };
}
