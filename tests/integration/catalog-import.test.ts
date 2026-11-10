import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { toCsv } from "@/lib/csv";
import { commitCatalogImport, previewCatalogImport } from "@/server/catalog/catalog-import";
import { postDocument } from "@/server/inventory/documents";
import { makeFixture, unpublishTestProducts } from "./fixtures";

afterAll(unpublishTestProducts);

const sheet = (rows: Record<string, string | number>[]) => {
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return { csv: toCsv([keys, ...rows.map((r) => keys.map((k) => r[k] ?? ""))]) };
};

async function setup() {
  const f = await makeFixture();
  // Slug fixture có chữ hoa (không hợp lệ khi lưu lại qua saveProduct) → chuẩn hoá như dữ liệu thật.
  await prisma.product.update({ where: { id: f.productId }, data: { slug: `it-${f.tag.toLowerCase()}` } });
  const rate = await prisma.exchangeRate.create({ data: { mmkPerVnd: "0.2", createdById: f.userId } });
  return { f, rate, cat: `it-${f.tag}` };
}

describe("Nhập / cập nhật sản phẩm một sheet", () => {
  it("tạo mới: gộp biến thể theo tên + thương hiệu, tự sinh mã/lô, mỗi kho một phiếu nháp, chốt tỷ giá", async () => {
    const { f, rate, cat } = await setup();
    const brand = `New Brand ${f.tag}`;
    const input = sheet([
      { name_en: `Toner ${f.tag}`, brand, category: cat, variant_label: "100ml", price_mmk: 20000, weight_g: 120, warehouse_code: f.mm.code, qty: 5, expiry_date: "2028-03-31", unit_cost: 100000, inbound_unit_vnd: 5000 },
      { name_en: `Toner ${f.tag}`, brand, category: cat, variant_label: "200ml", price_mmk: "35,000", weight_g: 220, warehouse_code: f.mm.code, qty: 2, expiry_date: "2028-06-30", unit_cost: 180000 },
      { name_en: `Toner ${f.tag}`, brand, category: cat, variant_label: "200ml", warehouse_code: f.mm.code, qty: 1, unit_cost: 180000 },
      { name_my: `အိတ် ${f.tag}`, brand, category: cat, price_mmk: 50000, warehouse_code: f.chi.code, has_expiry: "Không", qty: 3, unit_cost: 30000 },
    ]);
    const preview = await previewCatalogImport(input);
    expect(preview.errors).toEqual([]);
    expect(preview.counts).toEqual({ createdProducts: 2, updatedProducts: 0, unchangedProducts: 0, stockLines: 4, priceChanges: 0 });
    expect(preview.input.rateId).toBe(rate.id);
    expect(preview.rows.map((r) => r.action)).toEqual(["create", "create", "create", "create"]);
    expect(preview.rows[0].stock).toMatchObject({ qty: 5, expiryStatus: "DATED", costMmk: 21000, location: f.mm.code });
    expect(preview.rows[2].stock).toMatchObject({ expiryStatus: "UNKNOWN", expiryDate: null });
    expect(preview.warnings.join("\n")).toContain("chưa có hạn sử dụng");
    // QT1b: SKU mới bỏ qua cột giá (giá đặt ở bước 3) → cảnh báo, xem trước hiện "—".
    expect(preview.warnings.join("\n")).toContain("bỏ qua giá bán của SKU mới");
    expect(preview.rows.every((r) => r.price === null)).toBe(true);
    expect(preview.rows[3].stock).toMatchObject({ expiryStatus: "NONE", costMmk: 30000, location: f.chi.code });
    expect(await prisma.brand.count({ where: { name: brand } })).toBe(0); // xem trước không ghi

    const result = await commitCatalogImport(preview.input, f.userId);
    expect(result.documents).toHaveLength(2);
    const toner = await prisma.product.findFirstOrThrow({ where: { translations: { some: { name: `Toner ${f.tag}` } } }, include: { variants: { orderBy: { sku: "asc" } }, translations: true, brand: true } });
    expect(toner).toMatchObject({ published: false, stockLocationId: f.mm.id, requiresExpiry: true, brand: { name: brand } });
    expect(toner.translations.map((t) => t.name)).toEqual([`Toner ${f.tag}`, `Toner ${f.tag}`]); // tên còn thiếu chép theo
    expect(toner.variants.map((v) => [v.label, v.priceMmk])).toEqual([["100ml", 0], ["200ml", 0]]);
    const bag = await prisma.product.findFirstOrThrow({ where: { translations: { some: { name: `အိတ် ${f.tag}` } } } });
    expect(bag).toMatchObject({ stockLocationId: f.chi.id, requiresExpiry: false });

    // Hai lô tự sinh của cùng SKU không trùng; lô VND chốt tỷ giá đã xem.
    const batches = await prisma.batch.findMany({ where: { variant: { productId: toner.id } }, orderBy: { lotNo: "asc" } });
    expect(batches).toHaveLength(3);
    const v200 = toner.variants.find((v) => v.label === "200ml")!.id;
    expect(new Set(batches.filter((b) => b.variantId === v200).map((b) => b.lotNo)).size).toBe(2);
    expect(batches.every((b) => b.rateId === rate.id && /^NK\d{6}(-\d+)?$/.test(b.lotNo))).toBe(true);
    // Chỉ có tồn sau khi ghi sổ phiếu nháp.
    expect(await prisma.stockBalance.count({ where: { batch: { variant: { productId: toner.id } } } })).toBe(0);
    for (const d of result.documents) await postDocument(d.id, f.userId);
    expect((await prisma.batch.findFirstOrThrow({ where: { variant: { productId: toner.id }, expiryStatus: "DATED", landedCostVnd: 105000 } })).landedCostMmk).toBe(21000);

    // Nhập lại đúng file có tồn → chặn, không tạo thêm phiếu.
    await expect(commitCatalogImport(preview.input, f.userId)).rejects.toThrow(/đã được nhập tồn|đã có|SKU/);
  });

  it("cập nhật theo SKU: ô trống giữ nguyên, ghi lịch sử giá; chạy lại file chỉ sửa giá thì 'không đổi'", async () => {
    const { f } = await setup();
    const sku = `IT-${f.tag}`;
    const before = await prisma.product.findUniqueOrThrow({ where: { id: f.productId }, include: { translations: true } });
    const input = sheet([{ sku, price_mmk: 12000, name_my: "", brand: "", category: "" }]);
    const preview = await previewCatalogImport(input);
    expect(preview.errors).toEqual([]);
    expect(preview.rows[0]).toMatchObject({ action: "update", oldPrice: 10000, price: 12000 });
    expect(preview.counts.priceChanges).toBe(1);
    await commitCatalogImport(preview.input, f.userId, { allowPricing: true });
    const after = await prisma.product.findUniqueOrThrow({ where: { id: f.productId }, include: { translations: true, variants: true } });
    expect(after.variants[0].priceMmk).toBe(12000);
    expect(after).toMatchObject({ brandId: before.brandId, categoryId: before.categoryId, stockLocationId: before.stockLocationId, published: before.published });
    expect(after.translations.find((t) => t.locale === "en")?.name).toBe(`IT product ${f.tag}`);
    expect(await prisma.priceHistory.findMany({ where: { variantId: f.variantId, newPriceMmk: 12000 }, select: { reason: true } })).toEqual([{ reason: expect.stringMatching(/^import:[0-9a-f]{8}$/) }]);
    expect(await prisma.auditLog.count({ where: { action: "catalog.import", userId: f.userId, data: { path: ["priceChanges"], equals: 1 } } })).toBeGreaterThan(0);

    const again = await previewCatalogImport(input);
    expect(again.counts).toMatchObject({ updatedProducts: 0, unchangedProducts: 1 });
    expect(again.rows[0].action).toBe("same");
    expect(again.counts.priceChanges).toBe(0);
    await commitCatalogImport(again.input, f.userId); // không có tồn → không bị chặn nhập lặp; không đổi giá → không cần quyền giá
    expect(await prisma.priceHistory.count({ where: { variantId: f.variantId } })).toBe(1);
  });

  it("thương hiệu khác cách viết nhưng cùng slug với thương hiệu có sẵn → dùng lại, có cảnh báo", async () => {
    const { f, cat } = await setup();
    const existing = await prisma.brand.create({ data: { name: `Kerastase ${f.tag}`, slug: `kerastase-${f.tag.toLowerCase()}` } });
    const preview = await previewCatalogImport(sheet([
      { name_en: `Comb ${f.tag}`, brand: `Kérastase ${f.tag}`, category: cat, warehouse_code: f.mm.code, has_expiry: "Không" },
      { name_en: `Serum ${f.tag}`, brand: `Kérastase ${f.tag}`, category: cat, warehouse_code: f.mm.code },
    ]));
    expect(preview.errors).toEqual([]);
    expect(preview.counts).toMatchObject({ createdProducts: 2 });
    expect(preview.warnings.filter((w) => w.includes("dùng chung với"))).toHaveLength(1);
    await commitCatalogImport(preview.input, f.userId);
    const products = await prisma.product.findMany({ where: { translations: { some: { name: { in: [`Comb ${f.tag}`, `Serum ${f.tag}`] } } } } });
    expect(products.map((p) => p.brandId)).toEqual([existing.id, existing.id]);
    expect(await prisma.brand.count({ where: { slug: `kerastase-${f.tag.toLowerCase()}` } })).toBe(1);
  });

  it("dòng không SKU cùng tên + thương hiệu với SKU có sẵn → thêm biến thể vào sản phẩm đó", async () => {
    const { f, cat } = await setup();
    const input = sheet([
      { sku: `IT-${f.tag}`, name_en: `IT product ${f.tag}`, brand: `IT ${f.tag}`, category: cat },
      { name_en: `IT product ${f.tag}`, brand: `IT ${f.tag}`, category: cat, variant_label: "100ml", price_mmk: 18000 },
    ]);
    const preview = await previewCatalogImport(input);
    expect(preview.errors).toEqual([]);
    expect(preview.counts).toMatchObject({ createdProducts: 0, updatedProducts: 1 });
    await commitCatalogImport(preview.input, f.userId);
    const variants = await prisma.variant.findMany({ where: { productId: f.productId }, orderBy: { label: "asc" } });
    expect(variants.map((v) => [v.label, v.priceMmk])).toEqual([["100ml", 0], ["50ml", 10000]]);
  });

  it("chặn: đổi kho qua Excel, combo, thiếu tên, tồn sai kho, tỷ giá đổi giữa xem trước và xác nhận", async () => {
    const { f, cat } = await setup();
    const sku = `IT-${f.tag}`;
    const errors = async (rows: Record<string, string | number>[]) => (await previewCatalogImport(sheet(rows))).errors.join("\n");
    expect(await errors([{ sku, warehouse_code: f.chi.code, brand: "", category: "" }])).toContain("đổi kho trong trang sản phẩm");
    // QT1b: SP mới không cần cột giá.
    expect(await errors([{ name_en: `X ${f.tag}`, brand: "B", category: cat }])).toBe("");
    expect(await errors([{ brand: "B", category: cat, price_mmk: 1, variant_label: "x" }])).toContain("ít nhất một tên");
    expect(await errors([{ name_en: `Y ${f.tag}`, brand: "B", category: "khong-co", price_mmk: 1 }])).toContain("Danh mục");
    expect(await errors([{ name_en: `Z ${f.tag}`, brand: "B", category: cat, price_mmk: 1, warehouse_code: f.chi.code, qty: 1, unit_cost: 100, inbound_unit_vnd: 50 }])).toContain("không có phí đưa về kho");
    expect(await errors([{ name_en: `W ${f.tag}`, brand: "B", category: cat, price_mmk: 1, has_expiry: "Không", qty: 1, unit_cost: 100, expiry_date: "2028-01-01", warehouse_code: f.mm.code }])).toContain("không quản lý hạn dùng");
    const combo = await prisma.variant.create({ data: { productId: f.productId, sku: `CB-${f.tag}`, label: "Set", priceMmk: 1, isBundle: true } });
    expect(await errors([{ sku: combo.sku, price_mmk: 5, brand: "", category: "" }])).toContain("combo");

    const input = sheet([{ name_en: `Rate ${f.tag}`, brand: "B", category: cat, price_mmk: 1000, warehouse_code: f.mm.code, qty: 1, unit_cost: 100, expiry_date: "2029-01-01" }]);
    const preview = await previewCatalogImport(input);
    expect(preview.errors).toEqual([]);
    await prisma.exchangeRate.create({ data: { mmkPerVnd: "0.25", createdById: f.userId } });
    await expect(commitCatalogImport(preview.input, f.userId)).rejects.toThrow("Tỷ giá");
    expect(await prisma.productTranslation.count({ where: { name: `Rate ${f.tag}` } })).toBe(0);
  });

  it("cột Hoa hồng CTV: đổi mức là cập nhật, ô trống giữ mức cũ, lớn hơn giá bị chặn", async () => {
    const { f } = await setup();
    const sku = `IT-${f.tag}`;
    const first = await previewCatalogImport(sheet([{ sku, affiliate_commission_mmk: 1200, brand: "", category: "" }]));
    expect(first.rows[0].action).toBe("update");
    expect(first.counts.priceChanges).toBe(1);
    await commitCatalogImport(first.input, f.userId, { allowPricing: true });
    expect((await prisma.variant.findUniqueOrThrow({ where: { id: f.variantId } })).affiliateCommissionMmk).toBe(1200);
    const keep = await previewCatalogImport(sheet([{ sku, affiliate_commission_mmk: "", price_mmk: "", brand: "", category: "" }]));
    expect(keep.rows[0].action).toBe("same");
    const tooHigh = await previewCatalogImport(sheet([{ sku, affiliate_commission_mmk: 50_000, brand: "", category: "" }]));
    expect(tooHigh.errors.join("\n")).toContain("lớn hơn giá bán");
  });

  it("P0-C2: đổi giá qua Excel cần quyền giá, giá phải > 0, giá đổi ở nơi khác sau xem trước → huỷ cả lượt", async () => {
    const { f } = await setup();
    const sku = `IT-${f.tag}`;
    const input = sheet([{ sku, price_mmk: 15000, name_my: "", brand: "", category: "" }]);

    // Không có quyền giá → chặn, không ghi gì.
    const preview = await previewCatalogImport(input);
    await expect(commitCatalogImport(preview.input, f.userId)).rejects.toThrow("quyền quản lý giá");
    expect((await prisma.variant.findUniqueOrThrow({ where: { id: f.variantId } })).priceMmk).toBe(10000);

    // Giá 0 → lỗi xem trước (để trống nếu không đổi giá).
    expect((await previewCatalogImport(sheet([{ sku, price_mmk: 0, brand: "", category: "" }]))).errors.join(" | ")).toContain("phải lớn hơn 0");

    // Giá đổi ở nơi khác giữa xem trước và xác nhận → huỷ cả lượt, liệt kê SKU.
    await prisma.variant.update({ where: { id: f.variantId }, data: { priceMmk: 11000 } });
    await expect(commitCatalogImport(preview.input, f.userId, { allowPricing: true })).rejects.toThrow(`Giá bán của ${sku} vừa thay đổi`);
    expect((await prisma.variant.findUniqueOrThrow({ where: { id: f.variantId } })).priceMmk).toBe(11000);

    // Payload cũ không có priceBase nhưng file có đổi giá → cũng bị huỷ (phải xem trước lại).
    const { priceBase: _drop, ...noBase } = (await previewCatalogImport(input)).input;
    await expect(commitCatalogImport(noBase, f.userId, { allowPricing: true })).rejects.toThrow("vừa thay đổi");

    // Xem trước lại → xác nhận được.
    const fresh = await previewCatalogImport(input);
    expect(fresh.rows[0]).toMatchObject({ oldPrice: 11000, price: 15000 });
    await commitCatalogImport(fresh.input, f.userId, { allowPricing: true });
    expect((await prisma.variant.findUniqueOrThrow({ where: { id: f.variantId } })).priceMmk).toBe(15000);
  });
});
