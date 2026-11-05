import { describe, expect, it } from "vitest";
import { allocateLandedCost } from "@/server/inventory/landed-cost";
describe("D8 trọng số kg", () => {
  it("dùng số lượng × gram và chia đủ từng VND", () => {
    const result = allocateLandedCost([{key:"a",qty:2,unitCostVnd:100,weightGrams:100},{key:"b",qty:2,unitCostVnd:100,weightGrams:300}], 801, "BY_WEIGHT");
    expect(result.map(r=>r.allocatedVnd)).toEqual([200,601]);
  });
  it("thiếu gram không lùi về chia số lượng, kể cả chi phí bằng 0", () => {
    expect(()=>allocateLandedCost([{key:"missing",qty:2,unitCostVnd:100}],0,"BY_WEIGHT")).toThrow("missing");
  });
  it("tích trọng số lớn vẫn chia chính xác", () => {
    const result=allocateLandedCost([{key:"a",qty:2000000000,unitCostVnd:1,weightGrams:2000000000},{key:"b",qty:2000000000,unitCostVnd:1,weightGrams:2000000000}],2000000001,"BY_WEIGHT");
    expect(result.map(r=>r.allocatedVnd)).toEqual([1000000001,1000000000]);
  });
});
