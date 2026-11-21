import { describe, expect, it } from "vitest";
import { MAX_RECEIVE_PICKS, parseReceivePicks, receivePicksHref } from "@/lib/receive-picks";

describe("chọn sẵn phân loại cho phiếu nhập (Cảnh báo → phiếu nhập)", () => {
  it("tạo link: id[:qty], bỏ qty ≤ 0, cắt giới hạn", () => {
    expect(receivePicksHref([{ id: "v1", qty: 12 }, { id: "v2" }, { id: "v3", qty: 0 }])).toBe("/admin/inventory/documents/new?type=RECEIVE&pick=v1%3A12&pick=v2&pick=v3");
    const many = Array.from({ length: MAX_RECEIVE_PICKS + 5 }, (_, i) => ({ id: `v${i}` }));
    expect(new URL(receivePicksHref(many), "http://x").searchParams.getAll("pick")).toHaveLength(MAX_RECEIVE_PICKS);
  });

  it("đọc link: bỏ id sai, trùng (giữ lần đầu), qty không hợp lệ", () => {
    expect(parseReceivePicks(["v1:12", "v2", "v1:5", "bad id", "v3:-1", "v4:abc", "v5:0"])).toEqual([
      { id: "v1", qty: 12 },
      { id: "v2" },
      { id: "v3" },
      { id: "v4" },
      { id: "v5" },
    ]);
    expect(parseReceivePicks("v9:3")).toEqual([{ id: "v9", qty: 3 }]);
    expect(parseReceivePicks(undefined)).toEqual([]);
  });
});
