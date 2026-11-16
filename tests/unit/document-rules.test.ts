import { describe, expect, it } from "vitest";
import { batchSelectable, keepValidBatches, type FormBatchLike } from "@/server/inventory/document-form-rules";
import { balanceKey, previewDocument } from "@/server/inventory/document-preview";

const batches: FormBatchLike[] = [
  { id: "b1", variantId: "v1", posted: true, balances: [{ locationId: "A", stockType: "SELLABLE", qty: 5 }, { locationId: "B", stockType: "SELLABLE", qty: 0 }] },
  { id: "b2", variantId: "v1", posted: true, balances: [{ locationId: "B", stockType: "SELLABLE", qty: 3 }, { locationId: "A", stockType: "TESTER", qty: 2 }] },
  { id: "b3", variantId: "v1", posted: false, balances: [] },
];

describe("chọn lô ở form phiếu kho", () => {
  it("chuyển/xuất: chỉ lô còn hàng ở kho xuất theo loại tồn; điều chỉnh: mọi lô đã có sổ kho", () => {
    expect(batchSelectable("TRANSFER", batches[0], "A", "SELLABLE")).toBe(true);
    expect(batchSelectable("ISSUE", batches[0], "B", "SELLABLE")).toBe(false);
    expect(batchSelectable("ISSUE", batches[1], "A", "TESTER")).toBe(true);
    expect(batchSelectable("ADJUST", batches[0], "B", "SELLABLE")).toBe(true);
    expect(batchSelectable("ADJUST", batches[2], "A", "SELLABLE")).toBe(false);
  });

  it("đổi kho xuất → bỏ chọn lô không còn hàng ở kho mới, giữ lô còn hợp lệ, đếm số dòng bị bỏ", () => {
    const lines = [
      { variantId: "v1", batchId: "b1", stockType: "SELLABLE", qty: "1" },
      { variantId: "v1", batchId: "b2", stockType: "SELLABLE", qty: "1" },
      { variantId: "v1", batchId: "", stockType: "SELLABLE", qty: "1" },
    ];
    const r = keepValidBatches(lines, batches, "TRANSFER", "B");
    expect(r.lines.map((l) => l.batchId)).toEqual(["", "b2", ""]);
    expect(r.cleared).toBe(1);
    // Điều chỉnh không phụ thuộc kho → không bỏ gì.
    expect(keepValidBatches(lines, batches, "ADJUST", "B").cleared).toBe(0);
    // Lô thuộc biến thể khác → bỏ.
    expect(keepValidBatches([{ variantId: "v2", batchId: "b1", stockType: "SELLABLE" }], batches, "ISSUE", "A").cleared).toBe(1);
  });
});

describe("xem trước ghi sổ", () => {
  const current = new Map([
    [balanceKey("A", "v1", "SELLABLE"), 10],
    [balanceKey("B", "v1", "SELLABLE"), 2],
  ]);

  it("chuyển kho: giảm ở kho xuất, tăng ở kho nhận, cộng gộp dòng cùng SKU", () => {
    const p = previewDocument({ type: "TRANSFER", fromId: "A", toId: "B", lines: [{ variantId: "v1", qty: 4, stockType: "SELLABLE" }, { variantId: "v1", qty: 1, stockType: "SELLABLE" }] }, current);
    expect(p.lineCount).toBe(2);
    expect(p.increase).toBe(5);
    expect(p.decrease).toBe(5);
    expect(p.effects).toEqual([
      { locationId: "A", variantId: "v1", stockType: "SELLABLE", delta: -5, before: 10, after: 5 },
      { locationId: "B", variantId: "v1", stockType: "SELLABLE", delta: 5, before: 2, after: 7 },
    ]);
    expect(p.short).toEqual([]);
  });

  it("nhập tăng ở kho nhận; xuất vượt tồn → báo thiếu (dự kiến âm)", () => {
    expect(previewDocument({ type: "RECEIVE", fromId: null, toId: "A", lines: [{ variantId: "v1", qty: 3, stockType: "SELLABLE" }] }, current).effects[0]).toMatchObject({ before: 10, delta: 3, after: 13 });
    const out = previewDocument({ type: "ISSUE", fromId: "B", toId: null, lines: [{ variantId: "v1", qty: 5, stockType: "SELLABLE" }] }, current);
    expect(out.decrease).toBe(5);
    expect(out.short).toHaveLength(1);
    expect(out.short[0].after).toBe(-3);
  });

  it("điều chỉnh theo dấu tại vị trí điều chỉnh; số 0 không tạo ảnh hưởng", () => {
    const adj = previewDocument({ type: "ADJUST", fromId: null, toId: "A", lines: [{ variantId: "v1", qty: -2, stockType: "SELLABLE" }, { variantId: "v1", qty: 0, stockType: "TESTER" }] }, current);
    expect(adj.effects).toHaveLength(1);
    expect(adj.effects[0]).toMatchObject({ delta: -2, after: 8 });
    expect(adj.increase).toBe(0);
    expect(adj.decrease).toBe(2);
  });
});
