import { getTranslations } from "next-intl/server";
import { utcToYangonLocal } from "@/lib/time";
import { fieldClass, fieldLabelClass } from "@/components/admin/ui";

export type CollectionFieldsValue = {
  slug: string;
  nameMy: string;
  nameEn: string;
  active: boolean;
  showOnHome: boolean;
  startAt: Date | null;
  endAt: Date | null;
};

/** Ô nhập chung cho form tạo/sửa bộ sưu tập (đặt trong ActionForm). Ngày giờ theo giờ Yangon. */
export async function CollectionFields({ value }: { value?: CollectionFieldsValue }) {
  const t = await getTranslations("Content");
  const local = (d: Date | null | undefined) => (d ? utcToYangonLocal(d) : "");
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <label className={fieldLabelClass}>
        <span className="text-muted-foreground">{t("slug")}</span>
        <input name="slug" required pattern="[a-z0-9\-]+" maxLength={60} defaultValue={value?.slug} className={fieldClass} />
      </label>
      <label className={fieldLabelClass} lang="my">
        <span className="text-muted-foreground">{t("nameMy")}</span>
        <input name="nameMy" required maxLength={80} defaultValue={value?.nameMy} className={fieldClass} />
      </label>
      <label className={fieldLabelClass}>
        <span className="text-muted-foreground">{t("nameEn")}</span>
        <input name="nameEn" required maxLength={80} defaultValue={value?.nameEn} className={fieldClass} />
      </label>
      <label className={fieldLabelClass}>
        <span className="text-muted-foreground">{t("startAt")}</span>
        <input type="datetime-local" name="startAt" defaultValue={local(value?.startAt)} className={fieldClass} />
      </label>
      <label className={fieldLabelClass}>
        <span className="text-muted-foreground">{t("endAt")}</span>
        <input type="datetime-local" name="endAt" defaultValue={local(value?.endAt)} className={fieldClass} />
      </label>
      <div className="flex flex-col justify-end gap-1 pb-1 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="active" defaultChecked={value?.active ?? true} />
          {t("active")}
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="showOnHome" defaultChecked={value?.showOnHome ?? true} />
          {t("showOnHome")}
        </label>
      </div>
    </div>
  );
}
