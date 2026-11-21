import { GitMerge, Pencil } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { listBrandsAdmin } from "@/server/catalog/brand-admin";
import { mergeBrandsAction, renameBrandAction } from "@/server/catalog/actions";
import { ActionForm } from "@/components/admin/action-form";
import { DataTable, fieldClass, fieldLabelClass, FilterBar, FilterButton, Page, PageHeader, SearchInput, Td } from "@/components/admin/ui";
import { fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Thương hiệu (21/11/2026, audit #14): xem số SP theo thương hiệu, đổi tên (sửa chính tả), gộp thương hiệu gõ trùng/sai.
 * Thương hiệu mới vẫn tạo khi gõ tên ở form SP / Excel; hết SP thì tự xoá. Domain: `server/catalog/brand-admin.ts`.
 */
export default async function BrandsPage({ searchParams }: PageProps<"/admin/brands">) {
  await requirePagePermission("catalog:manage");
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim().slice(0, 80) : "";
  const [t, tc, brands, all] = await Promise.all([
    getTranslations("Brands"),
    getTranslations("Common"),
    listBrandsAdmin(query),
    query ? listBrandsAdmin() : Promise.resolve(null),
  ]);
  const targets = all ?? brands;

  return (
    <Page>
      <PageHeader title={t("title")} description={t("intro")} />
      <FilterBar>
        <SearchInput label={t("search")} defaultValue={query} />
        <FilterButton>{tc("filter")}</FilterButton>
      </FilterBar>
      <DataTable
        stack
        empty={query ? t("emptyFiltered") : t("empty")}
        head={[t("colName"), t("colActive"), t("colPublished"), t("colActions")]}
        numeric={[1, 2]}
        cols={["", "w-28", "w-28", "md:w-[26rem]"]}
      >
        {brands.map((b) => (
          <tr key={b.id} data-testid="brand-row">
            <Td>
              <span className="block font-medium break-words" data-testid="brand-name">{b.name}</span>
              <span className="block font-mono text-xs break-all text-muted-foreground">{b.slug}</span>
              {b.products > b.activeProducts && <span className="block text-xs text-muted-foreground">{t("archivedCount", { count: b.products - b.activeProducts })}</span>}
            </Td>
            <Td label={t("colActive")} numeric>{fmtInt(b.activeProducts)}</Td>
            <Td label={t("colPublished")} numeric>{fmtInt(b.publishedProducts)}</Td>
            <Td>
              <details className="group/brand">
                <summary className="cursor-pointer list-none text-sm text-primary underline [&::-webkit-details-marker]:hidden">{t("manage")}</summary>
                <div className="mt-2 space-y-3">
                  <ActionForm action={renameBrandAction} submitLabel={t("rename")} okText={t("renamed")} icon={<Pencil aria-hidden />} variant="outline" className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="brandId" value={b.id} />
                    <label className={cn(fieldLabelClass, "min-w-0 flex-1")}>
                      <span>{t("newName")}</span>
                      <input name="name" required maxLength={80} defaultValue={b.name} className={fieldClass} />
                    </label>
                  </ActionForm>
                  {targets.length > 1 && (
                    <ActionForm
                      action={mergeBrandsAction}
                      submitLabel={t("merge")}
                      okText={t("merged")}
                      icon={<GitMerge aria-hidden />}
                      variant="destructive"
                      confirm={t("mergeConfirm", { name: b.name, count: b.products })}
                      className="flex flex-wrap items-end gap-2"
                    >
                      <input type="hidden" name="brandId" value={b.id} />
                      <label className={cn(fieldLabelClass, "min-w-0 flex-1")}>
                        <span>{t("mergeInto")}</span>
                        <select name="toId" required defaultValue="" className={fieldClass}>
                          <option value="">—</option>
                          {targets.filter((x) => x.id !== b.id).map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </ActionForm>
                  )}
                  <p className="text-xs text-muted-foreground">{t("mergeHelp")}</p>
                </div>
              </details>
            </Td>
          </tr>
        ))}
      </DataTable>
    </Page>
  );
}
