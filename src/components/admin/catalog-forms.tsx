"use client";

import { useActionState } from "react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { fieldClass, fieldLabelClass } from "@/components/admin/ui";
import { createCategoryAction } from "@/server/catalog/actions";
import { FormMessage } from "@/components/ui/form-message";

function Feedback({ error, ok }: { error?: string; ok?: string }) {
  const t = useTranslations("Products");
  const td = useTranslations("Docs");
  if (error)
    return (
      <FormMessage>
        {td("error")}: {error}
      </FormMessage>
    );
  return ok ? <p className="text-sm text-success">{t("added")}</p> : null;
}

export function CategoryForm({ parents }: { parents: { id: string; name: string }[] }) {
  const t = useTranslations("Products");
  const [state, action, pending] = useActionState(createCategoryAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <label className={fieldLabelClass}>
        <span className="text-muted-foreground">{t("catSlug")}</span>
        <input name="slug" required pattern="[a-z0-9\-]+" className={fieldClass} />
      </label>
      <label className={fieldLabelClass} lang="my">
        <span className="text-muted-foreground">{t("catNameMy")}</span>
        <input name="nameMy" required className={fieldClass} />
      </label>
      <label className={fieldLabelClass}>
        <span className="text-muted-foreground">{t("catNameEn")}</span>
        <input name="nameEn" required className={fieldClass} />
      </label>
      <label className={fieldLabelClass}>
        <span className="text-muted-foreground">{t("catParent")}</span>
        <select name="parentId" defaultValue="" className={fieldClass}>
          <option value="">{t("catNoParent")}</option>
          {parents.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <Button size="lg" type="submit" variant="outline" disabled={pending} aria-label={t("newCategory")} title={t("newCategory")}><Plus aria-hidden className="size-4 shrink-0" /> {t("newCategory")}</Button>
      <div className="w-full">
        <Feedback error={state?.error} ok={state?.ok} />
      </div>
    </form>
  );
}
