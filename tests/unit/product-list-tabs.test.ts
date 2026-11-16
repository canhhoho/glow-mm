import { describe, expect, it } from "vitest";
import { LIST_TABS, MAIN_LIST_TABS, OTHER_LIST_TABS, parseListTab } from "@/server/catalog/product-list";

describe("tab danh sách sản phẩm", () => {
  it("tab chính + trạng thái phụ phủ đủ mọi giá trị `status`, không trùng", () => {
    const all = [...MAIN_LIST_TABS, ...OTHER_LIST_TABS];
    expect(new Set(all).size).toBe(all.length);
    expect([...all].sort()).toEqual([...LIST_TABS].sort());
  });

  it("mọi trạng thái phụ vẫn mở được bằng đường dẫn cũ (?status=…)", () => {
    for (const tab of OTHER_LIST_TABS) expect(parseListTab(tab)).toBe(tab);
    expect(parseListTab("review")).toBe("review");
    expect(parseListTab("không-có")).toBe("active");
  });
});
