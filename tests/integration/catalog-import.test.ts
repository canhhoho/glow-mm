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
    expect(preview.counts).toEqual({ createdProducts: 2, updatedProducts: 0, unchangedProducts: 0, stockLines: 4 });
    expect(preview.input.rateId).toBe(rate.id);
    expect(preview.rows.map((r) => r.action)).toEqual(["create", "create", "create", "create"]);
    expect(preview.rows[0].stock).toMatchObject({ qty: 5, expiryStatus: "DATED", costMmk: 21000, location: f.mm.code, currency: "VND", unitCost: 100000, inboundVnd: 5000, lotAuto: true });
    expect(preview.rows[0]).toMatchObject({ name: `Toner ${f.tag}`, nameFromFile: true, label: "100ml", labelFromFile: true, weight: 120, skuAuto: true, issues: [] });
    expect(preview.rowCounts).toEqual({ create: 4, update: 0, same: 0, error: 0 });
    expect(preview.documents).toBe(2);
    expect(preview.rate?.vndPerMmk).toBeTruthy();
    expect(preview.rows[2].stock).toMatchObject({ expiryStatus: "UNKNOWN", expiryDate: null });
    expect(preview.warnings.join("\n")).toContain("chưa có hạn sử dụng");
    // 16/11/2026: cột Giá bán của file cũ bị bỏ qua (giá đặt ở trang Giá bán) — một lưu ý.
    expect(preview.warnings.filter((w) => w.includes("không còn nhập qua Excel"))).toHaveLength(1);
    // A4 16/11: để trống Phí đưa về kho = chưa biết → xem trước không hiện giá vốn, có cảnh báo (không coi là 0).
    expect(preview.rows[1].stock).toMatchObject({ costMmk: null, inboundVnd: null, unitCost: 180000 });
    expect(preview.rows[1].issues.map((i) => i.text).join(" | ")).toContain("để trống Phí đưa về kho");
    // Lưu ý lặp gộp một dòng tóm tắt.
    expect(preview.warnings.filter((w) => w.includes("để trống Phí đưa về kho"))).toHaveLength(1);
    expect(preview.warnings.join("\n")).toContain("để trống Phí đưa về kho");
    expect(preview.rows[3].stock).toMatchObject({ expiryStatus: "NONE", costMmk: 30000, location: f.chi.code, currency: "MMK", unitCost: 30000, inboundVnd: null });
    expect(await prisma.brand.count({ where: { name: brand } })).toBe(0); // xem trước không ghi

    const result = await commitCatalogImport(preview.input, f.userId);
    expect(result.documents).toHaveLength(2);
    const toner = await prisma.product.findFirstOrThrow({ where: { translations: { some: { name: `Toner ${f.tag}` } } }, include: { variants: { orderBy: { sku: "asc" } }, translations: true, brand: true } });
    // 16/11/2026: SP mới chưa có kho bán — kho gán khi ghi sổ phiếu nhập (bên dưới).
    expect(toner).toMatchObject({ published: false, stockLocationId: null, brand: { name: brand } });
    expect(toner.translations.map((t) => t.name)).toEqual([`Toner ${f.tag}`, `Toner ${f.tag}`]); // tên còn thiếu chép theo
    expect(toner.variants.map((v) => [v.label, v.priceMmk])).toEqual([["100ml", 0], ["200ml", 0]]);
    const bag = await prisma.product.findFirstOrThrow({ where: { translations: { some: { name: `အိတ် ${f.tag}` } } } });
    expect(bag).toMatchObject({ stockLocationId: null });

    // Hai lô tự sinh của cùng SKU không trùng; lô VND chốt tỷ giá đã xem.
    const batches = await prisma.batch.findMany({ where: { variant: { productId: toner.id } }, orderBy: { lotNo: "asc" } });
    expect(batches).toHaveLength(3);
    const v200 = toner.variants.find((v) => v.label === "200ml")!.id;
    expect(new Set(batches.filter((b) => b.variantId === v200).map((b) => b.lotNo)).size).toBe(2);
    expect(batches.every((b) => b.rateId === rate.id && /^NK\d{6}(-\d+)?$/.test(b.lotNo))).toBe(true);
    // Chỉ có tồn sau khi ghi sổ phiếu nháp.
    expect(await prisma.stockBalance.count({ where: { batch: { variant: { productId: toner.id } } } })).toBe(0);
    for (const d of result.documents) await postDocument(d.id, f.userId);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: toner.id } })).stockLocationId).toBe(f.mm.id);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: bag.id } })).stockLocationId).toBe(f.chi.id);
    expect((await prisma.batch.findFirstOrThrow({ where: { variant: { productId: toner.id }, expiryStatus: "DATED", landedCostVnd: 105000 } })).landedCostMmk).toBe(21000);

    // Nhập lại đúng file có tồn → chặn, không tạo thêm phiếu.
    await expect(commitCatalogImport(preview.input, f.userId)).rejects.toThrow(/đã được nhập lúc|đã có|SKU/);
  });

  it("cập nhật theo SKU: ô trống giữ nguyên; đổi tên bỏ tên Myanmar cũ; chạy lại thì 'không đổi'; cột giá cũ bị bỏ qua", async () => {
    const { f } = await setup();
    const sku = `IT-${f.tag}`;
    await prisma.productTranslation.upsert({
      where: { productId_locale: { productId: f.productId, locale: "my" } },
      update: { name: `IT မြန်မာ ${f.tag}` },
      create: { productId: f.productId, locale: "my", name: `IT မြန်မာ ${f.tag}`, searchText: f.tag },
    });
    const before = await prisma.product.findUniqueOrThrow({ where: { id: f.productId } });
    const input = sheet([{ sku, name: `Renamed ${f.tag}`, weight_g: 150, brand: "", category: "" }]);
    const preview = await previewCatalogImport(input);
    expect(preview.errors).toEqual([]);
    expect(preview.rows[0]).toMatchObject({ action: "update", changes: ["name", "weight"], name: `Renamed ${f.tag}`, nameFromFile: true });
    await commitCatalogImport(preview.input, f.userId);
    const after = await prisma.product.findUniqueOrThrow({ where: { id: f.productId }, include: { translations: true, variants: true } });
    expect(after).toMatchObject({ brandId: before.brandId, categoryId: before.categoryId, stockLocationId: before.stockLocationId, published: before.published });
    expect(after.variants[0]).toMatchObject({ priceMmk: 10000, weightGrams: 150 });
    // Một tên cho mọi ngôn ngữ: tên Myanmar cũ được thay bằng tên mới.
    expect(after.translations.map((t) => [t.locale, t.name]).sort()).toEqual([["en", `Renamed ${f.tag}`], ["my", `Renamed ${f.tag}`]]);

    const again = await previewCatalogImport(input);
    expect(again.counts).toMatchObject({ updatedProducts: 0, unchangedProducts: 1 });
    expect(again.rows[0].action).toBe("same");
    // P1-D (H6): nhập lại đúng file đã xác nhận → bị chặn (kể cả file không có tồn).
    await expect(commitCatalogImport(again.input, f.userId)).rejects.toThrow("đã được nhập lúc");

    // File cũ có cột Giá bán / Hoa hồng CTV: bỏ qua kèm lưu ý, không đổi giá, không ghi lịch sử giá.
    const priced = await previewCatalogImport(sheet([{ sku, price_mmk: 12000, affiliate_commission_mmk: 500, brand: "", category: "" }]));
    expect(priced.errors).toEqual([]);
    expect(priced.rows[0].action).toBe("same");
    expect(priced.warnings.join("\n")).toContain("không còn nhập qua Excel");
    await commitCatalogImport(priced.input, f.userId);
    expect(await prisma.variant.findUniqueOrThrow({ where: { id: f.variantId } })).toMatchObject({ priceMmk: 10000, affiliateCommissionMmk: null });
    expect(await prisma.priceHistory.count({ where: { variantId: f.variantId } })).toBe(0);
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
      { name_en: `IT product ${f.tag}`, brand: `IT ${f.tag}`, category: cat, variant_label: "100ml" },
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
    expect(await errors([{ sku, warehouse_code: f.chi.code, brand: "", category: "" }])).toContain("Chuyển kho");
    // QT1b: SP mới không cần cột giá.
    expect(await errors([{ name_en: `X ${f.tag}`, brand: "B", category: cat }])).toBe("");
    expect(await errors([{ brand: "B", category: cat, price_mmk: 1, variant_label: "x" }])).toContain("Chưa điền tên sản phẩm");
    expect(await errors([{ name_en: `Y ${f.tag}`, brand: "B", category: "khong-co", price_mmk: 1 }])).toContain("Danh mục");
    expect(await errors([{ name_en: `Z ${f.tag}`, brand: "B", category: cat, price_mmk: 1, warehouse_code: f.chi.code, qty: 1, unit_cost: 100, inbound_unit_vnd: 50 }])).toContain("không có phí đưa về kho");
    // Hạn dùng theo lô: cột "Có hạn dùng" cũ không còn chặn lô có ngày; ô Hạn sử dụng "Không" = lô không hạn.
    expect(await errors([{ name_en: `W ${f.tag}`, brand: "B", category: cat, price_mmk: 1, has_expiry: "Không", qty: 1, unit_cost: 100, expiry_date: "2028-01-01", warehouse_code: f.mm.code }])).toBe("");
    const none = await previewCatalogImport(sheet([{ name_en: `N ${f.tag}`, brand: "B", category: cat, qty: 1, unit_cost: 100, inbound_unit_vnd: 0, expiry_date: "Không", warehouse_code: f.mm.code }]));
    expect(none.errors).toEqual([]);
    expect(none.rows[0].stock).toMatchObject({ expiryStatus: "NONE", expiryDate: null });
    const combo = await prisma.variant.create({ data: { productId: f.productId, sku: `CB-${f.tag}`, label: "Set", priceMmk: 1, isBundle: true } });
    expect(await errors([{ sku: combo.sku, price_mmk: 5, brand: "", category: "" }])).toContain("combo");

    const input = sheet([{ name_en: `Rate ${f.tag}`, brand: "B", category: cat, price_mmk: 1000, warehouse_code: f.mm.code, qty: 1, unit_cost: 100, expiry_date: "2029-01-01" }]);
    const preview = await previewCatalogImport(input);
    expect(preview.errors).toEqual([]);
    await prisma.exchangeRate.create({ data: { mmkPerVnd: "0.25", createdById: f.userId } });
    await expect(commitCatalogImport(preview.input, f.userId)).rejects.toThrow("Tỷ giá");
    expect(await prisma.productTranslation.count({ where: { name: `Rate ${f.tag}` } })).toBe(0);
  });

  it("xem trước có đủ mọi dòng của file: dòng lỗi (cấp dòng và cấp SP) vẫn hiện, lỗi gắn vào đúng dòng", async () => {
    const { f, cat } = await setup();
    const preview = await previewCatalogImport({
      ...sheet([
        { name_en: `Ok ${f.tag}`, brand: "B", category: cat },
        { name_en: `Bad cat ${f.tag}`, brand: "B", category: "khong-co" },
        { name_en: `Two ${f.tag}`, brand: "B", category: cat, description_en: "A" },
        { name_en: `Two ${f.tag}`, brand: "B", category: cat, description_en: "B", variant_label: "50ml" },
        { sku: "co dau cach", brand: "", category: "" },
      ]),
      lines: [7, 8, 9, 10, 11],
    });
    expect(preview.rows.map((r) => [r.line, r.action])).toEqual([[7, "create"], [8, "error"], [9, "error"], [10, "error"], [11, "error"]]);
    expect(preview.rowCounts).toEqual({ create: 1, update: 0, same: 0, error: 4 });
    expect(preview.rows[1].issues[0]).toMatchObject({ level: "error", text: expect.stringContaining("Danh mục") });
    // Lỗi chung của cả SP (hai dòng khác mô tả) gắn vào cả hai dòng; bảng vẫn hiện tên như trong file.
    expect(preview.rows[2].issues[0].text).toContain("khác nhau giữa các dòng");
    expect(preview.rows[3]).toMatchObject({ name: `Two ${f.tag}`, label: "50ml", labelFromFile: true });
    expect(preview.rows[4]).toMatchObject({ sku: "co dau cach", issues: [{ level: "error", text: expect.stringContaining("SKU") }] });
    expect(preview.errors).toHaveLength(3);
  });

  it("khối lượng phải lớn hơn 0 (trống = giữ nguyên)", async () => {
    const { f } = await setup();
    const sku = `IT-${f.tag}`;
    expect((await previewCatalogImport(sheet([{ sku, weight_g: 0, brand: "", category: "" }]))).errors.join(" | ")).toContain("phải lớn hơn 0");
    expect((await previewCatalogImport(sheet([{ sku, weight_g: "", brand: "", category: "" }]))).errors).toEqual([]);
  });

  it("mẫu nhập ban đầu: nội dung khách thấy (mô tả, cách dùng, thành phần, bảo quản, PAO, khối lượng) ghi đúng; số có phân cách nghìn", async () => {
    const { f, cat } = await setup();
    const brand = `Content ${f.tag}`;
    const input = sheet([
      {
        name_my: `ခရင်မ် ${f.tag}`, name_en: `Cream ${f.tag}`, brand, category: cat, weight_g: "1.250", warehouse_code: f.mm.code,
        description_my: "ဖော်ပြချက်\nလိုင်း ၂", description_en: "Line one\nLine two", usage_my: "နေ့စဉ် သုံးပါ", usage_en: "Apply daily",
        ingredients: "Aqua, Glycerin", storage_note: "Nơi khô ráo", pao_months: 12, qty: "1,200", unit_cost: "150.000",
      },
    ]);
    const preview = await previewCatalogImport(input);
    expect(preview.errors).toEqual([]);
    expect(preview.rows[0].stock).toMatchObject({ qty: 1200 });
    await commitCatalogImport(preview.input, f.userId);
    const p = await prisma.product.findFirstOrThrow({ where: { translations: { some: { name: `Cream ${f.tag}` } } }, include: { translations: true, variants: true } });
    const tr = (l: string) => p.translations.find((t) => t.locale === l)!;
    expect(p).toMatchObject({ storageNote: "Nơi khô ráo", paoMonths: 12, published: false, approvedAt: null });
    expect(p.variants[0]).toMatchObject({ weightGrams: 1250, priceMmk: 0 });
    expect(tr("my")).toMatchObject({ name: `Cream ${f.tag}`, description: "ဖော်ပြချက်\nလိုင်း ၂", usage: "နေ့စဉ် သုံးပါ", ingredientsText: "Aqua, Glycerin" });
    expect(tr("en")).toMatchObject({ description: "Line one\nLine two", usage: "Apply daily", ingredientsText: "Aqua, Glycerin" });
    const line = await prisma.stockDocumentLine.findFirstOrThrow({ where: { variantId: p.variants[0].id } });
    expect(line).toMatchObject({ qty: 1200, unitCostVnd: 150000 });
  });

  it("cùng SP khác hoa/thường hoặc khoảng trắng không báo lỗi; tên chỉ Myanmar lấy mã theo thương hiệu; số lẻ báo lỗi rõ", async () => {
    const { f, cat } = await setup();
    const brand = `Zeta ${f.tag}`;
    const input = sheet([
      { name_en: `Serum ${f.tag}`, brand, category: cat, variant_label: "30ml", description_en: "Bright  skin" },
      { name_en: `serum ${f.tag}`, brand: brand.toUpperCase(), category: cat, variant_label: "50ml", description_en: "bright skin" },
      { name_my: "ဆီရမ်", brand, category: cat },
    ]);
    const preview = await previewCatalogImport(input);
    expect(preview.errors).toEqual([]);
    expect(preview.counts.createdProducts).toBe(2);
    const slugBase = `zeta-${f.tag.toLowerCase()}`;
    expect(preview.rows[2].sku.startsWith(slugBase.toUpperCase().slice(0, 30))).toBe(true);
    await commitCatalogImport(preview.input, f.userId);
    const mm = await prisma.product.findFirstOrThrow({ where: { brand: { name: brand }, translations: { some: { name: "ဆီရမ်" } } }, include: { variants: true } });
    expect(mm.slug.startsWith(slugBase)).toBe(true);

    const bad = await previewCatalogImport(sheet([{ name_en: `Odd ${f.tag}`, brand, category: cat, warehouse_code: f.mm.code, qty: "1.5", unit_cost: 1000 }]));
    expect(bad.errors.join("\n")).toContain('Số lượng nhập "1.5" phải là số nguyên');
  });

  it("dòng không ghi biến thể khớp biến thể chuẩn dù admin dùng ngôn ngữ khác", async () => {
    const { f, cat } = await setup();
    const brand = `Std ${f.tag}`;
    // Tạo bằng admin tiếng Anh: biến thể chuẩn tên "Standard" + biến thể "Mini".
    const created = await previewCatalogImport({ ...sheet([{ name_en: `Lotion ${f.tag}`, brand, category: cat }, { name_en: `Lotion ${f.tag}`, brand, category: cat, variant_label: "Mini" }]), standardLabel: "Standard" });
    await commitCatalogImport(created.input, f.userId);
    const p = await prisma.product.findFirstOrThrow({ where: { translations: { some: { name: `Lotion ${f.tag}` } } }, include: { variants: true } });
    const std = p.variants.find((v) => v.label === "Standard")!;
    const mini = p.variants.find((v) => v.label === "Mini")!;
    // Admin tiếng Việt ("Tiêu chuẩn") cập nhật: dòng không ghi biến thể phải khớp "Standard", không tạo biến thể mới.
    const upd = await previewCatalogImport({ ...sheet([{ sku: mini.sku, name_en: `Lotion ${f.tag}`, brand, category: cat }, { name_en: `Lotion ${f.tag}`, brand, category: cat, weight_g: 95 }]), standardLabel: "Tiêu chuẩn" });
    expect(upd.errors).toEqual([]);
    expect(upd.rows.map((r) => r.sku)).toEqual([mini.sku, std.sku]);
    expect(upd.rows[1].action).toBe("update");
  });

  it("lô đã có khác hạn dùng → báo ở bước xem trước; lô hết hạn / dưới ngưỡng bán → cảnh báo", async () => {
    const { f } = await setup();
    const sku = `IT-${f.tag}`;
    await prisma.batch.create({ data: { variantId: f.variantId, lotNo: "L-OLD", expiryDate: new Date("2029-01-01"), expiryStatus: "DATED", unitCostVnd: 100000 } });
    const clash = await previewCatalogImport(sheet([{ sku, qty: 2, unit_cost: 100000, lot_no: "L-OLD", expiry_date: "2030-01-01" }]));
    expect(clash.errors.join("\n")).toContain("Lô L-OLD của SKU");
    expect(clash.errors.join("\n")).toContain("hạn dùng khác");
    const same = await previewCatalogImport(sheet([{ sku, qty: 2, unit_cost: 120000, lot_no: "L-OLD", expiry_date: "2029-01-01" }]));
    expect(same.errors).toEqual([]);

    const soon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    const warn = await previewCatalogImport(sheet([
      { sku, qty: 1, unit_cost: 1000, lot_no: "L-EXP", expiry_date: "2020-01-01" },
      { sku, qty: 1, unit_cost: 1000, lot_no: "L-SOON", expiry_date: soon },
    ]));
    expect(warn.errors).toEqual([]);
    expect(warn.warnings.join("\n")).toContain("L-EXP đã hết hạn");
    expect(warn.warnings.join("\n")).toMatch(/L-SOON còn dưới \d+ ngày/);
  });
});
