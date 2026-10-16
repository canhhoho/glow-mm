import { describe, expect, it } from "vitest";
import { buildCategoryTree, type CategoryRow } from "@/server/catalog/category-tree";

const row = (r: Partial<CategoryRow> & Pick<CategoryRow, "id">): CategoryRow => ({
  slug: r.id,
  parentId: null,
  sortOrder: 0,
  name: r.id,
  published: 0,
  ...r,
});

describe("Cây danh mục menu", () => {
  it("giữ nhánh có SP đã đăng, sắp theo sortOrder rồi tên", () => {
    const tree = buildCategoryTree([
      row({ id: "skin", sortOrder: 1 }),
      row({ id: "toner", parentId: "skin", published: 2, name: "Toner" }),
      row({ id: "serum", parentId: "skin", published: 1, name: "Serum" }),
      row({ id: "mask", parentId: "skin", published: 0 }),
      row({ id: "makeup", sortOrder: 0, published: 3 }),
      row({ id: "empty", sortOrder: 2 }),
      row({ id: "hair", sortOrder: 3 }),
      row({ id: "hair-oil", parentId: "hair", published: 0 }),
    ]);
    expect(tree).toEqual([
      { slug: "makeup", name: "makeup", children: [] },
      {
        slug: "skin",
        name: "skin",
        children: [
          { slug: "serum", name: "Serum" },
          { slug: "toner", name: "Toner" },
        ],
      },
    ]);
  });

  it("bỏ cấp thứ 3 và danh mục con mồ côi", () => {
    const tree = buildCategoryTree([
      row({ id: "a", published: 1 }),
      row({ id: "a1", parentId: "a", published: 1 }),
      row({ id: "a1x", parentId: "a1", published: 5 }),
      row({ id: "orphan", parentId: "missing", published: 4 }),
    ]);
    expect(tree).toEqual([{ slug: "a", name: "a", children: [{ slug: "a1", name: "a1" }] }]);
  });
});
