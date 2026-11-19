import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { toCsv } from "@/lib/csv";
import { commitCatalogImport, previewCatalogImport } from "@/server/catalog/catalog-import";
import { createDocument, postDocument } from "@/server/inventory/documents";
import { makeFixture, unpublishTestProducts } from "./fixtures";

afterAll(unpublishTestProducts);

const sheet = (rows: Record<string, string | number>[]) => {
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return { csv: toCsv([keys, ...rows.map((r) => keys.map((k) => r[k] ?? ""))]) };
};

// 19/11/2026 — Excel chỉ là giai đoạn TẠO SẢN PHẨM: cột Số lượng = SL dự kiến nhập (0 vẫn là 0), cột Giá mua = giá mua hiện tại.
// Không tạo phiếu, không lô, không tồn. Phiếu nhập kho (tạo khi hàng về) gợi ý sẵn hai số này; ghi sổ → SL dự kiến về 0.
describe("Excel: SL dự kiến nhập (không tạo phiếu) → phiếu nhập gợi ý → ghi sổ đặt lại", () => {
  it("file trộn: ghi SL dự kiến + giá mua theo tiền của kho, gán kho; không phiếu / lô / tồn; ghi sổ phiếu nhập → SL dự kiến về 0", async () => {
    const f = await makeFixture();
    await prisma.exchangeRate.create({ data: { mmkPerVnd: "0.2", createdById: f.userId } });
    const brand = `Stage ${f.tag}`;
    const cat = `it-${f.tag}`;
    const input = sheet([
      { name: `Only ${f.tag}`, brand, category: cat, warehouse_code: f.mm.code }, // chỉ hồ sơ, gán kho
      { name: `Zero ${f.tag}`, brand, category: cat, warehouse_code: f.mm.code, qty: 0, unit_cost: 120_000 }, // 0 vẫn là 0
      { name: `Chi ${f.tag}`, brand, category: cat, warehouse_code: f.chi.code, qty: 4, unit_cost: 15_000 }, // kho Myanmar: giá mua MMK
      { name: `Plan ${f.tag}`, brand, category: cat, warehouse_code: f.mm.code, qty: 5, unit_cost: 100_000 },
    ]);
    const p = await previewCatalogImport(input);
    expect(p.errors).toEqual([]);
    expect(p.counts).toMatchObject({ createdProducts: 4, plannedQty: 3, purchasePrices: 3 });
    expect(p.rows.map((r) => [r.planned, r.purchase?.currency ?? null])).toEqual([[null, null], [0, "VND"], [4, "MMK"], [5, "VND"]]);

    const docsBefore = await prisma.stockDocument.count();
    await commitCatalogImport(p.input, f.userId);
    expect(await prisma.stockDocument.count()).toBe(docsBefore);
    const variant = (name: string) =>
      prisma.variant.findFirstOrThrow({ where: { product: { translations: { some: { name } } } }, include: { product: { select: { stockLocationId: true } }, batches: true } });
    const only = await variant(`Only ${f.tag}`);
    expect(only).toMatchObject({ plannedReceiveQty: 0, batches: [], product: { stockLocationId: f.mm.id } }); // gán kho dù không nhập hàng
    expect(await variant(`Zero ${f.tag}`)).toMatchObject({ plannedReceiveQty: 0, purchasePriceVnd: 120_000, batches: [] });
    expect(await variant(`Chi ${f.tag}`)).toMatchObject({ plannedReceiveQty: 4, purchasePriceMmk: 15_000, purchasePriceVnd: null, product: { stockLocationId: f.chi.id } });
    const plan = await variant(`Plan ${f.tag}`);
    expect(plan).toMatchObject({ plannedReceiveQty: 5, purchasePriceVnd: 100_000, batches: [], product: { stockLocationId: f.mm.id } });

    // Phiếu nhập: nháp chưa đổi SL dự kiến; ghi sổ (nhập 3, ít hơn dự kiến) → SL dự kiến về 0. Phân loại khác giữ nguyên.
    const doc = await createDocument({ type: "RECEIVE", toId: f.mm.id, lines: [{ variantId: plan.id, lotNo: "NK-TEST", unitCostVnd: 100_000, qty: 3 }] }, f.userId);
    expect((await prisma.variant.findUniqueOrThrow({ where: { id: plan.id } })).plannedReceiveQty).toBe(5);
    await postDocument(doc.id, f.userId);
    expect((await prisma.variant.findUniqueOrThrow({ where: { id: plan.id } })).plannedReceiveQty).toBe(0);
    expect((await variant(`Chi ${f.tag}`)).plannedReceiveQty).toBe(4);
  });

  it("chặn đúng: SL âm / thập phân / chữ; thiếu Kho bán khi SP chưa có kho mà có giá mua hoặc SL > 0; sai loại tiền", async () => {
    const f = await makeFixture();
    const brand = `Bad ${f.tag}`;
    const cat = `it-${f.tag}`;
    const p = await previewCatalogImport(
      sheet([
        { name: `Neg ${f.tag}`, brand, category: cat, warehouse_code: f.mm.code, qty: -2, unit_cost: 1 },
        { name: `Dec ${f.tag}`, brand, category: cat, warehouse_code: f.mm.code, qty: "2.5", unit_cost: 1 },
        { name: `Txt ${f.tag}`, brand, category: cat, warehouse_code: f.mm.code, qty: "abc", unit_cost: 1 },
        { name: `NoWh ${f.tag}`, brand, category: cat, unit_cost: 15_000 },
        { name: `NoWhQty ${f.tag}`, brand, category: cat, qty: 3 },
        { name: `Cur ${f.tag}`, brand, category: cat, warehouse_code: f.chi.code, unit_cost_vnd: 15_000 },
        { name: `Ok ${f.tag}`, brand, category: cat }, // không kho, không giá mua, không SL → hợp lệ (gán kho sau ở bước 2)
        { name: `OkZero ${f.tag}`, brand, category: cat, qty: 0 }, // SL dự kiến 0 không cần kho
      ]),
    );
    const err = (line: number) => p.rows.find((r) => r.line === line)!.issues.filter((i) => i.level === "error").map((i) => i.text).join(" ");
    expect(err(2)).toContain("không được âm");
    expect(err(3)).toContain("số nguyên");
    expect(err(4)).toContain("phải là số");
    expect(err(5)).toContain("ghi cột Kho bán");
    expect(err(6)).toContain("ghi cột Kho bán");
    expect(err(7)).toContain("để trống cột VND");
    expect(p.rows.find((r) => r.line === 8)!.action).toBe("create");
    expect(p.rows.find((r) => r.line === 9)!).toMatchObject({ action: "create", planned: 0 });
  });

  it("file cũ còn cột Hạn sử dụng / Ngày SX / Số lô / Loại hàng: bỏ qua kèm lưu ý, không chặn", async () => {
    const f = await makeFixture();
    const p = await previewCatalogImport(
      sheet([{ name: `Exp ${f.tag}`, brand: `Exp ${f.tag}`, category: `it-${f.tag}`, warehouse_code: f.mm.code, qty: 2, unit_cost: 50_000, expiry_date: "31/02/2028", mfg_date: "x", lot_no: "L1", stock_type: "TESTER" }]),
    );
    expect(p.errors).toEqual([]);
    expect(p.warnings.join(" ")).toContain("Hạn sử dụng / Ngày sản xuất không còn dùng");
    expect(p.warnings.join(" ")).toContain("Số lô / Loại hàng không còn dùng");
    expect(p.rows[0].planned).toBe(2);
  });
});
