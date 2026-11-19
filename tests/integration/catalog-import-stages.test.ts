import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { toCsv } from "@/lib/csv";
import { commitCatalogImport, previewCatalogImport } from "@/server/catalog/catalog-import";
import { makeFixture, unpublishTestProducts } from "./fixtures";

afterAll(unpublishTestProducts);

const sheet = (rows: Record<string, string | number>[]) => {
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return { csv: toCsv([keys, ...rows.map((r) => keys.map((k) => r[k] ?? ""))]) };
};

// 19/11/2026 — tạo sản phẩm và nhập kho là hai giai đoạn: Số lượng trống / 0 = chỉ hồ sơ SP (không phiếu, không tồn),
// Số lượng > 0 = thêm phiếu nhập nháp. Giá mua theo tiền của kho; SP chưa có kho phải ghi Kho bán (không đoán kho mặc định).
describe("Excel: hồ sơ sản phẩm và nhập kho tách giai đoạn", () => {
  it("file trộn: SL trống / 0 → chỉ SP (kèm giá mua hiện tại), SL > 0 → phiếu nháp; xem trước khớp xác nhận", async () => {
    const f = await makeFixture();
    await prisma.exchangeRate.create({ data: { mmkPerVnd: "0.2", createdById: f.userId } });
    const brand = `Stage ${f.tag}`;
    const cat = `it-${f.tag}`;
    const input = sheet([
      { name: `Only ${f.tag}`, brand, category: cat, warehouse_code: f.mm.code }, // chỉ hồ sơ, gán kho
      { name: `Zero ${f.tag}`, brand, category: cat, warehouse_code: f.mm.code, qty: 0, unit_cost: 120_000, lot_no: "L-NOQTY" }, // 0 = chỉ hồ sơ + giá mua
      { name: `Chi ${f.tag}`, brand, category: cat, warehouse_code: f.chi.code, unit_cost: 15_000 }, // kho Myanmar: giá mua MMK
      { name: `Stock ${f.tag}`, brand, category: cat, warehouse_code: f.mm.code, qty: 5, unit_cost: 100_000 }, // nhập kho
    ]);
    const p = await previewCatalogImport(input);
    expect(p.errors).toEqual([]);
    expect(p.counts).toMatchObject({ createdProducts: 4, stockLines: 1, purchasePrices: 2 });
    expect(p.rows.map((r) => [!!r.stock, r.purchase?.currency ?? null])).toEqual([[false, null], [false, "VND"], [false, "MMK"], [true, null]]);
    // Số lô không kèm số lượng → lưu ý rõ (không âm thầm bỏ qua).
    expect(p.rows[1].issues.map((i) => i.text).join(" ")).toContain("chưa nhập kho");
    expect(p.documents).toBe(1);

    const res = await commitCatalogImport(p.input, f.userId);
    expect(res.documents).toHaveLength(1);
    const variant = (name: string) =>
      prisma.variant.findFirstOrThrow({ where: { product: { translations: { some: { name } } } }, include: { product: { select: { stockLocationId: true } }, batches: true } });
    const only = await variant(`Only ${f.tag}`);
    expect(only.product.stockLocationId).toBe(f.mm.id); // gán kho từ cột Kho bán dù không nhập hàng
    expect(only.batches).toHaveLength(0);
    expect(await variant(`Zero ${f.tag}`)).toMatchObject({ purchasePriceVnd: 120_000, batches: [] });
    expect(await variant(`Chi ${f.tag}`)).toMatchObject({ purchasePriceMmk: 15_000, purchasePriceVnd: null, product: { stockLocationId: f.chi.id } });
    const stock = await variant(`Stock ${f.tag}`);
    expect(stock).toMatchObject({ purchasePriceVnd: 100_000, product: { stockLocationId: f.mm.id } });
    expect(stock.batches).toHaveLength(1); // lô của phiếu nháp (chưa ghi sổ → chưa có tồn)
    expect(await prisma.stockBalance.count({ where: { batch: { variantId: stock.id } } })).toBe(0);
  });

  it("chặn đúng: SL âm / thập phân / chữ; thiếu Kho bán khi SP chưa có kho mà có giá mua hoặc số lượng; sai loại tiền", async () => {
    const f = await makeFixture();
    const brand = `Bad ${f.tag}`;
    const cat = `it-${f.tag}`;
    const p = await previewCatalogImport(
      sheet([
        { name: `Neg ${f.tag}`, brand, category: cat, warehouse_code: f.mm.code, qty: -2, unit_cost: 1 },
        { name: `Dec ${f.tag}`, brand, category: cat, warehouse_code: f.mm.code, qty: "2.5", unit_cost: 1 },
        { name: `Txt ${f.tag}`, brand, category: cat, warehouse_code: f.mm.code, qty: "abc", unit_cost: 1 },
        { name: `NoWh ${f.tag}`, brand, category: cat, unit_cost: 15_000 },
        { name: `NoWhQty ${f.tag}`, brand, category: cat, qty: 3, unit_cost: 15_000 },
        { name: `Cur ${f.tag}`, brand, category: cat, warehouse_code: f.chi.code, unit_cost_vnd: 15_000 },
        { name: `Ok ${f.tag}`, brand, category: cat }, // không kho, không giá mua, không SL → hợp lệ (gán kho sau ở bước 2)
      ]),
    );
    const err = (line: number) => p.rows.find((r) => r.line === line)!.issues.filter((i) => i.level === "error").map((i) => i.text).join(" ");
    expect(err(2)).toContain("phải lớn hơn 0");
    expect(err(3)).toContain("số nguyên");
    expect(err(4)).toContain("phải là số");
    expect(err(5)).toContain("ghi cột Kho bán");
    expect(err(6)).toContain("ghi cột Kho bán");
    expect(err(7)).toContain("để trống cột VND");
    expect(p.rows.find((r) => r.line === 8)!.action).toBe("create");
  });

  it("file cũ còn cột Hạn sử dụng / Ngày SX: bỏ qua kèm lưu ý, lô nhập không có hạn", async () => {
    const f = await makeFixture();
    await prisma.exchangeRate.create({ data: { mmkPerVnd: "0.2", createdById: f.userId } });
    const p = await previewCatalogImport(
      sheet([{ name: `Exp ${f.tag}`, brand: `Exp ${f.tag}`, category: `it-${f.tag}`, warehouse_code: f.mm.code, qty: 2, unit_cost: 50_000, expiry_date: "31/02/2028", mfg_date: "x" }]),
    );
    expect(p.errors).toEqual([]);
    expect(p.warnings.join(" ")).toContain("Hạn sử dụng / Ngày sản xuất không còn dùng");
    expect(p.rows[0].stock).toMatchObject({ expiryStatus: "NONE", expiryDate: null });
  });
});
