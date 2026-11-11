import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogImport } from "@/components/admin/catalog-import";
import type { CatalogImportState } from "@/server/catalog/actions";
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
    errors: [], warnings: [], rows: [], rate: null,
    counts: { createdProducts: 1, updatedProducts: 0, unchangedProducts: 0, stockLines: 0, priceChanges: 0 },
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

  it("file hợp lệ: nút trước bảng và gửi đúng bước xác nhận", () => {
    const html = render();
    const button = confirmButton(html);
    expect(button).toBeDefined();
    expect(button).not.toContain('disabled=""');
    expect(html.indexOf(button!)).toBeLessThan(html.indexOf("<table"));
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
