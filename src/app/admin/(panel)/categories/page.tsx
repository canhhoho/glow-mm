import Image from "next/image";
import { Trash2 } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { rootCategories } from "@/server/catalog/admin-queries";
import { deleteCategoryAction } from "@/server/catalog/actions";
import { listCategoriesAdmin } from "@/server/catalog/categories";
import { ActionButton } from "@/components/admin/action-button";
import { CategoryForm } from "@/components/admin/catalog-forms";
import { DataTable, FilterBar, FilterButton, LinkButton, Page, PageHeader, SearchInput, Section, Td } from "@/components/admin/ui";

/**
 * Danh mục: cùng khuôn với các trang danh sách khác — lọc, khối "Thêm" phía trên, bảng + nút Sửa
 * (sửa tên/slug/cha/thứ tự/icon ở `/admin/categories/[id]`). Danh mục con nằm ngay dưới cha, thụt lề.
 */
export default async function CategoriesPage({ searchParams }: PageProps<"/admin/categories">) {
  await requirePagePermission("catalog:manage");
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  const [t, tp, tc, categories, roots] = await Promise.all([
    getTranslations("Categories"),
    getTranslations("Products"),
    getTranslations("Common"),
    listCategoriesAdmin(query),
    rootCategories(),
  ]);
  const nameOf = new Map(categories.map((c) => [c.id, c.nameEn || c.slug]));

  return (
    <Page>
      <PageHeader title={t("title")} description={t("intro")} />
      <FilterBar>
        <SearchInput label={t("search")} defaultValue={query} />
        <FilterButton>{tc("filter")}</FilterButton>
      </FilterBar>
      <div id="new-category" className="scroll-mt-20">
        <Section title={t("newCategory")}>
          <CategoryForm parents={roots} />
          <p className="text-xs text-muted-foreground">{tp("catSlug")}: a-z, 0-9, -</p>
        </Section>
      </div>
      <p className="text-sm text-muted-foreground">{t("countsHelp")}</p>
      <DataTable
        stack
        empty={t("empty")}
        head={[t("colIcon"), t("colName"), t("slug"), t("parent"), t("sortOrder"), t("colManagedProducts"), t("colInStockProducts"), tp("colActions")]}
        numeric={[4, 5, 6]}
      >
        {categories.map((c) => (
          <tr key={c.id} data-testid="category-row">
            <Td>
              <div className="relative grid size-10 place-items-center overflow-hidden rounded-full bg-muted text-2xs text-muted-foreground">
                {c.iconUrl ? (
                  <Image src={c.iconUrl} alt={`${t("colIcon")} ${c.nameEn}`} fill sizes="40px" className="object-cover" />
                ) : (
                  t("noIcon")
                )}
              </div>
            </Td>
            <Td label={t("colName")} className={c.parentId ? "md:pl-8" : undefined}>
              <div className="font-medium">
                {c.parentId && <span aria-hidden className="mr-1 text-muted-foreground">↳</span>}
                {c.nameEn}
              </div>
              <div className="text-xs text-muted-foreground" lang="my">
                {c.nameMy}
              </div>
            </Td>
            <Td label={t("slug")} className="font-mono text-xs">
              {c.slug}
            </Td>
            <Td label={t("parent")} className="text-xs">
              {c.parentId ? nameOf.get(c.parentId) ?? "—" : "—"}
            </Td>
            <Td label={t("sortOrder")} className="text-right tabular-nums">
              {c.sortOrder}
            </Td>
            <Td label={t("colManagedProducts")} className="text-right tabular-nums">
              {c.managedProducts}
            </Td>
            <Td label={t("colInStockProducts")} className="text-right tabular-nums">
              {c.inStockProducts}
            </Td>
            <Td>
              <div className="flex flex-wrap items-start gap-2">
                <LinkButton href={`/admin/categories/${c.id}`} icon="edit" iconOnly={true}>{tp("edit")}</LinkButton>
                {c.products === 0 && c.children === 0 && (
                  <ActionButton
                    action={deleteCategoryAction}
                    fields={{ categoryId: c.id }}
                    label={t("delete")}
                    variant="destructive"
                    icon={<Trash2 aria-hidden className="size-4 shrink-0" />}
                    confirm={t("deleteConfirm", { slug: c.slug })} iconOnly={true}
                  />
                )}
              </div>
            </Td>
          </tr>
        ))}
      </DataTable>
    </Page>
  );
}
