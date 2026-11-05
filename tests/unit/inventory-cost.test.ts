import { describe, expect, it } from "vitest";
import { inventoryCost } from "@/server/inventory/cost";
import { itemProfit } from "@/server/reports/profit";

describe("Inventory cost source", () => {
  it("prefers actual over estimated, including a legitimate zero cost", () => {
    expect(inventoryCost({ landedCostMmk: 0, estimatedCostMmk: 300 })).toEqual({ unitCostMmk: 0, costStatus: "ACTUAL" });
    expect(inventoryCost({ landedCostMmk: null, estimatedCostMmk: 300 })).toEqual({ unitCostMmk: 300, costStatus: "ESTIMATED" });
    expect(inventoryCost({ landedCostMmk: null })).toEqual({ unitCostMmk: null, costStatus: "MISSING" });
  });

  it("reports estimates separately from missing costs and accepts actual zero", () => {
    const item = { qty: 2, returnedQty: 1, unitPriceMmk: 1000, parts: [{ variantId: "v", qty: 1 }] };
    const allocation = { batchId: "b", variantId: "v", qty: 2, unitCostMmk: 300 };
    expect(itemProfit({ ...item, allocations: [{ ...allocation, costStatus: "ESTIMATED" }] })).toMatchObject({ cogs: 300, profit: 700, estimatedCost: true, missingCost: false });
    expect(itemProfit({ ...item, allocations: [{ ...allocation, unitCostMmk: 0, costStatus: "ACTUAL" }] })).toMatchObject({ estimatedCost: false, missingCost: false });
    expect(itemProfit({ ...item, allocations: [{ ...allocation, unitCostMmk: 0, costStatus: "MISSING" }] })).toMatchObject({ missingCost: true });
  });
});
