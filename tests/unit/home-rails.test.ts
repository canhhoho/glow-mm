import { describe, expect, it } from "vitest";
import { railsToShow } from "@/lib/home-rails";

const p = (...slugs: string[]) => slugs.map((slug) => ({ slug }));

// G1: trang chủ bớt lặp khi shop còn ít SP; catalog lớn giữ nguyên cấu trúc.
describe("railsToShow", () => {
  it("shop ít SP: ẩn dải trống và dải chỉ lặp SP đã có ở Sản phẩm mới", () => {
    expect(railsToShow(p("a", "b", "c"), [p("a", "b"), [], p("c")], 10)).toEqual([false, false, false]);
  });
  it("giữ dải có ít nhất một SP chưa hiện", () => {
    expect(railsToShow(p("a", "b"), [p("a", "x"), p("y", "z")], 10)).toEqual([true, true]);
  });
  it("dải đầy (danh mục còn SP để Xem thêm) luôn giữ dù trùng Sản phẩm mới", () => {
    expect(railsToShow(p("a", "b"), [p("a", "b")], 2)).toEqual([true]);
  });
  it("không có Sản phẩm mới → mọi dải có SP đều hiện", () => {
    expect(railsToShow([], [p("a"), []], 10)).toEqual([true, false]);
  });
});
