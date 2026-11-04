import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { Tx } from "@/server/inventory/ledger";
import { parseCsvObjects, toCsv } from "@/lib/csv";
import { vndToMmk } from "@/server/inventory/landed-cost";
import { productSchema, importProductsCsv, importOpeningStockCsv, STOCK_CSV_COLUMNS } from "./products";

export const openingInputSchema = z.object({
  products: z.string().min(1).max(2_000_000),
  stock: z.string().min(1).max(2_000_000),
  locationCode: z.string().trim().min(1).max(40),
  rateId: z.string().max(40).optional(),
  productLines: z.array(z.number().int().positive().max(10000)).max(1000).optional(),
  stockLines: z.array(z.number().int().positive().max(10000)).max(1000).optional(),
});
export type OpeningInput = z.infer<typeof openingInputSchema>;
export type OpeningPreview = {
  input: OpeningInput;
  errors: string[];
  rows: { sku: string; name: string; lotNo: string; stockType: "SELLABLE" | "TESTER"; expiryDate: string | null; qty: number; location: string; expiryStatus: string; price: number; cost: number | null; fee: number; profit: number | null }[];
  products: number;
  rate: string | null;
};
const money = z.coerce.number().int().min(0).max(2_147_483_647);
const positive = z.coerce.number().int().positive().max(2_147_483_647);
const errorText = (e: unknown) => e instanceof z.ZodError ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : (e as Error).message;

/** Preview is read-only. Commit always runs the same checks again against current data. */
export async function previewOpening(raw: unknown, db: Tx = prisma): Promise<OpeningPreview> {
  const input = openingInputSchema.parse(raw);
  const products = parseCsvObjects(input.products);
  const stock = parseCsvObjects(input.stock);
  if (!products.length || !stock.length || products.length + stock.length > 1000) throw new Error("Điền cả hai sheet; tối đa tổng cộng 1.000 dòng mỗi lần nhập.");
  const [categories, existing, existingProducts, locations, rate] = await Promise.all([
    db.category.findMany({ select: { id: true, slug: true } }),
    db.variant.findMany({ where: { sku: { in: products.map((r) => r.sku) } }, select: { sku: true } }),
    db.product.findMany({ where: { slug: { in: products.map((r) => r.product_slug) } }, select: { slug: true } }),
    db.location.findMany({ select: { code: true } }),
    db.exchangeRate.findFirst({ where: { effectiveAt: { lte: new Date() } }, orderBy: [{ effectiveAt: "desc" }, { id: "desc" }] }),
  ]);
  const errors: string[] = [];
  const bySku = new Map<string, Record<string, string>>();
  const byProduct = new Map<string, Record<string, string>>();
  for (const [i, r] of products.entries()) {
    try {
      const category = categories.find((c) => c.slug === r.category);
      if (!category) throw new Error(`Danh mục ${r.category || "(trống)"} chưa được tạo`);
      const policy = z.enum(["DATED", "NONE"]).parse(r.expiry_policy || "DATED");
      z.string().trim().min(1).max(80).parse(r.brand);
      productSchema.parse({ slug: r.product_slug, brandId: "preview", categoryId: category.id, requiresExpiry: policy === "DATED", paoMonths: r.pao_months, my: { name: r.name_my, description: r.description_my, usage: r.usage_my }, en: { name: r.name_en, description: r.description_en, usage: r.usage_en }, ingredientsText: r.ingredients, storageNote: r.storage_note, variants: [{ sku: r.sku, label: r.variant_label, priceMmk: r.price_mmk, weightGrams: r.weight_g || null }] });
      money.parse(r.price_mmk);
      if (!r.price_mmk.trim()) throw new Error("Chưa điền giá bán");
      if (bySku.has(r.sku)) throw new Error(`SKU ${r.sku} bị trùng trong file`);
      if (existing.some((v) => v.sku === r.sku) || existingProducts.some((p) => p.slug === r.product_slug)) throw new Error("SKU hoặc mã sản phẩm đã có. Luồng lần đầu chỉ tạo hàng mới; dùng mục nhập riêng để cập nhật.");
      const first = byProduct.get(r.product_slug);
      const shared = ["brand", "category", "name_my", "name_en", "description_my", "description_en", "usage_my", "usage_en", "ingredients", "storage_note", "expiry_policy", "pao_months"];
      if (first && shared.some((key) => (first[key] || "") !== (r[key] || ""))) throw new Error("Thông tin chung giữa các biến thể cùng sản phẩm không thống nhất");
      byProduct.set(r.product_slug, r);
      bySku.set(r.sku, r);
    } catch (e) { errors.push(`San pham · dòng ${input.productLines?.[i] ?? i + 2} · ${r.sku}: ${errorText(e)}`); }
  }
  const normalized: Record<string, string>[] = [];
  const seen = new Set<string>();
  const rows: OpeningPreview["rows"] = [];
  for (const [i, r] of stock.entries()) {
    try {
      const product = bySku.get(r.sku);
      if (!product) throw new Error("SKU phải có trong sheet San pham và không có lỗi");
      const location = r.location_code || input.locationCode;
      if (!locations.some((l) => l.code === location)) throw new Error(`Mã kho ${location} không tồn tại`);
      z.string().trim().min(1).max(50).parse(r.lot_no);
      const status = z.enum(["DATED", "NONE", "UNKNOWN"]).parse(r.expiry_status || product.expiry_policy || "DATED");
      if (status === "NONE" && product.expiry_policy !== "NONE") throw new Error("Sản phẩm có quản lý hạn: chọn DATED hoặc UNKNOWN");
      if (status !== "NONE" && product.expiry_policy === "NONE") throw new Error("Sản phẩm không áp dụng hạn: chọn NONE");
      const date = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
      if (status === "DATED" && !date(r.expiry_date)) throw new Error("Cần ngày hết hạn hợp lệ");
      if (status !== "DATED" && r.expiry_date) throw new Error("Để trống ngày hết hạn với NONE hoặc UNKNOWN");
      if (r.mfg_date && (!date(r.mfg_date) || (r.expiry_date && r.mfg_date > r.expiry_date))) throw new Error("Ngày sản xuất không hợp lệ hoặc sau hạn sử dụng");
      const qty = positive.parse(r.qty);
      const purchase = money.parse(r.unit_cost_vnd);
      if (!r.unit_cost_vnd.trim()) throw new Error("Chưa điền giá mua");
      const inbound = money.parse(r.inbound_unit_vnd || 0);
      const landed = money.parse(purchase + inbound);
      const fee = money.parse(r.selling_fee_mmk || 0);
      const type = z.enum(["SELLABLE", "TESTER"]).parse(r.stock_type || "SELLABLE");
      const key = JSON.stringify([r.sku, location, r.lot_no, type]);
      if (seen.has(key)) throw new Error("Trùng SKU, kho, lô và loại hàng; gộp số lượng thành một dòng");
      seen.add(key);
      const previous = normalized.find((s) => s.sku === r.sku && s.lot_no === r.lot_no);
      if (previous && ["expiry_date", "mfg_date", "unit_cost_vnd"].some((k) => (previous[k] || "") !== (r[k] || ""))) throw new Error("Cùng SKU và lô phải có cùng hạn, ngày sản xuất và giá mua");
      if (previous && (previous.expiry_status !== status || previous.inbound_unit_vnd !== String(inbound))) throw new Error("Cùng SKU và lô phải có cùng trạng thái hạn và chi phí đưa về kho");
      normalized.push({ ...r, location_code: location, expiry_status: status, inbound_unit_vnd: String(inbound), stock_type: type });
      const cost = rate ? money.parse(vndToMmk(landed, rate)) : null;
      rows.push({ sku: r.sku, name: product.name_en, lotNo: r.lot_no, stockType: type, expiryDate: r.expiry_date || null, qty, location, expiryStatus: status, price: Number(product.price_mmk), cost, fee, profit: cost == null ? null : Number(product.price_mmk) - cost - fee });
    } catch (e) { errors.push(`Ton dau ky · dòng ${input.stockLines?.[i] ?? i + 2} · ${r.sku}: ${errorText(e)}`); }
  }
  if (!rate) errors.push("Cần thiết lập tỷ giá đang có hiệu lực trước khi nhập tồn để tính giá vốn MMK.");
  const normalizedStock = toCsv([[...STOCK_CSV_COLUMNS], ...normalized.map((r) => STOCK_CSV_COLUMNS.map((k) => r[k] ?? ""))]);
  return { input: { ...input, stock: errors.length ? input.stock : normalizedStock, rateId: rate?.id }, errors, rows, products: byProduct.size, rate: rate?.mmkPerVnd.toString() ?? null };
}

export async function commitOpening(raw: unknown, userId: string) {
  const input = openingInputSchema.parse(raw);
  const key = createHash("sha256").update(JSON.stringify([input.products, input.stock, input.locationCode])).digest("hex");
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(662211)`;
    const receipt = await tx.catalogOpeningImport.findUnique({ where: { id: key } });
    if (receipt) throw new Error("File này đã được nhập. Mở danh sách phiếu kho để kiểm tra; không nhập lại tồn.");
    const preview = await previewOpening(input, tx);
    if (preview.errors.length) throw new Error(preview.errors.join("\n"));
    if (preview.input.rateId !== input.rateId) throw new Error("Tỷ giá vừa thay đổi. Tải file lên xem trước lại trước khi xác nhận.");
    const products = await importProductsCsv(input.products, userId, input.productLines, tx);
    if (products.errors.length) throw new Error(products.errors.join("\n"));
    const stock = await importOpeningStockCsv(preview.input.stock, userId, input.stockLines, tx);
    if (stock.errors.length) throw new Error(stock.errors.join("\n"));
    // Pin the rate reviewed by the operator; posting cannot silently substitute a later rate.
    const documents = stock.documents ?? [];
    const lines = await tx.stockDocumentLine.findMany({ where: { documentId: { in: documents.map((d) => d.id) } }, select: { batchId: true } });
    await tx.batch.updateMany({ where: { id: { in: lines.flatMap((l) => l.batchId ? [l.batchId] : []) } }, data: { rateId: input.rateId } });
    const result = { ok: products.ok, errors: [], documents };
    await tx.catalogOpeningImport.create({ data: { id: key, userId, result } });
    await tx.setting.upsert({ where: { key: "catalog.defaultLocationCode" }, create: { key: "catalog.defaultLocationCode", value: input.locationCode }, update: { value: input.locationCode } });
    return result;
  }, { maxWait: 10_000, timeout: 60_000 });
}
