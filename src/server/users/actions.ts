"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { ZodError } from "zod";
import { formId } from "@/lib/schemas";
import { requirePermission } from "@/server/auth/session";
import { MIN_STAFF_PASSWORD } from "@/server/auth/roles";
import type { ActionState } from "@/server/inventory/actions";
import { createStaff, resetStaffPassword, setStaffActive, updateStaff, UserError } from "./users";

/** Server Action quản lý nhân viên (quyền `users:manage`). Lỗi trả về đã dịch theo ngôn ngữ admin. */

const id = formId(64);

async function message(e: unknown): Promise<string> {
  const t = await getTranslations("Users");
  if (e instanceof UserError) return t(`errors.${e.code}`);
  if (e instanceof ZodError) {
    const issue = e.issues[0];
    const field = issue?.path[0];
    if (field === "email") return t("errors.email");
    // Đặt lại mật khẩu parse thẳng chuỗi mật khẩu → path rỗng.
    if (field === "password" || (field === undefined && issue?.code === "too_small")) {
      return t("errors.tooShort", { min: MIN_STAFF_PASSWORD });
    }
    return t("errors.invalid");
  }
  return e instanceof Error ? e.message : String(e);
}

const fields = (fd: FormData) => ({
  name: String(fd.get("name") ?? ""),
  role: String(fd.get("role") ?? ""),
});

export async function createStaffAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("users:manage");
    await createStaff(
      { ...fields(fd), email: String(fd.get("email") ?? ""), password: String(fd.get("password") ?? "") },
      user.id,
    );
  } catch (e) {
    return { error: await message(e) };
  }
  revalidatePath("/admin/users");
  redirect("/admin/users?saved=1");
}

export async function updateStaffAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("users:manage");
    const staffId = id.parse(fd.get("id"));
    await updateStaff(staffId, fields(fd), user.id);
    revalidatePath(`/admin/users/${staffId}`);
  } catch (e) {
    return { error: await message(e) };
  }
  revalidatePath("/admin/users");
  return { ok: "saved" };
}

export async function setStaffActiveAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("users:manage");
    const staffId = id.parse(fd.get("id"));
    await setStaffActive(staffId, fd.get("active") === "true", user.id);
    revalidatePath(`/admin/users/${staffId}`);
  } catch (e) {
    return { error: await message(e) };
  }
  revalidatePath("/admin/users");
  return { ok: "saved" };
}

export async function resetStaffPasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("users:manage");
    await resetStaffPassword(id.parse(fd.get("id")), String(fd.get("password") ?? ""), user.id);
  } catch (e) {
    return { error: await message(e) };
  }
  return { ok: "reset" };
}
