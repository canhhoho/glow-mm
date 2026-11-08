import { Trash2 } from "lucide-react";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { rootCategories } from "@/server/catalog/admin-queries";
import { removeCategoryIconAction, updateCategoryAction } from "@/server/catalog/actions";
import { getCategoryAdmin } from "@/server/catalog/categories";
import { ActionButton } from "@/components/admin/action-button";
import { ActionForm } from "@/components/admin/action-form";
import { CategoryIconUpload } from "@/components/admin/category-icon-upload";
import { ParentSelect } from "@/components/admin/parent-select";
import { fieldClass, fieldLabelClass, Page, PageHeader, Section } from "@/components/admin/ui";

/** Sửa một danh mục: slug, tên my/en, danh mục cha, thứ tự, icon nhóm hàng trên trang chủ. */
export default async function CategoryEditPage({ params }: PageProps<"/admin/categories/[id]">) {
  await requirePagePermission("catalog:manage");
  const { id } = await params;
  const [t, tn, c, roots] = await Promise.all([
    getTranslations("Categories"),
    getTranslations("Nav"),
    getCategoryAdmin(id),
    rootCategories(),
  ]);
  if (!c) notFound();

  return (
    <Page width="narrow">
      <PageHeader title={c.nameEn || c.slug} description={<span className="font-mono">{c.slug}</span>} back={{ href: "/admin/categories", label: tn("categories") }} />
      <Section>
        <ActionForm action={updateCategoryAction} submitLabel={t("save")} okText={t("saved")} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="categoryId" value={c.id} />
          <label className={`${fieldLabelClass} sm:col-span-2`}>
            <span>{t("slug")}</span>
            <input name="slug" required maxLength={60} pattern="[a-z0-9\-]+" defaultValue={c.slug} className={`${fieldClass} font-mono`} />
            <span className="text-xs text-muted-foreground">{t("slugHelp")}</span>
          </label>
          <label className={fieldLabelClass} lang="my">
            <span>{t("nameMy")}</span>
            <input name="nameMy" required defaultValue={c.nameMy} className={fieldClass} />
          </label>
          <label className={fieldLabelClass}>
            <span>{t("nameEn")}</span>
            <input name="nameEn" required defaultValue={c.nameEn} className={fieldClass} />
          </label>
          <label className={fieldLabelClass}>
            <span>{t("parent")}</span>
            <ParentSelect roots={roots} value={c.parentId} excludeId={c.id} noParentLabel={t("noParent")} />
          </label>
          <label className={fieldLabelClass}>
            <span>{t("sortOrder")}</span>
            <input name="sortOrder" type="number" min={0} max={9999} defaultValue={c.sortOrder} className={fieldClass} />
          </label>
        </ActionForm>
      </Section>
      <Section title={t("colIcon")}>
        <div className="flex flex-wrap items-start gap-4">
          <div className="relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-xs text-muted-foreground">
            {c.iconUrl ? <Image src={c.iconUrl} alt={`${t("colIcon")} ${c.nameEn}`} fill sizes="64px" className="object-cover" /> : t("noIcon")}
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <CategoryIconUpload categoryId={c.id} />
            {c.iconUrl && (
              <ActionButton
                action={removeCategoryIconAction}
                fields={{ categoryId: c.id }}
                label={t("iconRemove")}
                variant="destructive"
                confirm={t("iconRemoveConfirm")} iconOnly={false} icon={<Trash2 aria-hidden className="size-4 shrink-0" />}
              />
            )}
            <p className="text-xs text-muted-foreground">{t("iconHelp")}</p>
          </div>
        </div>
      </Section>
    </Page>
  );
}
