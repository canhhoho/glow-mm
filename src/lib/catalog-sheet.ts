/**
 * File Excel nhập/cập nhật sản phẩm (một sheet, mỗi dòng một SKU, tồn tuỳ chọn).
 * Dùng chung cho: sinh file mẫu, bộ đọc file và test. Không import server.
 */

export const CATALOG_SHEET = "Nhap hang";
export const CATALOG_GUIDE_SHEET = "Huong dan";
export const CATALOG_LIST_SHEET = "Danh sach";
/** Hàng tiêu đề của bảng nhập; dữ liệu bắt đầu ngay dòng sau. */
export const CATALOG_HEADER_ROW = 6;
export const CATALOG_INPUT_ROWS = 500;

export type SheetColumnType = "text" | "money" | "whole" | "positive" | "date" | "yesno";
export type SheetList = "brands" | "categories" | "warehouses" | "yesno";

export type SheetColumn = {
  key: string;
  label: string;
  group: "product" | "stock";
  type: SheetColumnType;
  width: number;
  hint: string;
  /** Đánh dấu * trên file mẫu (bắt buộc với dòng tạo mới). */
  required?: boolean;
  list?: SheetList;
  /** Khoá/nhãn cột của file mẫu cũ vẫn được nhận. */
  aliases?: string[];
};

export const CATALOG_COLUMNS: SheetColumn[] = [
  { key: "name_my", label: "Tên Myanmar", group: "product", type: "text", width: 30, hint: "Cần ít nhất một tên (Myanmar hoặc tiếng Anh). Thiếu tên nào thì dùng tên còn lại.", aliases: ["Tên tiếng Myanmar"] },
  { key: "name_en", label: "Tên tiếng Anh", group: "product", type: "text", width: 30, hint: "Các dòng cùng tên + thương hiệu là các biến thể của một sản phẩm." },
  { key: "brand", label: "Thương hiệu", group: "product", type: "text", width: 22, required: true, list: "brands", hint: "Chọn trong danh sách hoặc gõ tên mới — thương hiệu mới sẽ được tạo." },
  { key: "category", label: "Danh mục", group: "product", type: "text", width: 26, required: true, list: "categories", hint: "Chọn trong danh sách (nhận cả tên hoặc mã danh mục).", aliases: ["Mã danh mục"] },
  { key: "variant_label", label: "Biến thể", group: "product", type: "text", width: 18, hint: "Dung tích, kích cỡ hoặc màu. Để trống nếu sản phẩm chỉ có một loại.", aliases: ["Biến thể (dung tích/màu)"] },
  { key: "price_mmk", label: "Giá bán (MMK)", group: "product", type: "money", width: 16, hint: "Chỉ cập nhật giá SKU đã có (để trống = giữ giá cũ). SKU mới bỏ qua cột này — đặt giá ở bước 3 trên trang sản phẩm." },
  { key: "weight_g", label: "Khối lượng (g)", group: "product", type: "whole", width: 15, hint: "Gram. Cần trước khi mở bán hàng kho nhập từ Việt Nam." },
  { key: "affiliate_commission_mmk", label: "Hoa hồng CTV (MMK/cái)", group: "product", type: "money", width: 18, hint: "Số tiền CTV nhận cho mỗi cái bán ra. Để trống = theo % của CTV (dòng cập nhật: giữ mức cũ). Muốn bỏ mức riêng thì xoá trong trang sản phẩm.", aliases: ["Hoa hồng CTV"] },
  { key: "description_my", label: "Mô tả Myanmar", group: "product", type: "text", width: 34, hint: "Tuỳ chọn. Có thể xuống dòng trong một ô." },
  { key: "description_en", label: "Mô tả tiếng Anh", group: "product", type: "text", width: 34, hint: "Tuỳ chọn." },
  { key: "warehouse_code", label: "Kho bán", group: "product", type: "text", width: 12, list: "warehouses", hint: "Mã kho bán. Để trống = kho mặc định. Sản phẩm đã có: đổi kho trong trang sản phẩm.", aliases: ["Mã kho bán"] },
  { key: "has_expiry", label: "Có hạn dùng", group: "product", type: "yesno", width: 13, list: "yesno", hint: "Có (mặc định) hoặc Không (túi, phụ kiện...).", aliases: ["expiry_policy", "Quản lý hạn sử dụng"] },
  { key: "sku", label: "SKU", group: "product", type: "text", width: 20, hint: "Để trống khi tạo mới (tự sinh). Điền SKU đã có để cập nhật sản phẩm đó.", aliases: ["Mã SKU"] },
  { key: "qty", label: "Số lượng nhập", group: "stock", type: "positive", width: 14, hint: "Tuỳ chọn. Có số lượng → tạo phiếu nhập nháp, kiểm tra rồi ghi sổ.", aliases: ["Số lượng"] },
  { key: "expiry_date", label: "Hạn sử dụng", group: "stock", type: "date", width: 15, hint: "dd/mm/yyyy. Để trống với hàng có hạn → lô chưa biết hạn, chưa bán được đến khi cập nhật." },
  { key: "unit_cost", label: "Giá mua/đv", group: "stock", type: "money", width: 15, hint: "Theo kho bán: VND (kho hàng nhập Việt Nam) hoặc MMK (kho mua tại Myanmar)." },
  { key: "inbound_unit_vnd", label: "Phí đưa về kho (VND/đv)", group: "stock", type: "money", width: 20, hint: "Tuỳ chọn, chỉ kho hàng nhập Việt Nam: vận chuyển, thuế phân bổ mỗi đơn vị.", aliases: ["Phí đưa về kho"] },
  { key: "lot_no", label: "Số lô", group: "stock", type: "text", width: 14, hint: "Tuỳ chọn. Để trống = tự sinh số lô." },
];

/** Cột của mẫu cũ: không có trên mẫu mới nhưng file cũ có thì vẫn đọc. */
export const LEGACY_COLUMNS: SheetColumn[] = [
  { key: "product_slug", label: "Mã sản phẩm", group: "product", type: "text", width: 0, hint: "" },
  { key: "usage_my", label: "Cách dùng Myanmar", group: "product", type: "text", width: 0, hint: "" },
  { key: "usage_en", label: "Cách dùng tiếng Anh", group: "product", type: "text", width: 0, hint: "" },
  { key: "ingredients", label: "Thành phần", group: "product", type: "text", width: 0, hint: "" },
  { key: "storage_note", label: "Bảo quản", group: "product", type: "text", width: 0, hint: "" },
  { key: "pao_months", label: "Hạn sau mở nắp (tháng)", group: "product", type: "positive", width: 0, hint: "" },
  { key: "mfg_date", label: "Ngày sản xuất", group: "stock", type: "date", width: 0, hint: "" },
  { key: "stock_type", label: "Loại hàng", group: "stock", type: "text", width: 0, hint: "" },
  { key: "expiry_status", label: "Trạng thái hạn dùng", group: "stock", type: "text", width: 0, hint: "" },
  { key: "unit_cost_vnd", label: "Giá mua (VND/đv)", group: "stock", type: "money", width: 0, hint: "" },
  { key: "unit_cost_mmk", label: "Giá mua (MMK/đv)", group: "stock", type: "money", width: 0, hint: "" },
  { key: "location_code", label: "Mã kho", group: "stock", type: "text", width: 0, hint: "" },
  { key: "selling_fee_mmk", label: "Phí bán dự kiến (MMK/đv)", group: "stock", type: "money", width: 0, hint: "" },
];

export const ALL_SHEET_COLUMNS = [...CATALOG_COLUMNS, ...LEGACY_COLUMNS];

/** Có/Không → true/false; trống → undefined; giá trị lạ → null. Nhận cả DATED/NONE của mẫu cũ. */
export function parseYesNo(value: string): boolean | undefined | null {
  const v = value.trim().toLowerCase();
  if (!v) return undefined;
  if (["có", "co", "yes", "y", "true", "1", "dated", "x"].includes(v)) return true;
  if (["không", "khong", "no", "n", "false", "0", "none"].includes(v)) return false;
  return null;
}

const fold = (s: string) => s.normalize("NFC").toLowerCase().replace(/\*/g, "").trim();

/** Tìm khoá cột theo khoá, nhãn hoặc alias; tiêu đề có thể nhiều dòng (nhãn + ghi chú). */
export function sheetHeaderKey(value: unknown): string {
  if (typeof value !== "string") return "";
  const parts = value.normalize("NFC").split(/\r?\n/).map(fold).filter(Boolean);
  const hit = ALL_SHEET_COLUMNS.find((c) => [c.key, c.label, ...(c.aliases ?? [])].some((name) => parts.includes(fold(name))));
  return hit?.key ?? "";
}
