import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ categories: vi.fn(), available: vi.fn(), blockDays: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { category: { findMany: mocks.categories } } }));
vi.mock("@/server/orders/availability", () => ({ availableToSell: mocks.available }));
vi.mock("@/server/inventory/documents", () => ({ salesBlockDays: mocks.blockDays }));
vi.mock("@/server/files/public-images", () => ({}));
vi.mock("@/server/catalog/products", () => ({ CatalogError: class extends Error {} }));
import { listCategoriesAdmin } from "@/server/catalog/categories";

const product = (...ids: string[]) => ({ stockLocation: { active: true, sellable: true }, variants: ids.map((id) => ({ id })) });
const category = (id: string, parentId: string | null, products: ReturnType<typeof product>[] = [], total = products.length, children = 0) => ({
  id, parentId, slug: id, sortOrder: 0, icon: null,
  translations: [{ locale: "en", name: id }, { locale: "my", name: id }],
  products, _count: { products: total, children },
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.blockDays.mockResolvedValue(90);
  mocks.available.mockResolvedValue(new Map());
});

describe("Số sản phẩm danh mục", () => {
  it("cộng SP trực tiếp và con vào cha; nhiều biến thể còn hàng chỉ tính một SP", async () => {
    mocks.categories.mockResolvedValue([
      category("parent", null, [product("v1", "v2")], 3, 2),
      category("child", "parent", [product("v3"), product("v4")], 3),
      category("empty-child", "parent"),
    ]);
    mocks.available.mockResolvedValue(new Map([["v1", 2], ["v2", 5], ["v3", 1], ["v4", 0]]));
    const now = new Date("2026-11-09T00:00:00Z");
    expect(await listCategoriesAdmin(undefined, now)).toMatchObject([
      { id: "parent", managedProducts: 3, inStockProducts: 2, products: 3, children: 2 },
      { id: "child", managedProducts: 2, inStockProducts: 1, products: 3 },
      { id: "empty-child", managedProducts: 0, inStockProducts: 0 },
    ]);
    expect(mocks.available).toHaveBeenCalledTimes(1);
    expect(mocks.available).toHaveBeenCalledWith(expect.anything(), ["v1", "v2", "v3", "v4"], { now, blockDays: 90 });
    const include = mocks.categories.mock.calls[0][0].include;
    expect(include.products.where).toEqual({ archivedAt: null });
    expect(include.products.select.variants.where).toEqual({ active: true });
    expect(include._count.select).toEqual({ products: true, children: true });
  });

  it("tìm một con vẫn giữ cha và cộng cả anh em không khớp từ khoá", async () => {
    mocks.categories.mockResolvedValue([
      category("parent", null, [], 0, 2), category("match", "parent", [product("a")]), category("sibling", "parent", [product("b")]),
    ]);
    mocks.available.mockResolvedValue(new Map([["a", 1], ["b", 2]]));
    expect(await listCategoriesAdmin("match")).toMatchObject([
      { id: "parent", managedProducts: 2, inStockProducts: 2, products: 0, children: 2 },
      { id: "match", managedProducts: 1, inStockProducts: 1 },
    ]);
  });

  it("hết hàng, kho ngừng dùng hoặc không có biến thể: vẫn quản lý nhưng không tính còn hàng", async () => {
    mocks.categories.mockResolvedValue([category("p", null, [
      product("empty"), { ...product("closed"), stockLocation: { active: false, sellable: true } },
      { ...product("not-sales"), stockLocation: { active: true, sellable: false } }, product(),
    ])]);
    expect(await listCategoriesAdmin()).toMatchObject([{ managedProducts: 4, inStockProducts: 0 }]);
    expect(mocks.available.mock.calls[0][1]).toEqual(["empty"]);
  });

  it("chỉ có SP ngừng kinh doanh: hiển thị 0 nhưng vẫn giữ liên kết chặn xoá; danh sách trống không tính tồn", async () => {
    mocks.categories.mockResolvedValue([category("archived-only", null, [], 2)]);
    expect(await listCategoriesAdmin()).toMatchObject([{ managedProducts: 0, inStockProducts: 0, products: 2 }]);
    expect(mocks.available).not.toHaveBeenCalled();
    mocks.categories.mockResolvedValue([]);
    expect(await listCategoriesAdmin()).toEqual([]);
  });
});
