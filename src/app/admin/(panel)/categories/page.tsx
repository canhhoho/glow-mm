import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { rootCategories } from "@/server/catalog/admin-queries";
import { removeCategoryIconAction, updateCategoryAction } from "@/server/catalog/actions";
import { listCategoriesAdmin } from "@/server/catalog/categories";
import { ActionButton } from "@/components/admin/action-button";
import { ActionForm } from "@/components/admin/action-form";
import { CategoryForm } from "@/components/admin/catalog-forms";
import { CategoryIconUpload } from "@/components/admin/category-icon-upload";
import { ParentSelect } from "@/components/admin/parent-select";
import { fieldClass, PageHeader } from "@/components/admin/ui";

/** Quản lý danh mục: tên my/en, danh mục cha (tối đa 2 cấp), thứ tự, icon nhóm hàng trên trang chủ. */
export default async function CategoriesPage() {
  await requirePagePermission("catalog:manage");
  const [t, tp, categories, roots] = await Promise.all([
    getTranslations("Categories"),
    getTranslations("Products"),
    listCategoriesAdmin(),
    rootCategories(),
  ]);

  return (
    <div className="max-w-5xl space-y-4">
      <PageHeader title={t("title")} />
      <p className="text-sm text-muted-foreground">{t("intro")}</p>
      {categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="space-y-3">
          {categories.map((c) => (
            <li
              key={c.id}
              data-testid="category-row"
              className={`flex flex-wrap gap-4 rounded-lg border p-3 ${c.parentId ? "ml-6 border-dashed" : ""}`}
            >
              <div className="w-40 shrink-0 space-y-2">
                <p className="font-mono text-sm">{c.slug}</p>
                <p className="text-xs text-muted-foreground">
                  {t("colProducts")}: {c.products}
                </p>
                <div className="relative grid size-16 place-items-center overflow-hidden rounded-full bg-muted text-xs text-muted-foreground">
                  {c.iconUrl ? (
                    <Image src={c.iconUrl} alt={`${t("colIcon")} ${c.nameEn}`} fill sizes="64px" className="object-cover" />
                  ) : (
                    t("noIcon")
                  )}
                </div>
              </div>

              <div className="min-w-64 flex-1 space-y-3">
                <ActionForm
                  action={updateCategoryAction}
                  submitLabel={t("save")}
                  okText={t("saved")}
                  variant="outline"
                  className="grid gap-2 sm:grid-cols-2"
                >
                  <input type="hidden" name="categoryId" value={c.id} />
                  <label className="space-y-1 text-sm" lang="my">
                    <span className="text-muted-foreground">{t("nameMy")}</span>
                    <input name="nameMy" required defaultValue={c.nameMy} className={fieldClass} />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-muted-foreground">{t("nameEn")}</span>
                    <input name="nameEn" required defaultValue={c.nameEn} className={fieldClass} />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-muted-foreground">{t("parent")}</span>
                    <ParentSelect roots={roots} value={c.parentId} excludeId={c.id} noParentLabel={t("noParent")} />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-muted-foreground">{t("sortOrder")}</span>
                    <input name="sortOrder" type="number" min={0} max={9999} defaultValue={c.sortOrder} className={fieldClass} />
                  </label>
                </ActionForm>

                <div className="flex flex-wrap items-start gap-3 border-t pt-3">
                  <CategoryIconUpload categoryId={c.id} />
                  {c.iconUrl && (
                    <ActionButton
                      action={removeCategoryIconAction}
                      fields={{ categoryId: c.id }}
                      label={t("iconRemove")}
                      variant="destructive"
                      confirm={t("iconRemoveConfirm")}
                    />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{t("iconHelp")}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <section className="rounded-lg border p-4">
        <h2 className="mb-3 font-medium">{t("newCategory")}</h2>
        <CategoryForm parents={roots} />
        <p className="mt-2 text-xs text-muted-foreground">{tp("catSlug")}: a-z, 0-9, -</p>
      </section>
    </div>
  );
}
