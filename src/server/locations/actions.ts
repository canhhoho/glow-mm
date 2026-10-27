"use server";

import { revalidatePath, updateTag } from "next/cache";
import { getTranslations } from "next-intl/server";
import { ZodError } from "zod";
import { requirePermission } from "@/server/auth/session";
import type { ActionState } from "@/server/inventory/actions";
import { updateLocations, type LocationRowInput } from "./admin";
import { LOCATIONS_TAG } from "./locations";

/**
 * Lưu bảng địa bàn (P15b). Mỗi dòng gửi `row=<level>:<id>` + `nameEn:<id>`, `nameMy:<id>`, `active:<id>` (checkbox —
 * không tick thì không gửi, nên dựa vào danh sách `row` để biết dòng nào có trong form).
 */
export async function saveLocationsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getTranslations("Locations");
  try {
    const user = await requirePermission("settings:manage");
    const rows: LocationRowInput[] = formData.getAll("row").map((v) => {
      const [level, id] = String(v).split(":", 2) as [LocationRowInput["level"], string];
      return {
        level,
        id,
        nameEn: String(formData.get(`nameEn:${id}`) ?? ""),
        nameMy: String(formData.get(`nameMy:${id}`) ?? ""),
        active: formData.get(`active:${id}`) === "on",
      };
    });
    const n = await updateLocations(rows, user.id);
    updateTag(LOCATIONS_TAG);
    revalidatePath("/admin/settings/locations");
    return { ok: t("saved", { n }) };
  } catch (e) {
    if (e instanceof ZodError) return { error: t("invalid") };
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
