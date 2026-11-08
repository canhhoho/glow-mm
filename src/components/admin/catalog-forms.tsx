"use client";

import { useActionState } from "react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/admin/ui";
import { createBrandAction, createCategoryAction } from "@/server/catalog/actions";

function Feedback({ error, ok }: { error?: string; ok?: string }) {
  const t = useTranslations("Products");
  const td = useTranslations("Docs");
  if (error)
    return (
      <p role="alert" className="text-sm text-destructive">
        {td("error")}: {error}
      </p>
    );
  return ok ? <p className="text-sm text-emerald-700 dark:text-emerald-400">{t("added")}</p> : null;
}

export function BrandForm() {
  const t = useTranslations("Products");
  const [state, action, pending] = useActionState(createBrandAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <label className="grid content-start gap-1 text-sm">
        <span className="text-muted-foreground">{t("brandName")}</span>
        <input name="name" required maxLength={80} className={fieldClass} />
      </label>
      <Button size="lg" type="submit" variant="outline" disabled={pending} aria-label={t("newBrand")} title={t("newBrand")}><Plus aria-hidden className="size-4 shrink-0" /> {t("newBrand")}</Button>
      <div className="w-full">
        <Feedback error={state?.error} ok={state?.ok} />
      </div>
    </form>
  );
}

export function CategoryForm({ parents }: { parents: { id: string; name: string }[] }) {
  const t = useTranslations("Products");
  const [state, action, pending] = useActionState(createCategoryAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <label className="grid content-start gap-1 text-sm">
        <span className="text-muted-foreground">{t("catSlug")}</span>
        <input name="slug" required pattern="[a-z0-9\-]+" className={fieldClass} />
      </label>
      <label className="grid content-start gap-1 text-sm" lang="my">
        <span className="text-muted-foreground">{t("catNameMy")}</span>
        <input name="nameMy" required className={fieldClass} />
      </label>
      <label className="grid content-start gap-1 text-sm">
        <span className="text-muted-foreground">{t("catNameEn")}</span>
        <input name="nameEn" required className={fieldClass} />
      </label>
      <label className="grid content-start gap-1 text-sm">
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
