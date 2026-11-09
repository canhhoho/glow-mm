import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import labels from "../../messages/admin.vi.json";

const mocks = vi.hoisted(() => ({ list: vi.fn(), permission: vi.fn() }));
vi.mock("@/server/inventory/queries", () => ({ listDocuments: mocks.list }));
vi.mock("@/server/auth/session", () => ({ requirePagePermission: mocks.permission }));
vi.mock("@/components/admin/stock-parts", () => ({ NewDocMenu: () => null }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => {
  const value = (labels.Docs as Record<string, unknown>)[key];
  return typeof value === "string" ? value : key;
} }));
import DocumentsPage from "@/app/admin/(panel)/inventory/documents/page";

const documents = ["DRAFT", "POSTED", "CANCELLED"].map((status) => ({
  id: status, code: `DOC-${status}`, status, type: "RECEIVE", from: null, to: null,
  createdAt: new Date("2026-11-09T00:00:00Z"), _count: { lines: 1 },
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.permission.mockResolvedValue({ role: "ADMIN" });
  mocks.list.mockImplementation(async ({ status }: { status: string }) => documents.filter((d) => d.status === status));
});
const render = async (status?: string | string[]) => renderToStaticMarkup(await DocumentsPage({ searchParams: Promise.resolve({ status }), params: Promise.resolve({}) }));

describe("Hai nhóm phiếu kho", () => {
  it("mặc định chỉ hiện đã ghi sổ và có hai tab", async () => {
    const html = await render();
    expect(mocks.permission).toHaveBeenCalledWith("stock:view");
    expect(mocks.list).toHaveBeenCalledWith({ status: "POSTED" });
    expect(html).toContain("DOC-POSTED");
    expect(html).not.toContain("DOC-DRAFT");
    expect(html).not.toContain("DOC-CANCELLED");
    expect(html).toContain("?status=DRAFT");
    expect(html).toContain("?status=POSTED");
    expect(html).not.toContain("?status=CANCELLED");
  });
  it("tab Nháp chỉ hiện phiếu nháp", async () => {
    const html = await render("DRAFT");
    expect(mocks.list).toHaveBeenCalledWith({ status: "DRAFT" });
    expect(html).toContain("DOC-DRAFT");
    expect(html).not.toContain("DOC-POSTED");
    expect(html).not.toContain("DOC-CANCELLED");
  });
  it("URL trạng thái đã huỷ hoặc không hợp lệ quay về đã ghi sổ", async () => {
    for (const status of ["CANCELLED", "invalid", ["DRAFT", "POSTED"]]) {
      await render(status);
      expect(mocks.list).toHaveBeenLastCalledWith({ status: "POSTED" });
    }
  });
});
