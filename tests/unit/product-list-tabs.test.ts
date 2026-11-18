import { describe, expect, it } from "vitest";
import { LIST_TABS, MAIN_LIST_TABS, parseListTab } from "@/server/catalog/product-list";

describe("tab danh sách sản phẩm", () => {
  it("tab chính là tập con của mọi giá trị `status`, không trùng", () => {
    expect(new Set(MAIN_LIST_TABS).size).toBe(MAIN_LIST_TABS.length);
    for (const tab of MAIN_LIST_TABS) expect(LIST_TABS).toContain(tab);
  });

  it("mọi trạng thái mở được bằng đường dẫn (?status=…), giá trị lạ về mặc định", () => {
    for (const tab of LIST_TABS) expect(parseListTab(tab)).toBe(tab);
    expect(parseListTab("không-có")).toBe("active");
  });
});
