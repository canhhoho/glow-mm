"use client";

import { Save } from "lucide-react";
import { useActionState, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { FileField } from "@/components/admin/file-field";
import { Button } from "@/components/ui/button";
import { fieldClass, fieldLabelClass } from "@/components/admin/ui";
import { saveBannerAction } from "@/server/content/actions";
import { cn } from "@/lib/utils";

const MAX_EACH = 5 * 1024 * 1024;
// Giới hạn body Server Action 6MB (next.config) — chừa chỗ cho phần còn lại của form.
const MAX_TOTAL = 5.5 * 1024 * 1024;

export type BannerFormValue = {
  id: string;
  alt: string;
  locale: string | null;
  href: string | null;
  active: boolean;
  startAt: string; // giá trị ô datetime-local (giờ Yangon), "" = không giới hạn
  endAt: string;
  desktopUrl: string;
  mobileUrl: string | null;
};

/** Form tạo/sửa banner (ảnh desktop + mobile, ngôn ngữ, link, lịch). */
export function BannerForm({ banner }: { banner?: BannerFormValue }) {
  const t = useTranslations("Content");
  const td = useTranslations("Docs");
  const [state, action, pending] = useActionState(saveBannerAction, undefined);
  const [sizeError, setSizeError] = useState<string | null>(null);

  function checkSizes(e: React.FormEvent<HTMLFormElement>) {
    const fd = new FormData(e.currentTarget);
    const files = ["desktop", "mobile"].map((n) => fd.get(n)).filter((f): f is File => f instanceof File && f.size > 0);
    const total = files.reduce((s, f) => s + f.size, 0);
    if (files.some((f) => f.size > MAX_EACH) || total > MAX_TOTAL) {
      e.preventDefault();
      setSizeError(t("imagesTooBig"));
    } else setSizeError(null);
  }

  const error = sizeError ?? state?.error;
  return (
    <form action={action} onSubmit={checkSizes} className=" space-y-4">
      {banner && <input type="hidden" name="id" value={banner.id} />}

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className={fieldLabelClass}>
            <span className="text-muted-foreground">{t("desktopImage")}</span>
            <FileField name="desktop" required={!banner} accept="image/jpeg,image/png,image/webp" />
          </label>
          {banner && (
            <>
              <div className="relative aspect-[3/1] overflow-hidden rounded-md bg-muted">
                <Image src={banner.desktopUrl} alt={banner.alt} fill sizes="384px" className="object-cover" />
              </div>
              <p className="text-xs text-muted-foreground">{t("keepImageHelp")}</p>
            </>
          )}
        </div>
        <div className="space-y-2">
          <label className={fieldLabelClass}>
            <span className="text-muted-foreground">{t("mobileImage")}</span>
            <FileField name="mobile" accept="image/jpeg,image/png,image/webp" />
          </label>
          {banner?.mobileUrl && (
            <>
              <div className="relative aspect-[3/2] w-2/3 overflow-hidden rounded-md bg-muted">
                <Image src={banner.mobileUrl} alt={banner.alt} fill sizes="256px" className="object-cover" />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="removeMobile" />
                {t("removeMobile")}
              </label>
            </>
          )}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className={cn(fieldLabelClass, "sm:col-span-2")}>
          <span className="text-muted-foreground">{t("alt")}</span>
          <input name="alt" required maxLength={200} defaultValue={banner?.alt} className={fieldClass} />
        </label>
        <label className={cn(fieldLabelClass, "sm:col-span-2")}>
          <span className="text-muted-foreground">{t("href")}</span>
          <input name="href" maxLength={500} defaultValue={banner?.href ?? ""} placeholder="/c/skincare" className={fieldClass} />
        </label>
        <label className={fieldLabelClass}>
          <span className="text-muted-foreground">{t("locale")}</span>
          <select name="locale" defaultValue={banner?.locale ?? ""} className={fieldClass}>
            <option value="">{t("localeAll")}</option>
            <option value="my">{t("localeMy")}</option>
            <option value="en">{t("localeEn")}</option>
            <option value="vi">{t("localeVi")}</option>
          </select>
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={banner?.active ?? true} />
          {t("active")}
        </label>
        <label className={fieldLabelClass}>
          <span className="text-muted-foreground">{t("startAt")}</span>
          <input type="datetime-local" name="startAt" defaultValue={banner?.startAt} className={fieldClass} />
        </label>
        <label className={fieldLabelClass}>
          <span className="text-muted-foreground">{t("endAt")}</span>
          <input type="datetime-local" name="endAt" defaultValue={banner?.endAt} className={fieldClass} />
        </label>
      </div>

      <Button size="lg" type="submit" disabled={pending}><Save aria-hidden className="size-4 shrink-0" /> {t("save")}</Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {td("error")}: {error}
        </p>
      )}
    </form>
  );
}
