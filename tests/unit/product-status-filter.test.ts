import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import ProductsPage from "@/app/admin/(panel)/products/page";
import { LIST_TABS, listProductsPage } from "@/server/catalog/product-list";
import messages from "../../messages/admin.vi.json";

vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: "Products" | "Common" | "ProductFields") => createTranslator({ locale: "vi", messages, namespace }),
}));
vi.mock("@/server/auth/session", () => ({ requirePagePermission: async () => ({ role: "ADMIN" }) }));
vi.mock("@/server/catalog/admin-queries", () => ({
  productFilterOptions: async () => ({ categories: [], brands: [], warehouses: [] }),
}));
vi.mock("@/server/catalog/product-list", async (original) => ({
  ...await original<typeof import("@/server/catalog/product-list")>(),
  listProductsPage: vi.fn(async () => ({ rows: [], total: 0, page: 1, pageSize: 20, pageCount: 1 })),
}));
vi.mock("@/server/catalog/stats", () => ({
  catalogStats: async () => ({
    totalProducts: 0, skus: 0, awaitingReview: 0, draftIncomplete: 0, rejected: 0,
    byLabel: { DRAFT: 0, PENDING: 0, REJECTED: 0, PUBLISHED: 0, HIDDEN: 0, ARCHIVED: 0 },
    published: { outOfStock: 0 },
  }),
}));
vi.mock("@/server/catalog/review", () => ({ changeSummaries: async () => new Map() }));
vi.mock("@/components/admin/product-bulk-publish", () => ({
  BulkCheckbox: () => null, BulkPublishBar: () => null, RowProductAction: () => null,
}));

describe("bộ lọc trạng thái sản phẩm", () => {
  it.each(LIST_TABS)("từ %s vẫn chọn được mọi trạng thái, kể cả khi số lượng bằng 0", async (status) => {
    const html = renderToStaticMarkup(await ProductsPage({
      params: Promise.resolve({}), searchParams: Promise.resolve({ status, q: "test" }),
    }));
    const select = html.match(/<select\b[^>]*name="status"[^>]*>([\s\S]*?)<\/select>/)?.[1];
    expect(select).toBeDefined();
    // 20/11/2026 (audit): "Hết hàng" lọc bằng ô Điều kiện bán — ô trạng thái chỉ còn mục này khi đang mở bằng link cũ.
    for (const value of LIST_TABS.filter((v) => v !== "outOfStock" || v === status)) expect(select).toContain(`value="${value}"`);
    if (status !== "outOfStock") expect(select).not.toContain(`value="outOfStock"`);
    expect(select).toContain(`value="${status}" selected=""`);
    expect(listProductsPage).toHaveBeenLastCalledWith(expect.objectContaining({ tab: status, q: "test" }));
    expect(html).not.toMatch(/<input[^>]*type="hidden"[^>]*name="status"/);
  });
});
