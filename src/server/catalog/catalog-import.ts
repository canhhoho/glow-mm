import "server-only";
import { changedBefore, submitTouched } from "./review";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { FEATURES } from "@/lib/features";
import { parseCsvObjects } from "@/lib/csv";
import { toUnicode } from "@/lib/myanmar";
import { normalizeNumberText, parseYesNo, sheetHeaderKey } from "@/lib/catalog-sheet";
import { resolveProductIdentifiers, suggestProductSlug, suggestVariantSku } from "@/lib/product-identifiers";
import type { Tx } from "@/server/inventory/ledger";
import { createDocument, salesBlockDays } from "@/server/inventory/documents";
import { vndToMmk } from "@/server/inventory/landed-cost";
import { latestRate } from "@/server/pricing/latest-rate";
import { rateDisplay } from "@/server/pricing/formula";
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
});
export type CatalogImportInput = z.infer<typeof catalogImportInputSchema>;

/** `stock`: lưu ý về lô nhập kho (hạn dùng, giá vốn) — trang nhập Excel chỉ hiện thông tin SP nên ẩn; trang phiếu nháp xem lại. */
export type ImportIssue = { level: "error" | "warning"; text: string; stock?: boolean };
/** Trường bị đổi trên một dòng (khoá ổn định, UI dịch qua `CatalogImport.field.*`). */
export type ImportChange =
  | "name" | "brand" | "category" | "description" | "usage" | "ingredients" | "storage" | "pao" | "expiry"
  | "label" | "weight";

/**
 * Một dòng của file (đủ mọi dòng có dữ liệu, kể cả dòng lỗi) — xem trước hiện đúng như file:
 * `*FromFile = false` = ô trống, giá trị lấy từ dữ liệu hiện có / tự sinh.
 */
export type ImportRowView = {
  line: number;
  action: "create" | "update" | "same" | "error";
  name: string;
  nameFromFile: boolean;
  brand: string;
  category: string;
  sku: string;
  skuAuto: boolean;
  label: string;
  labelFromFile: boolean;
  weight: number | null;
  weightFromFile: boolean;
  changes: ImportChange[];
  stock: {
    qty: number;
    lotNo: string;
    lotAuto: boolean;
    location: string;
    expiryDate: string | null;
    expiryStatus: "DATED" | "NONE" | "UNKNOWN";
    /** Giá mua đúng như file: VND (kho nhập VN) hoặc MMK (kho mua tại Myanmar). */
    currency: "VND" | "MMK";
    unitCost: number;
    /** Giá vốn MMK/đv của dòng này = giá mua × tỷ giá đang dùng (lô MMK: = giá mua); null = chưa có tỷ giá. */
    costMmk: number | null;
  } | null;
  issues: ImportIssue[];
};

type StockPlan = {
  sku: string;
  locationId: string;
  vnd: boolean;
  line: { lotNo: string; expiryDate?: string; expiryStatus: "DATED" | "NONE" | "UNKNOWN"; mfgDate?: string; unitCostVnd?: number; unitCostMmk?: number; qty: number; stockType: "SELLABLE" | "TESTER" };
};

export type CatalogImportPreview = {
  input: CatalogImportInput;
  errors: string[];
  warnings: string[];
  rows: ImportRowView[];
  counts: { createdProducts: number; updatedProducts: number; unchangedProducts: number; stockLines: number };
  /** Số dòng file theo trạng thái (bảng xem trước). */
  rowCounts: { create: number; update: number; same: number; error: number };
  /** Số phiếu nhập nháp sẽ tạo (mỗi kho một phiếu). */
  documents: number;
  /** Tỷ giá chốt cho các lô VND: VND cho 1 MMK (cách ghi chung của admin). */
  rate: { vndPerMmk: string } | null;
  /** Lỗi không thuộc dòng nào (vd chưa có tỷ giá) — luôn hiện trên bảng. */
  general: string[];
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
const NO_EXPIRY = "lô chưa có hạn sử dụng → chưa bán được đến khi cập nhật hạn.";

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
  // Khoá cột chuẩn hoá như bộ đọc Excel (CSV gọi thẳng / mẫu cũ: "name_en" → "name"…).
  const rows: Row[] = records.map((r, i) => ({
    ...Object.fromEntries(Object.entries(r).map(([k, v]) => [sheetHeaderKey(k) || k, v])),
    __line: String(input.lines?.[i] ?? i + 2),
  }));
  /** Tên trong file: cột Tên sản phẩm; mẫu cũ chỉ có Tên Myanmar thì lấy tên đó. */
  const rowName = (r: Row) => r.name || r.name_my || "";
  const errors: string[] = [];
  const warnings: string[] = [];
  /** Lỗi/lưu ý gắn vào từng dòng của bảng xem trước (cùng nội dung với `errors` / `warnings`). */
  const rowIssues = new Map<number, ImportIssue[]>();
  const attach = (lines: (string | number)[], issue: ImportIssue) => {
    for (const l of new Set(lines.map(Number))) rowIssues.set(l, [...(rowIssues.get(l) ?? []), issue]);
  };
  const linesOf = (rowsOrLine: Row[] | string) => (typeof rowsOrLine === "string" ? [rowsOrLine] : [...new Set(rowsOrLine.map((r) => r.__line))]);
  const fail = (rowsOrLine: Row[] | string, e: unknown) => {
    const lines = linesOf(rowsOrLine);
    const text = errorText(e);
    errors.push(`Dòng ${lines.join(", ")}: ${text}`);
    attach(lines, { level: "error", text });
  };
  const warn = (rowsOrLine: Row[] | string, text: string, stock = false) => {
    const lines = linesOf(rowsOrLine);
    warnings.push(`Dòng ${lines.join(", ")}: ${text}`);
    attach(lines, { level: "warning", text, ...(stock && { stock }) });
  };
  /** Lưu ý lặp ở nhiều dòng (lô chưa biết hạn, chưa có phí về kho…) → một dòng tóm tắt, vẫn gắn vào từng dòng. */
  const repeated = new Map<string, number[]>();
  const warnEach = (line: string, text: string) => {
    repeated.set(text, [...(repeated.get(text) ?? []), Number(line)]);
    attach([line], { level: "warning", text, stock: true });
  };

  // Mọi dòng của file đều có trong bảng, kể cả dòng lỗi: điền sẵn theo đúng nội dung ô, bước sau bổ sung.
  const views = new Map<number, ImportRowView>(
    rows.map((r) => {
      const fileName = clean(rowName(r));
      const label = clean(r.variant_label ?? "");
      const weight = normalizeNumberText(r.weight_g ?? "");
      return [Number(r.__line), {
        line: Number(r.__line),
        action: "error",
        name: fileName,
        nameFromFile: !!fileName,
        brand: clean(r.brand ?? ""),
        category: clean(r.category ?? ""),
        sku: (r.sku ?? "").trim(),
        skuAuto: false,
        label,
        labelFromFile: !!label,
        weight: /^\d+$/.test(weight) ? Number(weight) : null,
        weightFromFile: !!weight,
        changes: [],
        stock: null,
        issues: [],
      } satisfies ImportRowView];
    }),
  );

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
  const nameKey = (r: Row) => `${fold(rowName(r))}|${fold(r.brand ?? "")}`;
  // Tên + thương hiệu → nhóm SP có sẵn trong file: dòng không SKU cùng tên (tên đang có, tiếng Anh hoặc Myanmar) là biến thể của SP đó.
  const joinByName = new Map<string, string>();
  const nameKeys = (names: string[], brand: string) => names.filter(Boolean).map((n) => `${fold(n)}|${fold(brand)}`);
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
        for (const k of nameKeys([rowName(r), p.data.en.name, p.data.my.name], r.brand || p.brandName)) joinByName.set(k, key);
      } else pending.push(r);
    } catch (e) {
      fail(r.__line, e);
    }
  }
  for (const r of pending) {
    const byName = nameKeys([rowName(r)], r.brand ?? "").map((k) => joinByName.get(k)).find(Boolean);
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

  const saves: Record<string, unknown>[] = [];
  const stock: StockPlan[] = [];
  const counts = { createdProducts: 0, updatedProducts: 0, unchangedProducts: 0, stockLines: 0 };
  let needsRate = false;
  const newSkuOwner = new Map<string, string>(); // SKU mới (chưa có trong hệ thống) → nhóm SP

  for (const g of groups.values()) {
    try {
      const base = g.existing;
      const rowsOf = g.rows;
      // Thông tin chung của SP.
      // Một tên dùng cho mọi ngôn ngữ (16/11/2026); mẫu cũ chỉ có Tên Myanmar thì lấy tên đó.
      const nameText = shared(rowsOf, "name", "Tên sản phẩm") || shared(rowsOf, "name_my", "Tên Myanmar");
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
        if (!nameText) throw new Error("Chưa điền tên sản phẩm");
        if (!brandText) throw new Error("Chưa điền thương hiệu");
        if (!categoryText) throw new Error("Chưa điền danh mục");
      }
      const brand = brandText ? brandOf(brandText) : undefined;
      if (brand && fold(brand.name) !== fold(brandText) && !brandAliasWarned.has(fold(brandText))) {
        brandAliasWarned.add(fold(brandText));
        warn(rowsOf, `thương hiệu "${brandText}" dùng chung với "${brand.name}" đã có.`);
      }
      const categoryId = categoryText ? categoryOf(categoryText) : base!.categoryId;

      // Kho: SP đã có kho bán → tồn phải vào đúng kho đó. SP chưa có kho (mới / chưa nhập hàng) → kho nhận của các dòng
      // nhập kho = cột Kho bán (trống = kho mặc định); kho bán của SP được gán khi ghi sổ phiếu nhập (16/11/2026).
      let locationId: string;
      if (base?.stockLocationId) {
        locationId = base.stockLocationId;
        const current = locationById.get(locationId)?.code;
        if (warehouseText && warehouseText !== current) throw new Error(`Sản phẩm đang thuộc kho ${current ?? "khác"} — đổi kho bằng "Chuyển kho" ở danh sách sản phẩm, không đổi qua Excel`);
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
      // Hạn dùng theo lô: ô Hạn sử dụng trống = chưa biết hạn, "Không" = không có hạn. File cũ có cột "Có hạn dùng" = Không
      // (hoặc SP cũ đánh dấu không hạn) → ô trống hiểu là không có hạn.
      const noExpiryDefault = hasExpiry === false || (hasExpiry === undefined && base?.requiresExpiry === false);

      // Tên chỉ có chữ Myanmar → mã SP lấy theo thương hiệu (vd "nivea", "nivea-2") thay vì "product".
      const slugFallback = brandSlug(brand?.name ?? brandText) || "product";
      // Đổi tên SP có sẵn → bỏ tên Myanmar cũ (lưu sẽ chép tên mới sang mọi ngôn ngữ) để khách không thấy tên cũ.
      const renamed = !!base && !!nameText && nameText !== (base.en.name || base.my.name);
      const enName = !base || renamed ? nameText : base.en.name;
      const myName = !base || renamed ? "" : base.my.name;

      // Biến thể: SKU đã có / SKU mới / theo tên biến thể (nhiều dòng cùng biến thể = nhiều lô).
      for (const r of rowsOf) {
        const label = clean(r.variant_label ?? "");
        const vKey = r.sku?.trim() ? `sku:${r.sku.trim()}` : `label:${fold(label || input.standardLabel)}`;
        g.variants.set(vKey, [...(g.variants.get(vKey) ?? []), r]);
      }
      const baseVariants = base?.variants ?? [];
      let nextIndex = baseVariants.length;
      // Giá / hoa hồng không nhập qua Excel (16/11/2026): SKU có sẵn giữ nguyên (undefined), SKU mới giá 0 (nháp).
      type ImportVariant = Omit<ProductEditData["variants"][number], "priceMmk" | "affiliateCommissionMmk"> & {
        priceMmk: number | undefined;
        affiliateCommissionMmk: number | null | undefined;
        autoSku?: boolean;
        rows: Row[];
        isNew: boolean;
        changed: boolean;
        /** Trường cấp biến thể bị đổi (SKU có sẵn). */
        changes: ImportChange[];
      };
      const variants: ImportVariant[] = [];
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
        const label = shared(vRows, "variant_label", "Phân loại");
        const weightText = shared(vRows, "weight_g", "Khối lượng");
        const weight = weightText ? num(positive, weightText, "Khối lượng") : current?.weightGrams ?? null;
        const labelChanged = !!current && current.label !== (label || current.label);
        const weightChanged = !!current && (current.weightGrams ?? null) !== weight;
        const variantChanges: ImportChange[] = current
          ? [
              ...(labelChanged ? (["label"] as const) : []),
              ...(weightChanged ? (["weight"] as const) : []),
            ]
          : [];
        const next = {
          id: current?.id ?? "",
          sku: current?.sku ?? sku,
          autoSku: !current && !sku,
          label: label || current?.label || input.standardLabel,
          priceMmk: current ? undefined : 0,
          weightGrams: weight,
          affiliateCommissionMmk: current ? undefined : null,
          lowStockAt: current?.lowStockAt ?? 5,
          leadTimeDays: current?.leadTimeDays ?? 21,
          safetyStock: current?.safetyStock ?? 0,
          active: current?.active ?? true,
          isBundle: false,
          components: [],
          rows: vRows,
          isNew: !current,
          changes: variantChanges,
          changed: !current || variantChanges.length > 0,
        };
        if (next.autoSku) next.sku = suggestVariantSku(base?.slug ?? (g.key.startsWith("s:") ? g.key.slice(2) : suggestProductSlug(enName, myName, slugFallback)), nextIndex++);
        variants.push(next);
      }

      // Dữ liệu lưu: SP có sẵn giữ mọi trường không có trong file.
      const my = { name: myName, description: descMy || base?.my.description || "", usage: legacy.usage_my || base?.my.usage || "" };
      const en = { name: enName, description: descEn || base?.en.description || "", usage: legacy.usage_en || base?.en.usage || "" };
      const draft = {
        id: base?.id,
        slug: base?.slug ?? (g.key.startsWith("s:") ? g.key.slice(2) : suggestProductSlug(en.name, my.name, slugFallback)),
        autoSlug: !base && !g.key.startsWith("s:"),
        ...(brand ? { brandId: brand.id } : brandText ? { brandName: brandText } : { brandId: base!.brandId }),
        categoryId,
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

      // Trường cấp SP bị đổi (SP có sẵn) — hiện "đổi: …" trên từng dòng của SP.
      const productChanges: ImportChange[] = !base ? [] : ([
        ["name", renamed],
        ["brand", !!brandText && (!brand || brand.id !== base.brandId)],
        ["category", categoryId !== base.categoryId],
        ["description", (!!descMy && descMy !== base.my.description) || (!!descEn && descEn !== base.en.description)],
        ["usage", (!!legacy.usage_my && legacy.usage_my !== base.my.usage) || (!!legacy.usage_en && legacy.usage_en !== base.en.usage)],
        ["ingredients", !!legacy.ingredients && legacy.ingredients !== base.ingredientsText],
        ["storage", !!legacy.storage_note && legacy.storage_note !== base.storageNote],
        ["pao", pao != null && pao !== base.paoMonths],
      ] as const).filter(([, changed]) => changed).map(([k]) => k);
      const productChanged = !base || productChanges.length > 0 || variants.some((v) => v.changed);
      if (!base) counts.createdProducts++;
      else if (productChanged) counts.updatedProducts++;
      else counts.unchangedProducts++;
      if (productChanged) saves.push(payload);
      if (!base && nameText) {
        const twin = await db.productTranslation.findFirst({ where: { name: { equals: nameText, mode: "insensitive" }, product: { archivedAt: null } }, select: { product: { select: { slug: true } } } });
        if (twin) warn(rowsOf, `đã có sản phẩm cùng tên (${twin.product.slug}). Muốn cập nhật sản phẩm đó thì điền SKU của nó.`);
      }

      // Bảng xem trước + tồn nhập theo từng dòng.
      const brandName = brand?.name ?? (brandText || products.get(base?.id ?? "")?.brandName || "");
      const categoryRow = categories.find((c) => c.id === categoryId);
      const categoryName = categoryText || (categoryRow ? productName(categoryRow.translations, categoryRow.slug) : "");
      const existingName = en.name || my.name;
      const seen = new Map<string, Row>();
      for (const v of variants) {
        for (const r of v.rows) {
          const view = views.get(Number(r.__line))!;
          Object.assign(view, {
            action: !base || v.isNew ? "create" : v.changed || productChanged ? "update" : "same",
            name: view.nameFromFile ? view.name : existingName,
            brand: brandName,
            category: categoryName,
            sku: v.sku,
            skuAuto: !!v.autoSku,
            label: v.label,
            weight: v.weightGrams,
            changes: [...productChanges, ...v.changes],
          } satisfies Partial<ImportRowView>);
          const stockCells = ["qty", "expiry_date", "unit_cost", "unit_cost_vnd", "unit_cost_mmk", "lot_no"].some((k) => (r[k] ?? "").trim());
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
            const dateText = r.expiry_date?.trim() || "";
            const noExpiry = !FEATURES.expiry || parseYesNo(dateText) === false || dateText.toUpperCase() === "NONE";
            const date = noExpiry ? "" : dateText;
            const legacyStatus = (r.expiry_status ?? "").trim().toUpperCase();
            const status = !FEATURES.expiry
              ? (date ? "DATED" : "NONE")
              : legacyStatus ? z.enum(["DATED", "NONE", "UNKNOWN"]).parse(legacyStatus) : noExpiry ? "NONE" : date ? "DATED" : noExpiryDefault ? "NONE" : "UNKNOWN";
            if (FEATURES.expiry && status === "DATED" && !date) throw new Error("Cần ngày hết hạn");
            if (FEATURES.expiry && status !== "DATED" && date) throw new Error("Để trống hạn sử dụng với lô chưa biết hạn / không hạn");
            const mfg = r.mfg_date?.trim() || undefined;
            if (FEATURES.expiry && mfg && date && mfg > date) throw new Error("Ngày sản xuất sau hạn sử dụng");
            const stockType = z.enum(["SELLABLE", "TESTER"]).parse((r.stock_type || "SELLABLE").trim().toUpperCase());
            const lotNo = z.string().trim().min(1).max(50).parse(r.lot_no?.trim() || autoLot(v.sku));
            const key = `${v.sku}\u0000${lotNo}`;
            const previous = seen.get(key);
            if (previous) {
              if (`${previous.stock_type || "SELLABLE"}`.toUpperCase() === stockType) throw new Error(`Trùng SKU và số lô ${lotNo} — gộp số lượng thành một dòng`);
              if (["expiry_date", "mfg_date", "unit_cost", "unit_cost_vnd", "unit_cost_mmk"].some((k) => (previous[k] || "") !== (r[k] || ""))) throw new Error(`Cùng SKU và lô ${lotNo} phải có cùng hạn, ngày sản xuất và giá mua`);
            }
            seen.set(key, r);
            // Lô đã có của SKU: cùng quy tắc với phiếu nhập (createDocument) → báo ngay ở bước xem trước.
            const lot = existingLots.get(`${v.sku}\u0000${lotNo}`);
            if (lot) {
              if (lot.shipmentId) throw new Error(`Lô ${lotNo} của SKU ${v.sku} thuộc chuyến hàng — nhập thêm qua phiếu nhập của chuyến, không qua Excel`);
              if ((lot.unitCostVnd == null) === !mmk) throw new Error(`Lô ${lotNo} của SKU ${v.sku} đã có giá mua bằng loại tiền khác`);
              if (FEATURES.expiry && (lot.expiryStatus !== status || (lot.expiryDate?.toISOString().slice(0, 10) ?? "") !== date)) {
                throw new Error(`Lô ${lotNo} của SKU ${v.sku} đã có với hạn dùng khác (${lot.expiryDate ? lot.expiryDate.toISOString().slice(0, 10) : lot.expiryStatus}) — đổi số lô hoặc sửa hạn cho khớp`);
              }
            }
            if (FEATURES.expiry && status === "DATED" && date < today) warn(r.__line, `lô ${lotNo} đã hết hạn (${date}) → không bán được.`, true);
            else if (FEATURES.expiry && status === "DATED" && date < blockFrom) warn(r.__line, `lô ${lotNo} còn dưới ${blockDays} ngày hạn dùng (${date}) → bị chặn bán.`, true);
            // Giá vốn = giá mua × tỷ giá đang dùng (tỷ giá được chốt cho các lô nhập lần này); không còn phí về kho.
            const costMmk = mmk ? purchase : rate ? money.parse(vndToMmk(purchase, rate)) : null;
            if (!mmk) needsRate = true;
            if (FEATURES.expiry && status === "UNKNOWN") warnEach(r.__line, NO_EXPIRY);
            stock.push({
              sku: v.sku,
              locationId: target.id,
              vnd: !mmk,
              line: { lotNo, expiryDate: date || undefined, expiryStatus: status, mfgDate: mfg, ...(mmk ? { unitCostMmk: purchase } : { unitCostVnd: purchase }), qty, stockType },
            });
            view.stock = {
              qty,
              lotNo,
              lotAuto: !r.lot_no?.trim(),
              location: target.code,
              expiryDate: date || null,
              expiryStatus: status,
              currency: mmk ? "MMK" : "VND",
              unitCost: purchase,
              costMmk,
            };
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
  const general: string[] = [];
  if (needsRate && !rate) general.push("Cần thiết lập tỷ giá đang có hiệu lực (Giá & tỷ giá) trước khi nhập tồn hàng VND.");
  errors.push(...general);
  for (const [text, lines] of repeated) warnings.push(`Dòng ${lines.sort((a, b) => a - b).join(", ")}: ${text}`);
  // File cũ còn cột Giá bán / Hoa hồng CTV: bỏ qua (giá chỉ đặt ở trang Giá bán — 16/11/2026).
  const pricedRows = rows.filter((r) => (r.price_mmk ?? "").trim() || (r.affiliate_commission_mmk ?? "").trim());
  if (pricedRows.length) warn(pricedRows, "cột Giá bán / Hoa hồng CTV không còn nhập qua Excel — đã bỏ qua. Đặt giá ở trang Giá bán.");
  // File cũ còn cột "Phí đưa về kho": không còn dùng (giá vốn = giá mua × tỷ giá) — bỏ qua kèm một lưu ý.
  const feeRows = rows.filter((r) => (r.inbound_unit_vnd ?? "").trim());
  if (feeRows.length) warn(feeRows, "cột Phí đưa về kho không còn dùng (giá vốn lô = giá mua × tỷ giá) — đã bỏ qua.");
  const rowList = [...views.values()].sort((a, b) => a.line - b.line);
  for (const view of rowList) {
    view.issues = rowIssues.get(view.line) ?? [];
    // Dòng có lỗi (kể cả lỗi chung của cả SP) không được ghi gì → trạng thái Lỗi.
    if (view.issues.some((i) => i.level === "error")) view.action = "error";
  }
  const rowCounts = { create: 0, update: 0, same: 0, error: 0 };
  for (const view of rowList) rowCounts[view.action]++;
  return {
    preview: {
      input: { ...input, rateId: needsRate ? rate?.id : undefined },
      errors,
      warnings,
      rows: rowList,
      counts,
      rowCounts,
      documents: new Set(stock.map((s) => s.locationId)).size,
      rate: needsRate && rate ? { vndPerMmk: rateDisplay(rate).vndPerMmk } : null,
      general,
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

/**
 * `submit` (§6.4 "Gửi duyệt ngay"): gửi duyệt luôn các SP lượt này tạo / sửa (chỉ SP đủ điều kiện), cùng transaction.
 * Mặc định tắt — form nhập bật sẵn ô này.
 */
export async function commitCatalogImport(raw: unknown, userId: string, opts: { submit?: boolean } = {}) {
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

    const fileTag = receiptId.slice(0, 8);
    const touched: string[] = [];
    const before = await changedBefore(tx, saves.flatMap((p) => (typeof p.id === "string" ? [p.id] : [])));
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
    const review = opts.submit ? await submitTouched(tx, touched, userId, { changedBefore: before }) : null;
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
