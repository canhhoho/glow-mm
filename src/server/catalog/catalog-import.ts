import "server-only";
import { submitTouched } from "./review";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseCsvObjects } from "@/lib/csv";
import { toUnicode } from "@/lib/myanmar";
import { normalizeNumberText, parseYesNo } from "@/lib/catalog-sheet";
import { resolveProductIdentifiers, suggestProductSlug, suggestVariantSku } from "@/lib/product-identifiers";
import type { Tx } from "@/server/inventory/ledger";
import { createDocument, salesBlockDays } from "@/server/inventory/documents";
import { vndToMmk } from "@/server/inventory/landed-cost";
import { latestRate } from "@/server/pricing/latest-rate";
import { defaultStockLocationId } from "@/server/inventory/warehouses";
import { productName } from "@/server/inventory/queries";
import { PRODUCT_EDIT_INCLUDE, toProductEditData, type ProductEditData } from "./admin-queries";
import { saveProduct } from "./products";
import { IMPORT_PRICE_PREFIX } from "./product-pricing";
import { brandSlug } from "./brands";
import { MAX_SHEET_ROWS } from "./catalog-sheet-read";
import adminVi from "../../../messages/admin.vi.json";
import adminEn from "../../../messages/admin.en.json";
import adminMy from "../../../messages/admin.my.json";

/**
 * Nhập/cập nhật sản phẩm từ một sheet (mỗi dòng một SKU, tồn tuỳ chọn).
 * - SKU đã có → cập nhật SP đó; ô trống = giữ giá trị cũ. Không đổi kho bán / combo qua Excel.
 * - Không có SKU → tạo SP mới (ẩn); các dòng cùng tên + thương hiệu là các biến thể của một SP.
 * - Có số lượng → phiếu NHẬP NHÁP theo kho bán của SP (ghi sổ sau khi kiểm tra), chốt tỷ giá đã xem.
 * Xem trước chỉ đọc; xác nhận chạy lại toàn bộ kiểm tra trên dữ liệu hiện tại trong một transaction.
 */

export const catalogImportInputSchema = z.object({
  csv: z.string().min(1).max(4_000_000),
  lines: z.array(z.number().int().positive()).max(MAX_SHEET_ROWS).optional(),
  rateId: z.string().max(40).optional(),
  standardLabel: z.string().trim().min(1).max(60).default("Tiêu chuẩn"),
  /**
   * P0-C2: giá bán + hoa hồng CTV đang có (lúc xem trước) của các SKU sẽ bị đổi giá — `"<giá>|<hoa hồng>"`.
   * Xác nhận so lại với dữ liệu hiện tại; khác → huỷ cả lượt (không ghi đè giá vừa đổi ở nơi khác).
   */
  priceBase: z.record(z.string().max(40), z.string().max(40)).optional(),
});
export type CatalogImportInput = z.infer<typeof catalogImportInputSchema>;

export type ImportRowView = {
  line: number;
  action: "create" | "update" | "same";
  name: string;
  sku: string;
  label: string;
  price: number | null;
  oldPrice: number | null;
  stock: { qty: number; lotNo: string; location: string; expiryDate: string | null; expiryStatus: "DATED" | "NONE" | "UNKNOWN"; costMmk: number | null } | null;
};

type StockPlan = {
  sku: string;
  locationId: string;
  vnd: boolean;
  line: { lotNo: string; expiryDate?: string; expiryStatus: "DATED" | "NONE" | "UNKNOWN"; mfgDate?: string; unitCostVnd?: number; unitCostMmk?: number; landedCostVnd?: number; qty: number; stockType: "SELLABLE" | "TESTER" };
};

export type CatalogImportPreview = {
  input: CatalogImportInput;
  errors: string[];
  warnings: string[];
  rows: ImportRowView[];
  /** `priceChanges`: số SKU có sẵn bị đổi giá bán / hoa hồng CTV (cần quyền `pricing:manage`). */
  counts: { createdProducts: number; updatedProducts: number; unchangedProducts: number; stockLines: number; priceChanges: number };
  rate: string | null;
};

type Plan = { preview: CatalogImportPreview; saves: Record<string, unknown>[]; stock: StockPlan[] };

const money = z.coerce.number({ message: "phải là số" }).int("phải là số nguyên").min(0, "không được âm").max(2_147_483_647, "số quá lớn");
const positive = z.coerce.number({ message: "phải là số" }).int("phải là số nguyên").positive("phải lớn hơn 0").max(2_147_483_647, "số quá lớn");
/** Ô số: bỏ phân cách nghìn rồi kiểm (file CSV / gọi trực tiếp không qua bộ đọc Excel). `what` = tên cột trong câu báo lỗi. */
const num = (schema: typeof money, text: string, what: string) => {
  const r = schema.safeParse(normalizeNumberText(text));
  if (!r.success) throw new Error(`${what} "${text}" ${r.error.issues[0]?.message ?? "không hợp lệ"}`);
  return r.data;
};
/** Nhãn "một loại tiêu chuẩn" ở mọi ngôn ngữ admin — dòng không ghi biến thể khớp đúng biến thể chuẩn dù người nhập dùng ngôn ngữ nào. */
const STANDARD_LABELS = [adminVi, adminEn, adminMy].map((m) => m.Products.standardVariant);
const skuSchema = z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9._-]+$/, "SKU chỉ gồm chữ, số, . _ -");
const fold = (s: string) => toUnicode(s).normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
/** Ô chữ: Zawgyi → Unicode, NFC, gộp khoảng trắng trong dòng (giữ xuống dòng của mô tả). */
const clean = (s: string) => toUnicode(s).normalize("NFC").replace(/[ \t\u00a0]+/g, " ").replace(/ *\n */g, "\n").trim();
const errorText = (e: unknown) => (e instanceof z.ZodError ? e.issues.map((i) => i.message).join("; ") : (e as Error).message);
const isoDay = (d: Date) => d.toISOString().slice(2, 10).replaceAll("-", "");

type Row = Record<string, string> & { __line: string };
type Group = {
  key: string;
  existing: ProductEditData | null;
  rows: Row[];
  /** Mỗi biến thể: các dòng (nhiều dòng = nhiều lô). */
  variants: Map<string, Row[]>;
};

/**
 * Giá trị chung của nhiều dòng: lấy ô có dữ liệu (đã chuẩn hoá Zawgyi/khoảng trắng); hai ô khác nhau → lỗi.
 * Chỉ khác hoa/thường, khoảng trắng hoặc kiểu gõ Zawgyi/Unicode coi là một (lấy giá trị của dòng đầu).
 */
function shared(rows: Row[], key: string, what: string): string {
  const values = new Map<string, string>();
  for (const r of rows) {
    const v = clean(r[key] ?? "");
    if (v && !values.has(fold(v))) values.set(fold(v), v);
  }
  if (values.size > 1) throw new Error(`${what} khác nhau giữa các dòng (dòng ${rows.map((r) => r.__line).join(", ")})`);
  return [...values.values()][0] ?? "";
}

async function buildPlan(raw: unknown, db: Tx): Promise<Plan> {
  const input = catalogImportInputSchema.parse(raw);
  const records = parseCsvObjects(input.csv);
  if (records.length === 0) throw new Error("File chưa có dữ liệu.");
  if (records.length > MAX_SHEET_ROWS) throw new Error(`Tối đa ${MAX_SHEET_ROWS} dòng mỗi lần nhập.`);
  const rows: Row[] = records.map((r, i) => ({ ...r, __line: String(input.lines?.[i] ?? i + 2) }));
  const errors: string[] = [];
  const warnings: string[] = [];
  const fail = (rowsOrLine: Row[] | string, e: unknown) => {
    const lines = typeof rowsOrLine === "string" ? rowsOrLine : [...new Set(rowsOrLine.map((r) => r.__line))].join(", ");
    errors.push(`Dòng ${lines}: ${errorText(e)}`);
  };

  // ── Dữ liệu tham chiếu ──
  const skus = [...new Set(rows.map((r) => r.sku?.trim()).filter(Boolean))];
  const slugs = [...new Set(rows.map((r) => r.product_slug?.trim()).filter(Boolean))];
  const [categories, brands, locations, rate, owners] = await Promise.all([
    db.category.findMany({ select: { id: true, slug: true, translations: { select: { locale: true, name: true } } } }),
    db.brand.findMany({ select: { id: true, name: true, slug: true } }),
    db.location.findMany({ where: { active: true }, select: { id: true, code: true, sellable: true, pricingMode: true } }),
    latestRate(db),
    db.product.findMany({
      where: { OR: [{ variants: { some: { sku: { in: skus } } } }, { slug: { in: slugs } }] },
      include: { ...PRODUCT_EDIT_INCLUDE, brand: { select: { name: true } } },
    }),
  ]);
  const defaultLocationId = await defaultStockLocationId(db).catch(() => null);
  const products = new Map(owners.map((p) => [p.id, { data: toProductEditData(p), archived: !!p.archivedAt, brandName: p.brand.name }]));
  const variantOwner = new Map(owners.flatMap((p) => p.variants.map((v) => [v.sku, { productId: p.id, isBundle: v.isBundle }] as const)));
  const productBySlug = new Map(owners.map((p) => [p.slug, p.id]));
  const locationById = new Map(locations.map((l) => [l.id, l]));
  const locationByCode = new Map(locations.map((l) => [l.code, l]));

  const categoryOf = (value: string) => {
    const v = fold(value);
    const hits = categories.filter((c) => fold(c.slug) === v || c.translations.some((t) => fold(t.name) === v) || fold(productName(c.translations, c.slug)) === v);
    if (hits.length === 0) throw new Error(`Danh mục "${value}" chưa có — tạo ở trang Danh mục trước`);
    if (hits.length > 1) throw new Error(`Có nhiều danh mục tên "${value}" — điền mã danh mục`);
    return hits[0].id;
  };
  // Theo tên, rồi theo slug: "Estée Lauder" dùng lại "Estee Lauder" đã có (slug thương hiệu là unique).
  const brandOf = (value: string) => {
    const byName = brands.find((b) => fold(b.name) === fold(value));
    if (byName) return byName;
    const slug = brandSlug(value);
    return slug ? brands.find((b) => b.slug === slug) : undefined;
  };
  const brandAliasWarned = new Set<string>();

  // ── Gom dòng thành sản phẩm ──
  const groups = new Map<string, Group>();
  const nameKey = (r: Row) => `${fold(r.name_my ?? "")}|${fold(r.name_en ?? "")}|${fold(r.brand ?? "")}`;
  // Tên (Myanmar hoặc tiếng Anh) + thương hiệu → nhóm SP có sẵn trong file: dòng không SKU khớp một trong hai tên là biến thể của SP đó.
  const joinByName = new Map<string, string>();
  const nameKeys = (my: string, en: string, brand: string) => [my && `my:${fold(my)}|${fold(brand)}`, en && `en:${fold(en)}|${fold(brand)}`].filter(Boolean) as string[];
  const pending: Row[] = [];
  for (const r of rows) {
    try {
      const sku = r.sku?.trim() ?? "";
      if (sku) skuSchema.parse(sku);
      const owner = sku ? variantOwner.get(sku) : undefined;
      const slugOwner = !owner && r.product_slug ? productBySlug.get(r.product_slug.trim()) : undefined;
      const productId = owner?.productId ?? slugOwner;
      if (owner?.isBundle) throw new Error(`SKU ${sku} là combo — sửa combo trong trang sản phẩm`);
      if (productId) {
        const p = products.get(productId)!;
        if (p.archived) throw new Error(`Sản phẩm của SKU ${sku || r.product_slug} đã ngừng kinh doanh — khôi phục trước khi cập nhật`);
        const key = `p:${productId}`;
        if (!groups.has(key)) groups.set(key, { key, existing: p.data, rows: [], variants: new Map() });
        groups.get(key)!.rows.push(r);
        for (const k of nameKeys(r.name_my || p.data.my.name, r.name_en || p.data.en.name, r.brand || p.brandName)) joinByName.set(k, key);
      } else pending.push(r);
    } catch (e) {
      fail(r.__line, e);
    }
  }
  for (const r of pending) {
    const byName = nameKeys(r.name_my ?? "", r.name_en ?? "", r.brand ?? "").map((k) => joinByName.get(k)).find(Boolean);
    const key = byName ?? (r.product_slug ? `s:${r.product_slug.trim()}` : `n:${nameKey(r)}`);
    if (!groups.has(key)) groups.set(key, { key, existing: null, rows: [], variants: new Map() });
    groups.get(key)!.rows.push(r);
  }

  // ── Mã tự sinh: không trùng DB và không trùng trong file ──
  const allocated = { slug: new Set<string>(), sku: new Set<string>(skus) };
  const exists = async (kind: "slug" | "sku", value: string) => {
    if (allocated[kind].has(value)) return true;
    return kind === "slug"
      ? !!(await db.product.findUnique({ where: { slug: value }, select: { id: true } }))
      : !!(await db.variant.findUnique({ where: { sku: value }, select: { id: true } }));
  };
  // Số lô tự sinh: NK<yymmdd>[-n], không trùng lô đã có của SKU.
  const lotBase = `NK${isoDay(new Date())}`;
  const usedLots = new Map<string, Set<string>>();
  for (const b of await db.batch.findMany({ where: { variant: { sku: { in: skus } }, lotNo: { startsWith: lotBase } }, select: { lotNo: true, variant: { select: { sku: true } } } })) {
    usedLots.set(b.variant.sku, (usedLots.get(b.variant.sku) ?? new Set()).add(b.lotNo));
  }
  const autoLot = (sku: string) => {
    const used = usedLots.get(sku) ?? new Set<string>();
    let lot = lotBase;
    for (let n = 2; used.has(lot); n++) lot = `${lotBase}-${n}`;
    usedLots.set(sku, used.add(lot));
    return lot;
  };

  // Lô đã có của các SKU trong file (kiểm xung đột lô ngay ở bước xem trước) + ngưỡng chặn bán theo hạn dùng.
  const existingLots = new Map(
    (await db.batch.findMany({
      where: { variant: { sku: { in: skus } } },
      select: { lotNo: true, expiryDate: true, expiryStatus: true, unitCostVnd: true, shipmentId: true, variant: { select: { sku: true } } },
    })).map((b) => [`${b.variant.sku}\u0000${b.lotNo}`, b]),
  );
  const blockDays = await salesBlockDays();
  const today = new Date().toISOString().slice(0, 10);
  const blockFrom = new Date(Date.now() + blockDays * 86_400_000).toISOString().slice(0, 10);

  const views: ImportRowView[] = [];
  const saves: Record<string, unknown>[] = [];
  const stock: StockPlan[] = [];
  const counts = { createdProducts: 0, updatedProducts: 0, unchangedProducts: 0, stockLines: 0, priceChanges: 0 };
  const priceBase: Record<string, string> = {};
  let needsRate = false;
  const newSkuOwner = new Map<string, string>(); // SKU mới (chưa có trong hệ thống) → nhóm SP

  for (const g of groups.values()) {
    try {
      const base = g.existing;
      const rowsOf = g.rows;
      // Thông tin chung của SP.
      const nameMy = shared(rowsOf, "name_my", "Tên Myanmar");
      const nameEn = shared(rowsOf, "name_en", "Tên tiếng Anh");
      const brandText = shared(rowsOf, "brand", "Thương hiệu");
      const categoryText = shared(rowsOf, "category", "Danh mục");
      const descMy = shared(rowsOf, "description_my", "Mô tả Myanmar");
      const descEn = shared(rowsOf, "description_en", "Mô tả tiếng Anh");
      const expiryText = shared(rowsOf, "has_expiry", "Có hạn dùng");
      const warehouseText = shared(rowsOf, "warehouse_code", "Kho bán").toUpperCase();
      const legacy = Object.fromEntries(
        ([["usage_my", "Cách dùng Myanmar"], ["usage_en", "Cách dùng tiếng Anh"], ["ingredients", "Thành phần"], ["storage_note", "Bảo quản"], ["pao_months", "Hạn sau mở nắp"]] as const).map(([k, what]) => [k, shared(rowsOf, k, what)]),
      );
      const pao = legacy.pao_months ? num(positive, legacy.pao_months, "Hạn sau mở nắp") : null;
      if (pao != null && pao > 120) throw new Error(`Hạn sau mở nắp ${pao} tháng — tối đa 120`);
      const hasExpiry = parseYesNo(expiryText);
      if (hasExpiry === null) throw new Error(`Có hạn dùng: điền "Có" hoặc "Không" (đang là "${expiryText}")`);

      if (!base) {
        if (!nameMy && !nameEn) throw new Error("Cần ít nhất một tên (Myanmar hoặc tiếng Anh)");
        if (!brandText) throw new Error("Chưa điền thương hiệu");
        if (!categoryText) throw new Error("Chưa điền danh mục");
      }
      const brand = brandText ? brandOf(brandText) : undefined;
      if (brand && fold(brand.name) !== fold(brandText) && !brandAliasWarned.has(fold(brandText))) {
        brandAliasWarned.add(fold(brandText));
        warnings.push(`Dòng ${rowsOf.map((r) => r.__line).join(", ")}: thương hiệu "${brandText}" dùng chung với "${brand.name}" đã có.`);
      }
      const categoryId = categoryText ? categoryOf(categoryText) : base!.categoryId;

      // Kho bán.
      let locationId: string;
      if (base) {
        locationId = base.stockLocationId;
        const current = locationById.get(locationId)?.code;
        if (warehouseText && warehouseText !== current) throw new Error(`Sản phẩm đang thuộc kho ${current ?? "khác"} — đổi kho trong trang sản phẩm, không đổi qua Excel`);
      } else {
        const legacyStock = rowsOf.map((r) => (r.location_code ?? "").trim().toUpperCase()).find((c) => locationByCode.get(c)?.sellable);
        const code = warehouseText || legacyStock;
        if (code) {
          const loc = locationByCode.get(code);
          if (!loc?.sellable) throw new Error(`Không có kho bán "${code}"`);
          locationId = loc.id;
        } else if (defaultLocationId) locationId = defaultLocationId;
        else throw new Error("Chưa có kho bán nào — tạo kho ở Cài đặt → Kho hàng");
      }
      const location = locationById.get(locationId);
      const requiresExpiry = hasExpiry ?? base?.requiresExpiry ?? true;

      // Tên chỉ có chữ Myanmar → mã SP lấy theo thương hiệu (vd "nivea", "nivea-2") thay vì "product".
      const slugFallback = brandSlug(brand?.name ?? brandText) || "product";

      // Biến thể: SKU đã có / SKU mới / theo tên biến thể (nhiều dòng cùng biến thể = nhiều lô).
      for (const r of rowsOf) {
        const label = clean(r.variant_label ?? "");
        const vKey = r.sku?.trim() ? `sku:${r.sku.trim()}` : `label:${fold(label || input.standardLabel)}`;
        g.variants.set(vKey, [...(g.variants.get(vKey) ?? []), r]);
      }
      const baseVariants = base?.variants ?? [];
      let nextIndex = baseVariants.length;
      const variants: (ProductEditData["variants"][number] & { autoSku?: boolean; rows: Row[]; isNew: boolean; changed: boolean; oldPrice: number | null })[] = [];
      for (const [vKey, vRows] of g.variants) {
        const sku = vKey.startsWith("sku:") ? vKey.slice(4) : "";
        // Dòng không SKU của SP có sẵn: khớp biến thể cùng tên (nếu đúng một) thay vì tạo biến thể trùng tên.
        const standard = vKey === `label:${fold(input.standardLabel)}`;
        const isStandard = (l: string) => STANDARD_LABELS.some((s) => fold(s) === fold(l));
        const byLabel = !sku ? baseVariants.filter((v) => !v.isBundle && (`label:${fold(v.label)}` === vKey || (standard && isStandard(v.label)))) : [];
        const current = sku ? baseVariants.find((v) => v.sku === sku) : byLabel.length === 1 ? byLabel[0] : undefined;
        if (sku && !current) {
          const other = newSkuOwner.get(sku);
          if (other && other !== g.key) throw new Error(`SKU ${sku} xuất hiện ở hai sản phẩm khác nhau trong file`);
          newSkuOwner.set(sku, g.key);
        }
        if (current?.isBundle) throw new Error(`SKU ${sku} là combo — sửa combo trong trang sản phẩm`);
        const label = shared(vRows, "variant_label", "Biến thể");
        const priceText = shared(vRows, "price_mmk", "Giá bán");
        const weightText = shared(vRows, "weight_g", "Khối lượng");
        // QT1b: SKU mới vào giá 0 (đặt giá ở bước 3); cột giá chỉ cập nhật SKU đã có (ghi lịch sử giá "import").
        if (!current && priceText) warnings.push(`Dòng ${vRows.map((r) => r.__line).join(", ")}: bỏ qua giá bán của SKU mới — đặt giá ở bước 3 (Giá bán) trên trang sản phẩm.`);
        const price = current ? (priceText ? num(money, priceText, "Giá bán") : current.priceMmk) : 0;
        // P0-C2: giá bán qua Excel phải > 0 (để trống nếu không đổi giá).
        if (current && priceText && price < 1) throw new Error(`Giá bán của SKU ${current.sku} phải lớn hơn 0 (để trống nếu không đổi giá)`);
        const weight = weightText ? num(money, weightText, "Khối lượng") : current?.weightGrams ?? null;
        // Hoa hồng CTV cố định MMK/cái: trống = SP mới theo % CTV, SP có sẵn giữ mức cũ.
        const commissionText = shared(vRows, "affiliate_commission_mmk", "Hoa hồng CTV");
        const commission = commissionText ? num(money, commissionText, "Hoa hồng CTV") : current?.affiliateCommissionMmk ?? null;
        if (commission != null && price > 0 && commission > price) throw new Error(`Hoa hồng CTV${sku ? ` của SKU ${sku}` : ""} lớn hơn giá bán`);
        if (current && (current.priceMmk !== price || (current.affiliateCommissionMmk ?? null) !== commission)) {
          priceBase[current.sku] = `${current.priceMmk}|${current.affiliateCommissionMmk ?? ""}`;
        }
        const next = {
          id: current?.id ?? "",
          sku: current?.sku ?? sku,
          autoSku: !current && !sku,
          label: label || current?.label || input.standardLabel,
          priceMmk: price,
          weightGrams: weight,
          affiliateCommissionMmk: commission,
          lowStockAt: current?.lowStockAt ?? 5,
          leadTimeDays: current?.leadTimeDays ?? 21,
          safetyStock: current?.safetyStock ?? 0,
          active: current?.active ?? true,
          isBundle: false,
          components: [],
          rows: vRows,
          isNew: !current,
          oldPrice: current?.priceMmk ?? null,
          changed: !current || current.label !== (label || current.label) || current.priceMmk !== price || (current.weightGrams ?? null) !== weight || (current.affiliateCommissionMmk ?? null) !== commission,
        };
        if (next.autoSku) next.sku = suggestVariantSku(base?.slug ?? (g.key.startsWith("s:") ? g.key.slice(2) : suggestProductSlug(nameEn, nameMy, slugFallback)), nextIndex++);
        variants.push(next);
      }

      // Dữ liệu lưu: SP có sẵn giữ mọi trường không có trong file.
      const my = { name: nameMy || base?.my.name || "", description: descMy || base?.my.description || "", usage: legacy.usage_my || base?.my.usage || "" };
      const en = { name: nameEn || base?.en.name || "", description: descEn || base?.en.description || "", usage: legacy.usage_en || base?.en.usage || "" };
      const draft = {
        id: base?.id,
        slug: base?.slug ?? (g.key.startsWith("s:") ? g.key.slice(2) : suggestProductSlug(en.name, my.name, slugFallback)),
        autoSlug: !base && !g.key.startsWith("s:"),
        ...(brand ? { brandId: brand.id } : brandText ? { brandName: brandText } : { brandId: base!.brandId }),
        categoryId,
        stockLocationId: locationId,
        requiresExpiry,
        paoMonths: pao ?? base?.paoMonths ?? null,
        storageNote: legacy.storage_note || base?.storageNote || "",
        ingredientsText: legacy.ingredients || base?.ingredientsText || "",
        my,
        en,
        tagIds: base?.tagIds ?? [],
        variants: variants.map((v) => ({ id: v.id || undefined, sku: v.sku, autoSku: v.autoSku, label: v.label, priceMmk: v.priceMmk, weightGrams: v.weightGrams, affiliateCommissionMmk: v.affiliateCommissionMmk, lowStockAt: v.lowStockAt, leadTimeDays: v.leadTimeDays, safetyStock: v.safetyStock, active: v.active, isBundle: false, components: [] })),
      };
      const resolved = await resolveProductIdentifiers(draft, exists);
      allocated.slug.add(resolved.slug);
      resolved.variants.forEach((v, i) => {
        allocated.sku.add(v.sku);
        variants[i].sku = v.sku;
      });
      // Mã đã chốt ở bước xem trước → lưu với mã cố định (xác nhận chạy lại trong khoá nên không đổi).
      const payload = { ...resolved, autoSlug: false, variants: resolved.variants.map((v) => ({ ...v, autoSku: false })) };

      const productChanged = !base
        || (nameMy && nameMy !== base.my.name) || (nameEn && nameEn !== base.en.name)
        || (brandText && (!brand || brand.id !== base.brandId)) || categoryId !== base.categoryId
        || (descMy && descMy !== base.my.description) || (descEn && descEn !== base.en.description)
        || requiresExpiry !== base.requiresExpiry
        || (!!legacy.usage_my && legacy.usage_my !== base.my.usage) || (!!legacy.usage_en && legacy.usage_en !== base.en.usage)
        || (!!legacy.ingredients && legacy.ingredients !== base.ingredientsText) || (!!legacy.storage_note && legacy.storage_note !== base.storageNote)
        || (pao != null && pao !== base.paoMonths)
        || variants.some((v) => v.changed);
      if (!base) counts.createdProducts++;
      else if (productChanged) counts.updatedProducts++;
      else counts.unchangedProducts++;
      if (productChanged) saves.push(payload);
      if (!base && (nameMy || nameEn)) {
        const twin = await db.productTranslation.findFirst({ where: { name: { in: [my.name, en.name].filter(Boolean), mode: "insensitive" }, product: { archivedAt: null } }, select: { product: { select: { slug: true } } } });
        if (twin) warnings.push(`Dòng ${rowsOf.map((r) => r.__line).join(", ")}: đã có sản phẩm cùng tên (${twin.product.slug}). Muốn cập nhật sản phẩm đó thì điền SKU của nó.`);
      }

      // Tồn nhập theo từng dòng.
      const display = my.name || en.name;
      const seen = new Map<string, Row>();
      for (const v of variants) {
        for (const r of v.rows) {
          const view: ImportRowView = { line: Number(r.__line), action: !base || v.isNew ? "create" : v.changed || productChanged ? "update" : "same", name: display, sku: v.sku, label: v.label, price: v.isNew ? null : v.priceMmk, oldPrice: v.oldPrice, stock: null };
          views.push(view);
          const stockCells = ["qty", "expiry_date", "unit_cost", "unit_cost_vnd", "unit_cost_mmk", "inbound_unit_vnd", "lot_no"].some((k) => (r[k] ?? "").trim());
          if (!stockCells) continue;
          try {
            if (!r.qty?.trim()) throw new Error("Có thông tin tồn nhưng chưa điền Số lượng nhập");
            const qty = num(positive, r.qty, "Số lượng nhập");
            const legacyLoc = (r.location_code ?? "").trim().toUpperCase();
            const target = legacyLoc ? locationByCode.get(legacyLoc) : location;
            if (!target) throw new Error(`Mã kho ${legacyLoc} không tồn tại hoặc đã ngừng dùng`);
            if (target.sellable && target.id !== locationId) throw new Error(`Sản phẩm thuộc kho ${location?.code}; tồn bán phải nhập vào đúng kho này`);
            const mmk = location?.pricingMode === "LOCAL_MMK";
            const costText = normalizeNumberText(r.unit_cost || (mmk ? r.unit_cost_mmk : r.unit_cost_vnd) || "");
            if (!costText) throw new Error(mmk ? `Chưa điền giá mua (MMK/đv) — kho ${location?.code} mua tại Myanmar` : `Chưa điền giá mua (VND/đv) — kho ${location?.code} nhập từ Việt Nam`);
            if (mmk ? r.unit_cost_vnd : r.unit_cost_mmk) throw new Error(mmk ? `Kho ${location?.code} nhập giá mua MMK, để trống cột VND` : `Kho ${location?.code} nhập giá mua VND, để trống cột MMK`);
            const purchase = num(money, costText, "Giá mua");
            const inboundText = normalizeNumberText(r.inbound_unit_vnd ?? "");
            if (mmk && inboundText && Number(inboundText) !== 0) throw new Error("Hàng mua bằng MMK không có phí đưa về kho VND");
            const inbound = mmk || !inboundText ? 0 : num(money, inboundText, "Phí đưa về kho");
            const date = r.expiry_date?.trim() || "";
            const legacyStatus = (r.expiry_status ?? "").trim().toUpperCase();
            const status = legacyStatus ? z.enum(["DATED", "NONE", "UNKNOWN"]).parse(legacyStatus) : date ? "DATED" : requiresExpiry ? "UNKNOWN" : "NONE";
            if (!requiresExpiry && status !== "NONE") throw new Error("Sản phẩm không quản lý hạn dùng: để trống hạn sử dụng");
            if (requiresExpiry && status === "NONE") throw new Error("Sản phẩm có quản lý hạn dùng: điền hạn sử dụng hoặc để trống (chưa biết hạn)");
            if (status === "DATED" && !date) throw new Error("Cần ngày hết hạn");
            if (status !== "DATED" && date) throw new Error("Để trống hạn sử dụng với lô chưa biết hạn / không hạn");
            const mfg = r.mfg_date?.trim() || undefined;
            if (mfg && date && mfg > date) throw new Error("Ngày sản xuất sau hạn sử dụng");
            const stockType = z.enum(["SELLABLE", "TESTER"]).parse((r.stock_type || "SELLABLE").trim().toUpperCase());
            const lotNo = z.string().trim().min(1).max(50).parse(r.lot_no?.trim() || autoLot(v.sku));
            const key = `${v.sku}\u0000${lotNo}`;
            const previous = seen.get(key);
            if (previous) {
              if (`${previous.stock_type || "SELLABLE"}`.toUpperCase() === stockType) throw new Error(`Trùng SKU và số lô ${lotNo} — gộp số lượng thành một dòng`);
              if (["expiry_date", "mfg_date", "unit_cost", "unit_cost_vnd", "unit_cost_mmk", "inbound_unit_vnd"].some((k) => (previous[k] || "") !== (r[k] || ""))) throw new Error(`Cùng SKU và lô ${lotNo} phải có cùng hạn, ngày sản xuất và giá mua`);
            }
            seen.set(key, r);
            // Lô đã có của SKU: cùng quy tắc với phiếu nhập (createDocument) → báo ngay ở bước xem trước.
            const lot = existingLots.get(`${v.sku}\u0000${lotNo}`);
            if (lot) {
              if (lot.shipmentId) throw new Error(`Lô ${lotNo} của SKU ${v.sku} thuộc chuyến hàng — nhập thêm qua phiếu nhập của chuyến, không qua Excel`);
              if ((lot.unitCostVnd == null) === !mmk) throw new Error(`Lô ${lotNo} của SKU ${v.sku} đã có giá mua bằng loại tiền khác`);
              if (lot.expiryStatus !== status || (lot.expiryDate?.toISOString().slice(0, 10) ?? "") !== date) {
                throw new Error(`Lô ${lotNo} của SKU ${v.sku} đã có với hạn dùng khác (${lot.expiryDate ? lot.expiryDate.toISOString().slice(0, 10) : lot.expiryStatus}) — đổi số lô hoặc sửa hạn cho khớp`);
              }
            }
            if (status === "DATED" && date < today) warnings.push(`Dòng ${r.__line}: lô ${lotNo} đã hết hạn (${date}) → không bán được.`);
            else if (status === "DATED" && date < blockFrom) warnings.push(`Dòng ${r.__line}: lô ${lotNo} còn dưới ${blockDays} ngày hạn dùng (${date}) → bị chặn bán.`);
            const costMmk = mmk ? purchase : rate ? money.parse(vndToMmk(purchase + inbound, rate)) : null;
            if (!mmk) needsRate = true;
            if (status === "UNKNOWN") warnings.push(`Dòng ${r.__line}: lô ${lotNo} chưa có hạn sử dụng → chưa bán được đến khi cập nhật hạn.`);
            stock.push({
              sku: v.sku,
              locationId: target.id,
              vnd: !mmk,
              line: { lotNo, expiryDate: date || undefined, expiryStatus: status, mfgDate: mfg, ...(mmk ? { unitCostMmk: purchase } : { unitCostVnd: purchase, ...(inbound ? { landedCostVnd: purchase + inbound } : {}) }), qty, stockType },
            });
            view.stock = { qty, lotNo, location: target.code, expiryDate: date || null, expiryStatus: status, costMmk };
            counts.stockLines++;
          } catch (e) {
            fail(r.__line, e);
          }
        }
      }
    } catch (e) {
      fail(g.rows, e);
    }
  }
  if (needsRate && !rate) errors.push("Cần thiết lập tỷ giá đang có hiệu lực (Giá & tỷ giá) trước khi nhập tồn hàng VND.");
  views.sort((a, b) => a.line - b.line);
  return {
    preview: {
      input: { ...input, rateId: needsRate ? rate?.id : undefined, priceBase: Object.keys(priceBase).length ? priceBase : undefined },
      errors,
      warnings,
      rows: views,
      counts: { ...counts, priceChanges: Object.keys(priceBase).length },
      rate: needsRate ? rate?.mmkPerVnd.toString() ?? null : null,
    },
    saves,
    stock,
  };
}

/** Xem trước: chỉ đọc. */
export async function previewCatalogImport(raw: unknown, db: Tx = prisma): Promise<CatalogImportPreview> {
  return (await buildPlan(raw, db)).preview;
}

const LOCK = "catalog.product-identifiers";

/** SKU có giá bán / hoa hồng lúc xem trước khác lúc xác nhận (thêm, bớt hoặc khác giá trị). */
function priceBaseConflicts(seen: Record<string, string> | undefined, now: Record<string, string> | undefined): string[] {
  const a = seen ?? {};
  const b = now ?? {};
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((sku) => a[sku] !== b[sku]).sort();
}

/**
 * `allowPricing`: người xác nhận có quyền `pricing:manage` (action truyền vào). File có đổi giá bán / hoa hồng CTV
 * mà không có quyền → chặn (P0-C2). Giá đã đổi ở nơi khác sau khi xem trước → huỷ cả lượt, liệt kê SKU.
 */
/**
 * `submit` (§6.4 "Gửi duyệt ngay"): gửi duyệt luôn các SP lượt này tạo / sửa (chỉ SP đủ điều kiện), cùng transaction.
 * Mặc định tắt — form nhập bật sẵn ô này.
 */
export async function commitCatalogImport(raw: unknown, userId: string, opts: { allowPricing?: boolean; submit?: boolean } = {}) {
  const input = catalogImportInputSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    // Cùng khoá với saveProduct → mã tự sinh đã xem trước không bị lần lưu khác chiếm mất.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${LOCK}))`;
    const { preview, saves, stock } = await buildPlan(input, tx);
    if (preview.errors.length) throw new Error(preview.errors.join("\n"));
    const receiptId = createHash("sha256").update(input.csv).digest("hex");
    // P1-D (H6): mọi file đã xác nhận đều ghi dấu — nhập lại đúng file đó bị chặn (dòng không SKU sẽ tạo SP trùng).
    const previous = await tx.catalogOpeningImport.findUnique({ where: { id: receiptId }, select: { createdAt: true } });
    if (previous) {
      throw new Error(`File này đã được nhập lúc ${previous.createdAt.toISOString().slice(0, 16).replace("T", " ")} (UTC). Không nhập lại — sửa file nếu cần cập nhật tiếp.`);
    }
    if (preview.input.rateId !== input.rateId) throw new Error("Tỷ giá vừa thay đổi. Tải file lên xem trước lại trước khi xác nhận.");
    if (preview.counts.priceChanges > 0 && !opts.allowPricing) {
      throw new Error("File có đổi giá bán / hoa hồng CTV — cần quyền quản lý giá. Để trống các cột giá hoặc nhờ người có quyền nhập.");
    }
    const conflicts = priceBaseConflicts(input.priceBase, preview.input.priceBase);
    if (conflicts.length) {
      throw new Error(`Giá bán của ${conflicts.join(", ")} vừa thay đổi ở nơi khác. Tải file lên xem trước lại trước khi xác nhận.`);
    }

    const fileTag = receiptId.slice(0, 8);
    const touched: string[] = [];
    for (const payload of saves) touched.push((await saveProduct(payload, userId, tx, { priceReason: `${IMPORT_PRICE_PREFIX}${fileTag}` })).id);

    const ids = new Map((await tx.variant.findMany({ where: { sku: { in: stock.map((s) => s.sku) } }, select: { id: true, sku: true } })).map((v) => [v.sku, v.id]));
    const byLocation = new Map<string, StockPlan[]>();
    for (const s of stock) byLocation.set(s.locationId, [...(byLocation.get(s.locationId) ?? []), s]);
    const documents: { id: string; code: string }[] = [];
    for (const [toId, lines] of byLocation) {
      const doc = await createDocument({ type: "RECEIVE", toId, reason: "Nhập hàng từ Excel", lines: lines.map((s) => ({ variantId: ids.get(s.sku)!, ...s.line })) }, userId, tx);
      documents.push({ id: doc.id, code: doc.code });
    }
    if (input.rateId && documents.length) {
      // Chốt tỷ giá người dùng đã xem cho các lô VND; ghi sổ sau không tự thay tỷ giá mới hơn.
      const docIds = documents.map((d) => d.id);
      await tx.stockDocumentLine.updateMany({ where: { documentId: { in: docIds }, unitCostVnd: { not: null } }, data: { rateId: input.rateId } });
      const lines = await tx.stockDocumentLine.findMany({ where: { documentId: { in: docIds } }, select: { batchId: true, batch: { select: { unitCostVnd: true } } } });
      await tx.batch.updateMany({ where: { rateId: null, id: { in: lines.flatMap((l) => (l.batchId && l.batch?.unitCostVnd != null ? [l.batchId] : [])) } }, data: { rateId: input.rateId } });
    }
    const review = opts.submit ? await submitTouched(tx, touched, userId) : null;
    const result = { ...preview.counts, documents };
    await tx.catalogOpeningImport.create({ data: { id: receiptId, userId, result } });
    await tx.auditLog.create({
      data: {
        userId,
        action: "catalog.import",
        entity: "CatalogImport",
        entityId: receiptId,
        data: { ...result, fileTag, ...(review && { submitted: review.submitted.length, notSubmitted: review.skipped.length }) },
      },
    });
    return { ...result, review };
  }, { maxWait: 10_000, timeout: 120_000 });
}
