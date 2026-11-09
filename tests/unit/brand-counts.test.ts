import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ brands: vi.fn(), available: vi.fn(), blockDays: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { brand: { findMany: mocks.brands } } }));
vi.mock("@/server/orders/availability", () => ({ availableToSell: mocks.available }));
vi.mock("@/server/inventory/documents", () => ({ salesBlockDays: mocks.blockDays }));
import { listBrandsAdmin } from "@/server/catalog/brand-queries";

const product = (...ids: string[]) => ({ stockLocation: { active: true, sellable: true }, variants: ids.map((id) => ({ id })) });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.blockDays.mockResolvedValue(90);
  mocks.available.mockResolvedValue(new Map());
});

describe("Số sản phẩm của thương hiệu", () => {
  it("hết tồn vẫn được quản lý; nhiều biến thể còn hàng chỉ đếm một SP; tổng liên kết giữ để chặn xoá", async () => {
    mocks.brands.mockResolvedValue([{ id: "b", name: "Brand", _count: { products: 5 }, products: [product("v1", "v2"), product("v3"), product("v4")] }]);
    mocks.available.mockResolvedValue(new Map([["v1", 3], ["v2", 8], ["v3", 0], ["v4", -2]]));
    const now = new Date("2026-11-09T00:00:00Z");
    expect(await listBrandsAdmin(" Brand ", now)).toEqual([{ id: "b", name: "Brand", totalProducts: 5, managedProducts: 3, inStockProducts: 1 }]);
    expect(mocks.available).toHaveBeenCalledTimes(1);
    expect(mocks.available).toHaveBeenCalledWith(expect.anything(), ["v1", "v2", "v3", "v4"], { now, blockDays: 90 });
    const query = mocks.brands.mock.calls[0][0];
    expect(query.where).toEqual({ name: { contains: "Brand", mode: "insensitive" } });
    expect(query.select.products.where).toEqual({ archivedAt: null });
    expect(query.select.products.select.variants.where).toEqual({ active: true });
    expect(query.select._count.select.products).toBe(true);
  });

  it("không đếm tồn ở kho ngừng dùng/kho không bán; không có biến thể đang dùng thì còn hàng = 0", async () => {
    const closed = { ...product("closed"), stockLocation: { active: false, sellable: true } };
    const notSales = { ...product("not-sales"), stockLocation: { active: true, sellable: false } };
    mocks.brands.mockResolvedValue([{ id: "b", name: "Brand", _count: { products: 3 }, products: [closed, notSales, product()] }]);
    expect(await listBrandsAdmin()).toMatchObject([{ managedProducts: 3, inStockProducts: 0 }]);
    expect(mocks.available).not.toHaveBeenCalled();
  });

  it("chỉ có SP ngừng kinh doanh: hai số bằng 0, vẫn giữ tổng để không cho xoá thương hiệu", async () => {
    mocks.brands.mockResolvedValue([{ id: "b", name: "Brand", _count: { products: 2 }, products: [] }]);
    expect(await listBrandsAdmin()).toEqual([{ id: "b", name: "Brand", totalProducts: 2, managedProducts: 0, inStockProducts: 0 }]);
    expect(mocks.available).not.toHaveBeenCalled();
    expect(mocks.blockDays).not.toHaveBeenCalled();
  });

  it("thương hiệu không có sản phẩm và kết quả tìm kiếm trống", async () => {
    mocks.brands.mockResolvedValue([{ id: "empty", name: "Empty", _count: { products: 0 }, products: [] }]);
    expect(await listBrandsAdmin()).toMatchObject([{ totalProducts: 0, managedProducts: 0, inStockProducts: 0 }]);
    mocks.brands.mockResolvedValue([]);
    expect(await listBrandsAdmin("missing")).toEqual([]);
  });
});
