import { describe, expect, it } from "vitest";
import { pickReturnBatches } from "@/server/orders/return-alloc";

const allocs = [
  { batchId: "A", qty: 3 },
  { batchId: "B", qty: 2 },
];

describe("Phân bổ hàng trả về lô", () => {
  it("lần trả đầu lấy từ phân bổ đầu tiên", () => {
    expect(pickReturnBatches(allocs, 0, 2)).toEqual([{ batchId: "A", qty: 2 }]);
    expect(pickReturnBatches(allocs, 0, 4)).toEqual([
      { batchId: "A", qty: 3 },
      { batchId: "B", qty: 1 },
    ]);
  });

  it("lần trả sau bỏ qua phần đã trả", () => {
    expect(pickReturnBatches(allocs, 2, 2)).toEqual([
      { batchId: "A", qty: 1 },
      { batchId: "B", qty: 1 },
    ]);
    expect(pickReturnBatches(allocs, 4, 1)).toEqual([{ batchId: "B", qty: 1 }]);
  });

  it("gộp phân bổ trùng lô; chặn trả vượt", () => {
    expect(
      pickReturnBatches(
        [
          { batchId: "A", qty: 1 },
          { batchId: "A", qty: 1 },
        ],
        0,
        2,
      ),
    ).toEqual([{ batchId: "A", qty: 2 }]);
    expect(() => pickReturnBatches(allocs, 4, 2)).toThrow(/vượt/);
    expect(() => pickReturnBatches(allocs, 0, 0)).toThrow();
  });
});
