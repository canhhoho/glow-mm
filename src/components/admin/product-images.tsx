"use client";

import { Upload } from "lucide-react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { FileField } from "@/components/admin/file-field";
import { Button } from "@/components/ui/button";
import { addProductImagesAction } from "@/server/catalog/actions";
import type { ActionState } from "@/server/inventory/actions";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Tải nhiều ảnh: gửi lần lượt từng file (mỗi Server Action ≤ giới hạn body 6MB),
 * dừng ở file lỗi đầu tiên. Server vẫn kiểm tra lại định dạng/kích thước.
 */
export function ProductImageUpload({ productId }: { productId: string }) {
  const t = useTranslations("Products");
  const td = useTranslations("Docs");
  const [state, action, pending] = useActionState(async (_prev: ActionState, fd: FormData): Promise<ActionState> => {
    const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0) return { error: t("imagesNone") };
    const tooBig = files.find((f) => f.size > MAX_BYTES);
    if (tooBig) return { error: `${tooBig.name}: ${t("imagesInvalid")}` };
    for (const f of files) {
      const one = new FormData();
      one.set("productId", productId);
      one.set("files", f);
      const r = await addProductImagesAction(undefined, one);
      if (r?.error) return { error: `${f.name}: ${r.error}` };
    }
    return { ok: "uploaded" };
  }, undefined);

  return (
    <form action={action} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <FileField name="files" multiple required accept="image/jpeg,image/png,image/webp" aria-label={t("imagesUpload")} className="max-w-72" />
        <Button size="lg" type="submit" disabled={pending}><Upload aria-hidden className="size-4 shrink-0" /> {pending ? t("imagesUploading") : t("upload")}</Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("imagesHelp")}</p>
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {td("error")}: {state.error}
        </p>
      )}
      {state?.ok && !state.error && (
        <p role="status" className="text-sm text-emerald-700">
          {t("imagesUploaded")}
        </p>
      )}
    </form>
  );
}
