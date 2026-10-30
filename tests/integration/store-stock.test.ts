import { describe, expect, it } from "vitest";
import { listStoreProducts, loadCardRows, sortCards, withStock } from "@/server/catalog/store-queries";

describe("Thẻ SP: nội dung tách khỏi tồn (P20)", () => {
  it("withStock gộp nhiều nhóm cho kết quả giống tính từng nhóm, giữ thứ tự và bỏ variantIds", async () => {
    const rows = await loadCardRows({ locale: "en", take: 20 });
    expect(rows.length).toBeGreaterThan(1);
    const half = Math.ceil(rows.length / 2);
    const groups = [rows.slice(0, half), rows.slice(half), []];

    const together = await withStock(groups);
    const separately = await Promise.all(groups.map(async (g) => (await withStock([g]))[0]));
    expect(together).toEqual(separately);
    expect(together[0].map((c) => c.slug)).toEqual(groups[0].map((r) => r.slug));
    expect(together[0][0]).not.toHaveProperty("variantIds");
  });

  it("listStoreProducts = nội dung + tồn + sắp theo giá", async () => {
    const [cards] = await withStock([await loadCardRows({ locale: "en", take: 20 })]);
    const asc = await listStoreProducts({ locale: "en", take: 20, sort: "price_asc" });
    expect(asc).toEqual(sortCards([...cards], "price_asc"));
    expect(asc.map((c) => c.priceMmk)).toEqual([...asc.map((c) => c.priceMmk)].sort((a, b) => a - b));
  });
});
