"use client";

import { Upload } from "lucide-react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { FileField } from "@/components/admin/file-field";
import { Button } from "@/components/ui/button";
import { setCategoryIconAction } from "@/server/catalog/actions";
import type { ActionState } from "@/server/inventory/actions";
import { FormMessage } from "@/components/ui/form-message";

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
        <Button size="lg" type="submit" variant="outline" disabled={pending}><Upload aria-hidden className="size-4 shrink-0" /> {t("iconUploadBtn")}</Button>
      </div>
      {state?.error && (
        <FormMessage>
          {td("error")}: {state.error}
        </FormMessage>
      )}
      {state?.ok && !state.error && (
        <FormMessage tone="success">
          {t("iconUploaded")}
        </FormMessage>
      )}
    </form>
  );
}
