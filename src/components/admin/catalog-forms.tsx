"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/admin/ui";
import {
  createBrandAction,
  createCategoryAction,
  importProductsAction,
  importStockAction,
  type ImportState,
} from "@/server/catalog/actions";
import Link from "next/link";

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
      <label className="space-y-1 text-sm">
        <span className="text-muted-foreground">{t("brandName")}</span>
        <input name="name" required className={fieldClass} />
      </label>
      <Button type="submit" variant="outline" disabled={pending}>
        {t("add")}
      </Button>
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
      <label className="space-y-1 text-sm">
        <span className="text-muted-foreground">{t("catSlug")}</span>
        <input name="slug" required pattern="[a-z0-9-]+" className={fieldClass} />
      </label>
      <label className="space-y-1 text-sm" lang="my">
        <span className="text-muted-foreground">{t("catNameMy")}</span>
        <input name="nameMy" required className={fieldClass} />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-muted-foreground">{t("catNameEn")}</span>
        <input name="nameEn" required className={fieldClass} />
      </label>
      <label className="space-y-1 text-sm">
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
      <Button type="submit" variant="outline" disabled={pending}>
        {t("add")}
      </Button>
      <div className="w-full">
        <Feedback error={state?.error} ok={state?.ok} />
      </div>
    </form>
  );
}

function ImportResultView({ state }: { state: ImportState }) {
  const t = useTranslations("Products");
  const td = useTranslations("Docs");
  if (!state) return null;
  return (
    <div className="space-y-2 text-sm">
      {state.error && (
        <p role="alert" className="text-destructive">
          {td("error")}: {state.error}
        </p>
      )}
      {!state.error && <p>{t("importOk", { count: state.ok })}</p>}
      {state.errors.length > 0 && (
        <div role="alert" className="rounded-md bg-destructive/10 p-2 text-destructive">
          <p className="font-medium">{t("importErrors")}</p>
          <ul className="list-disc pl-5">
            {state.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {state.documents && state.documents.length > 0 && (
        <div>
          <p className="font-medium">{t("draftsCreated")}</p>
          <ul className="list-disc pl-5">
            {state.documents.map((d) => (
              <li key={d.id}>
                <Link href={`/admin/inventory/documents/${d.id}`} className="text-primary underline">
                  {d.code}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function ImportForm({ kind }: { kind: "products" | "stock" }) {
  const t = useTranslations("Products");
  const [state, action, pending] = useActionState(kind === "products" ? importProductsAction : importStockAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input type="file" name="file" accept=".csv,text/csv" required aria-label={kind === "products" ? t("importProducts") : t("importStock")} className="text-sm" />
        <Button type="submit" disabled={pending}>
          {t("upload")}
        </Button>
        <a href={`/api/templates/${kind}.csv`} className="text-sm text-primary underline">
          {t("template")}
        </a>
      </div>
      <ImportResultView state={state} />
    </form>
  );
}
