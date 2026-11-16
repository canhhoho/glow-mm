import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogImport } from "@/components/admin/catalog-import";
import type { CatalogImportState } from "@/server/catalog/actions";
import type { ImportRowView } from "@/server/catalog/catalog-import";
import { fmtInt } from "@/lib/format";
import messages from "../../messages/admin.vi.json";

const actionState = vi.hoisted(() => ({ state: undefined as CatalogImportState, pending: false }));
vi.mock("@/server/catalog/actions", () => ({ catalogImportAction: vi.fn() }));
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useActionState: () => [actionState.state, async () => {}, actionState.pending],
}));

function render() {
  const props: ComponentProps<typeof NextIntlClientProvider> = {
    locale: "vi", timeZone: "UTC", messages, children: createElement(CatalogImport),
  };
  return renderToStaticMarkup(createElement(NextIntlClientProvider, props));
}

function confirmButton(html: string) {
  return [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map((m) => m[0]).find((button) => button.includes(messages.CatalogImport.confirm));
}

beforeEach(() => {
  actionState.pending = false;
  actionState.state = { preview: {
    input: { csv: "name_en,brand,category\nCream,Brand,skincare", standardLabel: "Tiêu chuẩn" },
    errors: [], warnings: [], rows: [], rate: null, general: [], documents: 0,
    counts: { createdProducts: 1, updatedProducts: 0, unchangedProducts: 0, stockLines: 0, priceChanges: 0 },
    rowCounts: { create: 1, update: 0, same: 0, error: 0 },
  } };
});

describe("Xác nhận nhập Excel", () => {
  it("vẫn hiện nút khi file có lỗi, khoá nút và giải thích cách sửa", () => {
    actionState.state!.preview!.errors = ["Dòng 7: chưa điền giá mua"];
    const html = render();
    const button = confirmButton(html);
    expect(button).toBeDefined();
    expect(button).toContain('disabled=""');
    expect(button).toContain('aria-describedby="catalog-import-confirm-help"');
    expect(html).toContain(messages.CatalogImport.confirmBlocked);
    expect(html).toContain("Dòng 7: chưa điền giá mua");
  });

  it("file hợp lệ: nút sau bảng và gửi đúng bước xác nhận", () => {
    const html = render();
    const button = confirmButton(html);
    expect(button).toBeDefined();
    expect(button).not.toContain('disabled=""');
    expect(html.indexOf(button!)).toBeGreaterThan(html.indexOf("<table"));
    expect(html).toContain('name="step" value="confirm"');
    expect(html).toContain('name="payload"');
  });

  it("cảnh báo không chặn xác nhận, đang xử lý thì khoá nút", () => {
    actionState.state!.preview!.warnings = ["Chưa biết hạn sử dụng"];
    expect(confirmButton(render())).not.toContain('disabled=""');
    actionState.pending = true;
    expect(confirmButton(render())).toContain('disabled=""');
  });

  it("chưa có xem trước thì chưa cho xác nhận", () => {
    actionState.state = undefined;
    expect(confirmButton(render())).toBeUndefined();
  });
});

const row = (over: Partial<ImportRowView>): ImportRowView => ({
  line: 7, action: "create", name: "Cream", nameFromFile: true, brand: "Brand", category: "Skincare",
  sku: "CREAM-1", skuAuto: true, label: "", labelFromFile: false, weight: null, weightFromFile: false,
  changes: [], price: null, currentPrice: null, priceStaged: false, stock: null, issues: [], ...over,
});

describe("Bảng xem trước nhập Excel", () => {
  it("dòng lỗi vẫn có trong bảng, lỗi hiện ngay trên dòng", () => {
    const preview = actionState.state!.preview!;
    preview.errors = ["Dòng 8: Chưa điền danh mục"];
    preview.rows = [row({}), row({ line: 8, action: "error", issues: [{ level: "error", text: "Chưa điền danh mục" }] })];
    preview.rowCounts = { create: 1, update: 0, same: 0, error: 1 };
    const html = render();
    expect(html).toContain('data-testid="catalog-import-row-8"');
    const line8 = html.slice(html.indexOf('data-testid="catalog-import-row-8"'));
    expect(line8).toContain(messages.CatalogImport.action.error);
    expect(line8).toContain("Chưa điền danh mục");
    expect(html).toContain(messages.CatalogImport.showErrors);
  });

  it("hiện giá mua đúng đơn vị file, phí trống → chưa có giá vốn; ô trống ghi rõ tự sinh / tiêu chuẩn", () => {
    const preview = actionState.state!.preview!;
    preview.rows = [row({
      stock: { qty: 5, lotNo: "NK261116", lotAuto: true, location: "TH", expiryDate: "2028-03-31", expiryStatus: "DATED", currency: "VND", unitCost: 150000, inboundVnd: null, costMmk: null },
    })];
    const html = render();
    expect(html).toContain(`Giá mua ${fmtInt(150000)} VND/đv`);
    expect(html).toContain(messages.CatalogImport.inboundUnknown);
    expect(html).toContain(messages.CatalogImport.costMissing);
    expect(html).toContain(messages.CatalogImport.autoSku);
    expect(html).toContain(messages.CatalogImport.standardLabel);
  });

  it("cột giá chỉ hiện khi file có điền giá; SP đã duyệt ghi chờ duyệt", () => {
    const preview = actionState.state!.preview!;
    preview.rows = [row({})];
    expect(render()).not.toContain(messages.CatalogImport.colPrice);
    preview.rows = [row({ action: "update", price: 12000, currentPrice: 10000, priceStaged: true, changes: ["price"] })];
    const html = render();
    expect(html).toContain(messages.CatalogImport.colPrice);
    expect(html).toContain(`đang bán ${fmtInt(10000)}`);
    expect(html).toContain(messages.CatalogImport.priceStaged);
    expect(html).toContain("đổi: Giá bán");
  });
});
