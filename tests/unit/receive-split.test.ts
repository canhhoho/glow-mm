import { describe, expect, it } from "vitest";
import { splitReceivePayload } from "@/server/inventory/receive-split";

const line = (variantId: string, toId?: string) => ({ variantId, lotNo: "L1", qty: 1, unitCostVnd: 100, ...(toId ? { toId } : {}) });

describe("splitReceivePayload — phiếu nhập nháp tách theo kho", () => {
  it("nhóm dòng theo kho của dòng, giữ thứ tự xuất hiện đầu tiên và bỏ toId khỏi dòng", () => {
    const groups = splitReceivePayload({ type: "RECEIVE", lines: [line("a", "K2"), line("b", "K1"), line("c", "K2")] });
    expect(groups.map((g) => g.toId)).toEqual(["K2", "K1"]);
    expect((groups[0].payload.lines as { variantId: string }[]).map((l) => l.variantId)).toEqual(["a", "c"]);
    expect((groups[1].payload.lines as { variantId: string }[]).map((l) => l.variantId)).toEqual(["b"]);
    expect(groups[0].payload.toId).toBe("K2");
    expect(groups.flatMap((g) => g.payload.lines as object[]).some((l) => "toId" in l)).toBe(false);
  });

  it("dòng không có kho dùng kho cấp phiếu (payload cũ / Excel)", () => {
    const groups = splitReceivePayload({ type: "RECEIVE", toId: "K1", lines: [line("a"), line("b", "K2")] });
    expect(groups.map((g) => g.toId)).toEqual(["K1", "K2"]);
  });

  it("một kho: giữ nguyên khoá chống trùng; nhiều kho: khoá dẫn xuất theo kho", () => {
    const one = splitReceivePayload({ type: "RECEIVE", idempotencyKey: "key-12345678", lines: [line("a", "K1")] });
    expect(one[0].payload.idempotencyKey).toBe("key-12345678");
    const many = splitReceivePayload({ type: "RECEIVE", idempotencyKey: "key-12345678", lines: [line("a", "K1"), line("b", "K2")] });
    expect(many.map((g) => g.payload.idempotencyKey)).toEqual(["key-12345678:K1", "key-12345678:K2"]);
  });

  it("khối lượng chỉ gửi cho một phiếu (phiếu đầu có biến thể đó)", () => {
    const groups = splitReceivePayload({
      type: "RECEIVE",
      lines: [line("a", "K1"), line("b", "K2"), line("a", "K2")],
      weights: [{ variantId: "a", weightGrams: 50 }, { variantId: "b", weightGrams: 70 }],
    });
    expect(groups[0].payload.weights).toEqual([{ variantId: "a", weightGrams: 50 }]);
    expect(groups[1].payload.weights).toEqual([{ variantId: "b", weightGrams: 70 }]);
  });

  it("khối lượng của biến thể không có dòng nào ở lại nhóm đầu (để schema báo lỗi)", () => {
    const groups = splitReceivePayload({ type: "RECEIVE", lines: [line("a", "K1"), line("b", "K2")], weights: [{ variantId: "zzz", weightGrams: 5 }] });
    expect(groups[0].payload.weights).toEqual([{ variantId: "zzz", weightGrams: 5 }]);
    expect(groups[1].payload.weights).toEqual([]);
  });

  it("payload sai cấu trúc hoặc thiếu kho trả nguyên một nhóm để Zod báo lỗi", () => {
    expect(splitReceivePayload(null)).toHaveLength(1);
    expect(splitReceivePayload({ lines: "x" })).toHaveLength(1);
    expect(splitReceivePayload({ type: "RECEIVE", lines: [line("a")] })).toEqual([{ toId: "", payload: { type: "RECEIVE", lines: [line("a")] } }]);
  });
});
