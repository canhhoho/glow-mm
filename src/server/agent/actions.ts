"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { ZodError } from "zod";
import { requirePermission } from "@/server/auth/session";
import type { ActionState } from "@/server/inventory/actions";
import { createAgentToken, revokeAgentToken } from "./tokens";

/** P25 gói A (A1) — trang Cài đặt › Trợ lý AI. Chỉ ADMIN (settings:manage). */
const message = (e: unknown) => (e instanceof ZodError ? e.issues.map((i) => i.message).join("; ") : e instanceof Error ? e.message : String(e));

export async function createAgentTokenAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let token: string;
  try {
    const user = await requirePermission("settings:manage");
    ({ token } = await createAgentToken({ name: formData.get("name"), userId: formData.get("userId"), scopes: formData.getAll("scopes") }, user.id));
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath("/admin/settings/agents");
  // Token gốc chỉ hiện đúng lần này (DB chỉ giữ hash).
  return { ok: (await getTranslations("Agents"))("createdToken", { token }) };
}

export async function revokeAgentTokenAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("settings:manage");
    await revokeAgentToken({ id: formData.get("id") }, user.id);
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath("/admin/settings/agents");
  return { ok: "revoked" };
}
