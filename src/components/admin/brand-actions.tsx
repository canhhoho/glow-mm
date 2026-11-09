"use client";

import { useActionState, useState } from "react";
import { Pencil, Save, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/admin/ui";
import { manageBrandAction } from "@/server/catalog/actions";
import { askConfirm } from "@/lib/confirm";

export function BrandActions({ id, name, products }: { id: string; name: string; products: number }) {
  const t = useTranslations("Products");
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(async (prev: Awaited<ReturnType<typeof manageBrandAction>>, data: FormData) => {
    const result = await manageBrandAction(prev, data);
    if (result?.ok) setEditing(false);
    return result;
  }, undefined);

  return <div className="space-y-2">
    <form action={action} onSubmit={e => {
      const submitter = (e.nativeEvent as SubmitEvent).submitter;
      if (submitter instanceof HTMLButtonElement && submitter.value === "delete" && !askConfirm(t("brandDeleteConfirm", { name }))) e.preventDefault();
    }} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="brandId" value={id} />
      {editing ? <>
        <input name="name" aria-label={t("brandName")} defaultValue={name} required maxLength={80} className={fieldClass} autoFocus />
        <Button type="submit" name="intent" value="update" size="lg" variant="outline" disabled={pending} aria-label={t("save")} title={t("save")}><Save aria-hidden className="size-4 shrink-0" /> {t("save")}</Button>
        <Button type="button" size="icon-lg" variant="outline" disabled={pending} aria-label={t("brandCancel")} title={t("brandCancel")} onClick={() => setEditing(false)}><X aria-hidden /></Button>
      </> : <>
        <Button type="button" size="icon-lg" variant="outline" disabled={pending} aria-label={`${t("edit")} ${name}`} title={t("edit")} onClick={() => setEditing(true)}><Pencil aria-hidden /></Button>
        <span title={products ? t("brandInUse") : t("delete")}>
          <Button type="submit" name="intent" value="delete" size="icon-lg" variant="destructive" disabled={pending || products > 0} aria-label={`${t("delete")} ${name}`} aria-describedby={products ? `brand-in-use-${id}` : undefined}><Trash2 aria-hidden /></Button>
        </span>
        {products > 0 && <span id={`brand-in-use-${id}`} className="sr-only">{t("brandInUse")}</span>}
      </>}
    </form>
    {state?.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
    {state?.ok && <p role="status" className="text-sm text-muted-foreground">{t("saved")}</p>}
  </div>;
}
