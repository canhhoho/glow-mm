/**
 * File Excel nhập/cập nhật sản phẩm (một sheet, mỗi dòng một SKU, nhập kho tuỳ chọn).
 * Cột = `PRODUCT_FIELDS` (cùng bộ trường với form SP, `lib/product-fields.ts`); tiêu đề theo ngôn ngữ admin,
 * bộ đọc nhận tiêu đề cả 3 ngôn ngữ + nhãn/khoá của mẫu cũ. Dùng chung cho sinh file, bộ đọc và test. Không import server.
 */
import adminVi from "../../messages/admin.vi.json";
import adminEn from "../../messages/admin.en.json";
import adminMy from "../../messages/admin.my.json";
import { PRODUCT_FIELDS, type FieldList, type FieldType, type ProductField, type ProductSection } from "./product-fields";

export const CATALOG_SHEET = "Nhap hang";
export const CATALOG_LIST_SHEET = "Danh sach";
/** Hàng tiêu đề của bảng nhập (dòng đầu tiên, không còn dòng hướng dẫn — 16/11/2026); dữ liệu bắt đầu ngay dòng sau. */
export const CATALOG_HEADER_ROW = 1;
export const CATALOG_INPUT_ROWS = 500;

export type SheetColumnType = FieldType;
export type SheetList = FieldList;
export type SheetColumn = Pick<ProductField, "key" | "type" | "width" | "required" | "list" | "collapsed" | "collapsedBlankOnly" | "wrap"> & {
  section?: ProductSection;
  group: "product" | "stock";
  /** Khoá/nhãn cột của file mẫu cũ (tiếng Việt) vẫn được nhận. */
  aliases?: string[];
};

/** Nhãn tiếng Việt của mẫu cũ cho các cột còn dùng. */
const OLD_LABELS: Record<string, string[]> = {
  name: ["name_en", "Tên tiếng Anh"],
  category: ["Mã danh mục"],
  variant_label: ["Biến thể", "Biến thể (dung tích/màu)"],
  sku: ["Mã SKU"],
  warehouse_code: ["Kho bán", "Mã kho bán"],
  qty: ["Số lượng"],
  inbound_unit_vnd: ["Phí đưa về kho"],
};

export const CATALOG_COLUMNS: SheetColumn[] = PRODUCT_FIELDS.filter((f) => f.excel).map((f) => ({
  key: f.key,
  type: f.type,
  width: f.width,
  required: f.required,
  list: f.list,
  collapsed: f.collapsed,
  collapsedBlankOnly: f.collapsedBlankOnly,
  wrap: f.wrap,
  section: f.section,
  group: f.section === "stock" ? "stock" : "product",
  aliases: OLD_LABELS[f.key],
}));

/**
 * Cột của mẫu cũ: không có trên file mới nhưng file cũ có thì vẫn đọc. Tên Myanmar = tên dự phòng khi thiếu cột Tên;
 * "Có hạn dùng" = mặc định hạn dùng của lô trống; Giá bán / Hoa hồng CTV bị bỏ qua (đặt ở trang Giá bán).
 */
export const LEGACY_COLUMNS: SheetColumn[] = [
  { key: "name_my", type: "text", width: 0, group: "product", aliases: ["Tên Myanmar", "Tên tiếng Myanmar"] },
  { key: "price_mmk", type: "money", width: 0, group: "product", aliases: ["Giá bán (MMK)", "Giá bán"] },
  { key: "affiliate_commission_mmk", type: "money", width: 0, group: "product", aliases: ["Hoa hồng CTV (MMK/cái)", "Hoa hồng CTV"] },
  { key: "has_expiry", type: "yesno", width: 0, group: "product", aliases: ["Có hạn dùng", "expiry_policy", "Quản lý hạn sử dụng"] },
  { key: "product_slug", type: "text", width: 0, group: "product", aliases: ["Mã sản phẩm"] },
  { key: "mfg_date", type: "date", width: 0, group: "stock", aliases: ["Ngày sản xuất"] },
  { key: "stock_type", type: "text", width: 0, group: "stock", aliases: ["Loại hàng"] },
  { key: "expiry_status", type: "text", width: 0, group: "stock", aliases: ["Trạng thái hạn dùng"] },
  { key: "unit_cost_vnd", type: "money", width: 0, group: "stock", aliases: ["Giá mua (VND/đv)"] },
  { key: "unit_cost_mmk", type: "money", width: 0, group: "stock", aliases: ["Giá mua (MMK/đv)"] },
  { key: "location_code", type: "text", width: 0, group: "stock", aliases: ["Mã kho"] },
  { key: "selling_fee_mmk", type: "money", width: 0, group: "stock", aliases: ["Phí bán dự kiến (MMK/đv)"] },
];

export const ALL_SHEET_COLUMNS = [...CATALOG_COLUMNS, ...LEGACY_COLUMNS];

// ── Nhãn theo ngôn ngữ admin ──
const MESSAGES = { vi: adminVi, en: adminEn, my: adminMy } as const;
export type SheetLocale = keyof typeof MESSAGES;
type FieldText = { label: string; hint: string };
type FieldMessages = Record<string, FieldText> & {
  sections: Record<ProductSection, string>;
  listTitles: Record<SheetList, string>;
  listError: string;
};
const fieldMessages = (locale: SheetLocale) => MESSAGES[locale].ProductFields as unknown as FieldMessages;

/** Nhãn cột / nhóm / danh sách của file Excel theo ngôn ngữ admin (cùng chữ với form SP). */
export function catalogLabels(locale: SheetLocale = "vi") {
  const m = fieldMessages(locale);
  return {
    label: (key: string) => m[key]?.label ?? key,
    hint: (key: string) => m[key]?.hint ?? "",
    section: (s: ProductSection) => m.sections[s],
    listTitle: (l: SheetList) => m.listTitles[l],
    listError: m.listError,
  };
}
export type CatalogLabels = ReturnType<typeof catalogLabels>;

/** Có/Không → true/false; trống → undefined; giá trị lạ → null. Nhận cả DATED/NONE của mẫu cũ. */
export function parseYesNo(value: string): boolean | undefined | null {
  const v = value.trim().toLowerCase();
  if (!v) return undefined;
  if (["có", "co", "yes", "y", "true", "1", "dated", "x"].includes(v)) return true;
  if (["không", "khong", "no", "n", "false", "0", "none"].includes(v)) return false;
  return null;
}

/**
 * Số trong ô Excel/CSV → chuỗi số chuẩn: bỏ khoảng trắng; "150,000" / "150.000" / "1.250.000" (phân cách nghìn) → "150000".
 * Dấu chấm/phẩy không theo nhóm 3 số (vd "1.5") giữ nguyên để báo lỗi "phải là số nguyên" thay vì đoán sai.
 */
export function normalizeNumberText(value: string): string {
  const v = value.replace(/[\s ]/g, "");
  if (/^-?\d{1,3}(?:[.,]\d{3})+$/.test(v)) return v.replace(/[.,]/g, "");
  return v;
}

const fold = (s: string) => s.normalize("NFC").toLowerCase().replace(/\*/g, "").trim();

/** Mọi tên được nhận của một cột: khoá, nhãn 3 ngôn ngữ (cột hiện hành), nhãn/khoá mẫu cũ. */
const HEADER_NAMES = new Map<string, string>();
for (const c of ALL_SHEET_COLUMNS) {
  const labels = CATALOG_COLUMNS.includes(c) ? (Object.keys(MESSAGES) as SheetLocale[]).map((l) => fieldMessages(l)[c.key]?.label ?? "") : [];
  for (const name of [c.key, ...labels, ...(c.aliases ?? [])]) if (name && !HEADER_NAMES.has(fold(name))) HEADER_NAMES.set(fold(name), c.key);
}

/** Tìm khoá cột theo khoá, nhãn (vi/en/my) hoặc nhãn cũ; tiêu đề có thể nhiều dòng (nhãn + ghi chú). */
export function sheetHeaderKey(value: unknown): string {
  if (typeof value !== "string") return "";
  const parts = value.normalize("NFC").split(/\r?\n/).map(fold).filter(Boolean);
  for (const p of parts) {
    const hit = HEADER_NAMES.get(p);
    if (hit) return hit;
  }
  return "";
}
