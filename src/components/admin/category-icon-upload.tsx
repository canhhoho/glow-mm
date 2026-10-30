"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { FileField } from "@/components/admin/file-field";
import { Button } from "@/components/ui/button";
import { setCategoryIconAction } from "@/server/catalog/actions";
import type { ActionState } from "@/server/inventory/actions";

const MAX_BYTES = 5 * 1024 * 1024;

/** Tải icon danh mục (1 ảnh). Kiểm tra kích thước trước khi gửi; server kiểm tra lại định dạng. */
export function CategoryIconUpload({ categoryId }: { categoryId: string }) {
  const t = useTranslations("Categories");
  const td = useTranslations("Docs");
  const [state, action, pending] = useActionState(async (_prev: ActionState, fd: FormData): Promise<ActionState> => {
    const file = fd.get("icon");
    if (file instanceof File && file.size > MAX_BYTES) return { error: t("iconTooBig") };
    return setCategoryIconAction(undefined, fd);
  }, undefined);

  return (
    <form action={action} className="space-y-1">
      <input type="hidden" name="categoryId" value={categoryId} />
      <div className="flex flex-wrap items-center gap-2">
        <FileField name="icon" required accept="image/jpeg,image/png,image/webp" aria-label={t("iconUpload")} className="max-w-64" />
        <Button type="submit" variant="outline" disabled={pending}>
          {t("iconUploadBtn")}
        </Button>
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {td("error")}: {state.error}
        </p>
      )}
      {state?.ok && !state.error && (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
          {t("iconUploaded")}
        </p>
      )}
    </form>
  );
}
