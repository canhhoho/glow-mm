import { getTranslations } from "next-intl/server";
import { storeFilters } from "@/server/catalog/cached";
import type { StoreSort } from "@/server/catalog/store-queries";
import { outlineButton, storeField } from "./ui";
import { Pagination } from "@/components/ui/pagination";

export type CatalogParams = { q?: string; brand?: string; tags: string[]; sort: StoreSort; page: number };

const SORTS: StoreSort[] = ["new", "price_asc", "price_desc"];

/** Đọc bộ lọc từ searchParams (GET form, không cần JS). */
export function parseCatalogParams(sp: Record<string, string | string[] | undefined>): CatalogParams {
  const one = (v: string | string[] | undefined) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const tags = ([] as string[]).concat(sp.tag ?? []).filter(Boolean).slice(0, 10);
  const sort = SORTS.includes(sp.sort as StoreSort) ? (sp.sort as StoreSort) : "new";
  const page = Number(sp.page);
  return { q: one(sp.q), brand: one(sp.brand), tags, sort, page: Number.isSafeInteger(page) && page > 0 ? Math.min(page, 1000000) : 1 };
}

export async function CatalogPagination({ current, page, pages, total, locale }: { current: CatalogParams; page: number; pages: number; total: number; locale: string }) {
  if (total === 0) return null;
  const t = await getTranslations({ locale, namespace: "Catalog" });
  const href = (next: number) => {
    const sp = new URLSearchParams({ sort: current.sort, page: String(next) });
    if (current.q) sp.set("q", current.q);
    if (current.brand) sp.set("brand", current.brand);
    for (const tag of current.tags) sp.append("tag", tag);
    return `?${sp}`;
  };
  return (
    <Pagination
      label={t("pagination")}
      page={page}
      pages={pages}
      hrefFor={href}
      prevLabel={t("previous")}
      nextLabel={t("next")}
      status={t("pageCount", { page, pages, total })}
      density="touch"
      className="mt-4"
    />
  );
}

/**
 * Bộ lọc trong <details> (không cần JS): mobile thu gọn; lg luôn mở, các ô xếp ngang
 * (::details-content — trình duyệt cũ chưa hỗ trợ thì vẫn bấm mở như mobile).
 */
export async function CatalogFilters({ locale, current }: { locale: string; current: CatalogParams }) {
  const [t, options] = await Promise.all([getTranslations({ locale, namespace: "Catalog" }), storeFilters(locale)]);
  const groups = [
    { kind: "SKIN_TYPE", label: t("skinType") },
    { kind: "CONCERN", label: t("concern") },
  ];
  const active = !!current.brand || current.tags.length > 0 || current.sort !== "new";

  return (
    <details
      open={active}
      className="mb-4 rounded-xl border border-border bg-card lg:[&::details-content]:[content-visibility:visible] lg:[&>summary]:hidden"
    >
      <summary className="flex min-h-11 cursor-pointer items-center px-3 font-medium">{t("filter")}</summary>
      <form className="space-y-3 px-3 pb-3 lg:flex lg:flex-wrap lg:items-end lg:gap-x-4 lg:gap-y-3 lg:space-y-0 lg:p-4">
        {current.q && <input type="hidden" name="q" value={current.q} />}
        <label className="block space-y-1 text-sm lg:w-52">
          <span>{t("sort")}</span>
          <select name="sort" defaultValue={current.sort} className={storeField}>
            <option value="new">{t("sortNew")}</option>
            <option value="price_asc">{t("sortPriceAsc")}</option>
            <option value="price_desc">{t("sortPriceDesc")}</option>
          </select>
        </label>
        <label className="block space-y-1 text-sm lg:w-52">
          <span>{t("brand")}</span>
          <select name="brand" defaultValue={current.brand ?? ""} className={storeField}>
            <option value="">{t("allBrands")}</option>
            {options.brands.map((b) => (
              <option key={b.slug} value={b.slug}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        {groups.map((g) => {
          const tags = options.tags.filter((x) => x.kind === g.kind);
          if (tags.length === 0) return null;
          return (
            <fieldset key={g.kind} className="space-y-1">
              <legend className="text-sm">{g.label}</legend>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <label
                    key={tag.slug}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-3 text-sm has-checked:border-brand has-checked:bg-accent"
                  >
                    <input type="checkbox" name="tag" value={tag.slug} defaultChecked={current.tags.includes(tag.slug)} />
                    {tag.name}
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })}
        <button type="submit" className={outlineButton}>
          {t("apply")}
        </button>
      </form>
    </details>
  );
}
