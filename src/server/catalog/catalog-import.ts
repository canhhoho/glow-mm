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
import { setPurchasePrices } from "@/server/pricing/purchase-price";
import { moveProductsToWarehouseTx } from "./product-delete";
import { productName } from "@/server/inventory/queries";
import { PRODUCT_EDIT_INCLUDE, toProductEditData, type ProductEditData } from "./admin-queries";
import { saveProduct } from "./products";
import { IMPORT_PRICE_PREFIX } from "./product-pricing";
import { brandSlug } from "./brands";
import { MAX_SHEET_ROWS } from "./catalog-sheet-read";
import { isStandardVariantLabel } from "@/lib/variant-label";

/**
 * Nhập/cập nhật sản phẩm từ một sheet (mỗi dòng một SKU).
 * - SKU đã có → cập nhật SP đó; ô trống = giữ giá trị cũ. Không đổi kho bán / combo qua Excel.
 * - Không có SKU → tạo SP mới (ẩn); các dòng cùng tên + thương hiệu là các biến thể của một SP.
 * - Cột Số lượng = SL DỰ KIẾN NHẬP của phân loại (19/11/2026) — KHÔNG tạo phiếu, không đổi tồn. Phiếu nhập (Kho hàng → Phiếu kho)
 *   gợi ý sẵn số này + giá mua hiện tại; ghi sổ phiếu → SL dự kiến về 0. Cột Giá mua = giá mua hiện tại của phân loại.
 * Xem trước chỉ đọc; xác nhận chạy lại toàn bộ kiểm tra trên dữ liệu hiện tại trong một transaction.
 */

export const catalogImportInputSchema = z.object({
  csv: z.string().min(1).max(4_000_000),
  lines: z.array(z.number().int().positive()).max(MAX_SHEET_ROWS).optional(),
  /** Bỏ (19/11/2026: Excel không còn tạo phiếu nhập) — giữ để payload cũ không lỗi. */
  rateId: z.string().max(40).optional(),
  standardLabel: z.string().trim().min(1).max(60).default("Tiêu chuẩn"),
});
export type CatalogImportInput = z.infer<typeof catalogImportInputSchema>;

export type ImportIssue = { level: "error" | "warning"; text: string };
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
  /** SL dự kiến nhập ghi từ cột Số lượng (null = ô trống, giữ số cũ / SP mới = 0). */
  planned: number | null;
  /** Dòng có Giá mua → cập nhật giá mua hiện tại của phân loại (19/11/2026). */
  purchase: { amount: number; currency: "VND" | "MMK"; location: string } | null;
  issues: ImportIssue[];
};

export type CatalogImportPreview = {
  input: CatalogImportInput;
  errors: string[];
  warnings: string[];
  rows: ImportRowView[];
  /** `purchasePrices`: số dòng cập nhật giá mua hiện tại; `plannedQty`: số phân loại ghi SL dự kiến nhập. */
  counts: { createdProducts: number; updatedProducts: number; unchangedProducts: number; plannedQty: number; purchasePrices: number };
  /** Số dòng file theo trạng thái (bảng xem trước). */
  rowCounts: { create: number; update: number; same: number; error: number };
  /** Lỗi không thuộc dòng nào (vd chưa có tỷ giá) — luôn hiện trên bảng. */
  general: string[];
};

/** Giá mua hiện tại (theo tiền của kho), SL dự kiến nhập, kho bán gán từ cột Kho bán cho SP chưa có kho — áp khi xác nhận. */
type PurchasePlan = { sku: string; currency: "VND" | "MMK"; amount: number };
type PlannedPlan = { sku: string; qty: number };
type AssignPlan = { sku: string; locationId: string };
type Plan = { preview: CatalogImportPreview; saves: Record<string, unknown>[]; purchases: PurchasePlan[]; planned: PlannedPlan[]; assigns: AssignPlan[] };

const money = z.coerce.number({ message: "phải là số" }).int("phải là số nguyên").min(0, "không được âm").max(2_147_483_647, "số quá lớn");
const positive = z.coerce.number({ message: "phải là số" }).int("phải là số nguyên").positive("phải lớn hơn 0").max(2_147_483_647, "số quá lớn");
/** Ô số: bỏ phân cách nghìn rồi kiểm (file CSV / gọi trực tiếp không qua bộ đọc Excel). `what` = tên cột trong câu báo lỗi. */
const num = (schema: typeof money, text: string, what: string) => {
  const r = schema.safeParse(normalizeNumberText(text));
  if (!r.success) throw new Error(`${what} "${text}" ${r.error.issues[0]?.message ?? "không hợp lệ"}`);
  return r.data;
};
const skuSchema = z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9._-]+$/, "SKU chỉ gồm chữ, số, . _ -");
const fold = (s: string) => toUnicode(s).normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
/** Ô chữ: Zawgyi → Unicode, NFC, gộp khoảng trắng trong dòng (giữ xuống dòng của mô tả). */
const clean = (s: string) => toUnicode(s).normalize("NFC").replace(/[ \t\u00a0]+/g, " ").replace(/ *\n */g, "\n").trim();
const errorText = (e: unknown) => (e instanceof z.ZodError ? e.issues.map((i) => i.message).join("; ") : (e as Error).message);

type Row = Record<string, string> & { __line: string };
type Group = {
  key: string;
  existing: ProductEditData | null;
  rows: Row[];
  /** Mỗi biến thể: các dòng của SKU đó. */
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
  const warn = (rowsOrLine: Row[] | string, text: string) => {
    const lines = linesOf(rowsOrLine);
    warnings.push(`Dòng ${lines.join(", ")}: ${text}`);
    attach(lines, { level: "warning", text });
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
        planned: null,
        purchase: null,
        issues: [],
      } satisfies ImportRowView];
    }),
  );

  // ── Dữ liệu tham chiếu ──
  const skus = [...new Set(rows.map((r) => r.sku?.trim()).filter(Boolean))];
  const slugs = [...new Set(rows.map((r) => r.product_slug?.trim()).filter(Boolean))];
  const [categories, brands, locations, owners] = await Promise.all([
    db.category.findMany({ select: { id: true, slug: true, translations: { select: { locale: true, name: true } } } }),
    db.brand.findMany({ select: { id: true, name: true, slug: true } }),
    db.location.findMany({ where: { active: true }, select: { id: true, code: true, sellable: true, pricingMode: true } }),
    db.product.findMany({
      where: { OR: [{ variants: { some: { sku: { in: skus } } } }, { slug: { in: slugs } }] },
      include: { ...PRODUCT_EDIT_INCLUDE, brand: { select: { name: true } } },
    }),
  ]);
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

  const saves: Record<string, unknown>[] = [];
  const counts = { createdProducts: 0, updatedProducts: 0, unchangedProducts: 0, plannedQty: 0, purchasePrices: 0 };
  const purchases: PurchasePlan[] = [];
  const planned: PlannedPlan[] = [];
  /** File cũ còn cột Số lô / Loại hàng (Excel không còn tạo phiếu nhập) → bỏ qua, một lưu ý. */
  const stockColumnRows: Row[] = [];
  const assigns: AssignPlan[] = [];
  /** Cờ hạn dùng tắt: dòng còn ô Hạn sử dụng / Ngày sản xuất / Trạng thái hạn (file cũ) → bỏ qua, một lưu ý. */
  const expiryIgnoredRows: Row[] = [];
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
      // Cột cũ "Có hạn dùng": chỉ có nghĩa khi bật lại cờ hạn dùng (19/11/2026); cờ tắt → bỏ qua.
      const hasExpiry = FEATURES.expiry ? parseYesNo(expiryText) : undefined;
      if (hasExpiry === null) throw new Error(`Có hạn dùng: điền "Có" hoặc "Không" (đang là "${expiryText}")`);
      if (!FEATURES.expiry && expiryText) expiryIgnoredRows.push(...rowsOf);

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

      // Kho: SP đã có kho bán → tồn / giá mua theo đúng kho đó. SP chưa có kho → theo cột Kho bán và GÁN kho cho SP khi xác
      // nhận (19/11/2026: kể cả dòng chỉ tạo SP — để đặt giá / bán đặt trước). Không còn tự lấy kho mặc định: thiếu Kho bán mà
      // dòng có Số lượng / Giá mua → báo lỗi (tránh đọc nhầm giá MMK thành VND).
      let locationId: string | null = null;
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
        }
      }
      const location = locationId ? locationById.get(locationId) : undefined;

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
        // Nhãn "một loại tiêu chuẩn" ở mọi ngôn ngữ admin — dòng không ghi phân loại khớp đúng loại chuẩn dù người nhập dùng ngôn ngữ nào.
        const isStandard = isStandardVariantLabel;
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

      // Bảng xem trước + SL dự kiến nhập / giá mua theo từng dòng.
      const brandName = brand?.name ?? (brandText || products.get(base?.id ?? "")?.brandName || "");
      const categoryRow = categories.find((c) => c.id === categoryId);
      const categoryName = categoryText || (categoryRow ? productName(categoryRow.translations, categoryRow.slug) : "");
      const existingName = en.name || my.name;
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
          if (!FEATURES.expiry && ["expiry_date", "mfg_date", "expiry_status"].some((k) => (r[k] ?? "").trim())) expiryIgnoredRows.push(r);
          if (["lot_no", "stock_type"].some((k) => (r[k] ?? "").trim())) stockColumnRows.push(r);
          try {
            const mmk = location?.pricingMode === "LOCAL_MMK";
            const currency = mmk ? "MMK" : "VND";
            const costText = normalizeNumberText(r.unit_cost || (mmk ? r.unit_cost_mmk : r.unit_cost_vnd) || "");
            const wrongCurrency = ((mmk ? r.unit_cost_vnd : r.unit_cost_mmk) ?? "").trim();
            const qtyText = (r.qty ?? "").trim();
            // Số lượng = SL dự kiến nhập (19/11/2026): 0 vẫn ghi 0; ô trống = giữ số cũ (SP mới: 0). Không tạo phiếu.
            if (qtyText) {
              const qty = num(money, qtyText, "Số lượng");
              if (qty > 0 && !location) throw new Error("Sản phẩm chưa có kho bán — ghi cột Kho bán để biết sẽ nhập vào kho nào");
              const prev = planned.find((p) => p.sku === v.sku);
              // Nhiều dòng cùng SKU (file cũ: mỗi lô một dòng) → cộng dồn.
              if (prev) prev.qty += qty;
              else {
                planned.push({ sku: v.sku, qty });
                counts.plannedQty++;
              }
              view.planned = qty;
            }
            if (costText || wrongCurrency) {
              if (!location) throw new Error("Sản phẩm chưa có kho bán — ghi cột Kho bán để biết giá mua theo VND hay MMK");
              if (wrongCurrency) throw new Error(mmk ? `Kho ${location.code} nhập giá mua MMK, để trống cột VND` : `Kho ${location.code} nhập giá mua VND, để trống cột MMK`);
              // Giá mua = giá mua hiện tại của phân loại (giá thật, sửa được) — phiếu nhập gợi ý giá này.
              const amount = num(money, costText, "Giá mua");
              purchases.push({ sku: v.sku, currency, amount });
              view.purchase = { amount, currency, location: location.code };
              counts.purchasePrices++;
            }
          } catch (e) {
            fail(r.__line, e);
          }
        }
      }
      if (!base?.stockLocationId && locationId && variants[0]) assigns.push({ sku: variants[0].sku, locationId });
    } catch (e) {
      fail(g.rows, e);
    }
  }
  if (expiryIgnoredRows.length) warn([...new Set(expiryIgnoredRows)], "cột Hạn sử dụng / Ngày sản xuất không còn dùng — đã bỏ qua.");
  if (stockColumnRows.length) warn(stockColumnRows, "cột Số lô / Loại hàng không còn dùng — Excel không tạo phiếu nhập; Số lượng là SL dự kiến nhập, tạo phiếu ở Kho hàng → Phiếu kho.");
  const general: string[] = [];
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
      input: { ...input, rateId: undefined },
      errors,
      warnings,
      rows: rowList,
      counts,
      rowCounts,
      general,
    },
    saves,
    purchases,
    planned,
    assigns,
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
    const { preview, saves, purchases, planned, assigns } = await buildPlan(input, tx);
    if (preview.errors.length) throw new Error(preview.errors.join("\n"));
    const receiptId = createHash("sha256").update(input.csv).digest("hex");
    // P1-D (H6): mọi file đã xác nhận đều ghi dấu — nhập lại đúng file đó bị chặn (dòng không SKU sẽ tạo SP trùng).
    const previous = await tx.catalogOpeningImport.findUnique({ where: { id: receiptId }, select: { createdAt: true } });
    if (previous) {
      throw new Error(`File này đã được nhập lúc ${previous.createdAt.toISOString().slice(0, 16).replace("T", " ")} (UTC). Không nhập lại — sửa file nếu cần cập nhật tiếp.`);
    }

    const fileTag = receiptId.slice(0, 8);
    const touched: string[] = [];
    const before = await changedBefore(tx, saves.flatMap((p) => (typeof p.id === "string" ? [p.id] : [])));
    for (const payload of saves) touched.push((await saveProduct(payload, userId, tx, { priceReason: `${IMPORT_PRICE_PREFIX}${fileTag}` })).id);

    // Kho bán từ cột Kho bán (SP chưa có kho) rồi giá mua hiện tại — cùng hàm với trang SP / trang Giá bán (19/11/2026).
    const owners = new Map((await tx.variant.findMany({ where: { sku: { in: [...assigns, ...purchases, ...planned].map((x) => x.sku) } }, select: { id: true, sku: true, productId: true } })).map((v) => [v.sku, v]));
    const byLoc = new Map<string, string[]>();
    for (const a of assigns) byLoc.set(a.locationId, [...(byLoc.get(a.locationId) ?? []), owners.get(a.sku)!.productId]);
    for (const [locationId, productIds] of byLoc) await moveProductsToWarehouseTx(tx, productIds, locationId, userId);
    await setPurchasePrices(tx, purchases.map((p) => ({ variantId: owners.get(p.sku)!.id, currency: p.currency, amount: p.amount })), { userId, source: "import", ref: fileTag });

    // SL dự kiến nhập: không phải tồn kho — phiếu nhập gợi ý số này, ghi sổ phiếu thì về 0.
    for (const p of planned) await tx.variant.update({ where: { id: owners.get(p.sku)!.id }, data: { plannedReceiveQty: p.qty } });
    const review = opts.submit ? await submitTouched(tx, touched, userId, { changedBefore: before }) : null;
    const result = { ...preview.counts };
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
