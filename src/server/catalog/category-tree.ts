/** Dựng cây danh mục 2 cấp cho menu storefront (hàm thuần, test bằng Vitest). */

/** Tag cache của menu danh mục storefront — action admin đổi catalog gọi `updateTag(CATALOG_TAG)`. */
export const CATALOG_TAG = "catalog";

export type CategoryRow = {
  id: string;
  slug: string;
  parentId: string | null;
  sortOrder: number;
  name: string;
  /** Số sản phẩm đã đăng nằm trực tiếp trong danh mục. */
  published: number;
};

export type CategoryLeaf = { slug: string; name: string };
export type CategoryNode = CategoryLeaf & { children: CategoryLeaf[] };

const bySortThenName = (a: CategoryRow, b: CategoryRow) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);

/**
 * Chỉ giữ nhánh có sản phẩm đã đăng: danh mục con cần có SP; danh mục gốc cần có SP trực tiếp
 * hoặc ít nhất một danh mục con được giữ. Cấp sâu hơn 2 không hiện trên menu.
 */
export function buildCategoryTree(rows: CategoryRow[]): CategoryNode[] {
  const children = new Map<string, CategoryRow[]>();
  for (const r of rows) {
    if (r.parentId) children.set(r.parentId, [...(children.get(r.parentId) ?? []), r]);
  }
  return rows
    .filter((r) => !r.parentId)
    .sort(bySortThenName)
    .map((root) => ({
      slug: root.slug,
      name: root.name,
      published: root.published,
      children: (children.get(root.id) ?? [])
        .filter((c) => c.published > 0)
        .sort(bySortThenName)
        .map((c) => ({ slug: c.slug, name: c.name })),
    }))
    .filter((n) => n.published > 0 || n.children.length > 0)
    .map(({ slug, name, children: kids }) => ({ slug, name, children: kids }));
}
