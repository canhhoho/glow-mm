/**
 * Bộ trường thông tin sản phẩm DÙNG CHUNG cho form tạo, form sửa và file Excel nhập/xuất (16/11/2026, Đợt 3).
 * Một định nghĩa: thứ tự, nhóm, bắt buộc, nơi xuất hiện. Nhãn + gợi ý nằm ở `messages/admin.*.json` → `ProductFields.<key>`.
 * Không import server/JSON (form client dùng được).
 *
 * Không có trong thông tin SP: giá bán, hoa hồng CTV, lãi cố định (trang Giá bán), kho bán (gán khi nhập hàng),
 * hạn dùng (theo lô ở phần nhập kho).
 */

export const PRODUCT_SECTIONS = ["main", "variant", "content", "extra", "stock"] as const;
export type ProductSection = (typeof PRODUCT_SECTIONS)[number];

export type FieldType = "text" | "money" | "whole" | "positive" | "date" | "yesno";
export type FieldList = "brands" | "categories" | "warehouses";

export type ProductField = {
  /** Khoá cột Excel (giữ ổn định — file cũ vẫn đọc được). */
  key: string;
  section: ProductSection;
  /** `product`: chung cả SP; `variant`: từng phân loại (SKU); `stock`: từng dòng nhập kho. */
  level: "product" | "variant" | "stock";
  type: FieldType;
  /** Bắt buộc khi tạo SP mới (dấu * trên form và tiêu đề Excel). */
  required?: boolean;
  list?: FieldList;
  /** Có ô trên form tạo SP (tạo nhanh). */
  create?: boolean;
  /** Có ô trên form sửa SP. */
  form: boolean;
  /** Có cột trong file Excel. */
  excel: boolean;
  /** Cột Excel thu gọn (bấm dấu +) — nội dung phụ. */
  collapsed?: boolean;
  /** Chỉ thu gọn ở file mẫu trống (file SP hiện có luôn hiện — vd SKU để nhận diện dòng). */
  collapsedBlankOnly?: boolean;
  wrap?: boolean;
  width: number;
};

export const PRODUCT_FIELDS: ProductField[] = [
  { key: "name", section: "main", level: "product", type: "text", required: true, create: true, form: true, excel: true, width: 34 },
  { key: "brand", section: "main", level: "product", type: "text", required: true, list: "brands", create: true, form: true, excel: true, width: 22 },
  { key: "category", section: "main", level: "product", type: "text", required: true, list: "categories", create: true, form: true, excel: true, width: 24 },
  { key: "variant_label", section: "variant", level: "variant", type: "text", create: true, form: true, excel: true, width: 20 },
  { key: "sku", section: "variant", level: "variant", type: "text", form: true, excel: true, collapsed: true, collapsedBlankOnly: true, width: 20 },
  { key: "weight_g", section: "variant", level: "variant", type: "whole", form: true, excel: true, width: 14 },
  { key: "description_my", section: "content", level: "product", type: "text", form: true, excel: true, wrap: true, width: 34 },
  { key: "description_en", section: "content", level: "product", type: "text", form: true, excel: true, wrap: true, width: 34 },
  { key: "usage_my", section: "extra", level: "product", type: "text", form: true, excel: true, collapsed: true, wrap: true, width: 30 },
  { key: "usage_en", section: "extra", level: "product", type: "text", form: true, excel: true, collapsed: true, wrap: true, width: 30 },
  { key: "ingredients", section: "extra", level: "product", type: "text", form: true, excel: true, collapsed: true, wrap: true, width: 30 },
  { key: "storage_note", section: "extra", level: "product", type: "text", form: true, excel: true, collapsed: true, wrap: true, width: 24 },
  { key: "pao_months", section: "extra", level: "product", type: "positive", form: true, excel: true, collapsed: true, width: 14 },
  { key: "warehouse_code", section: "stock", level: "stock", type: "text", list: "warehouses", form: false, excel: true, width: 12 },
  { key: "qty", section: "stock", level: "stock", type: "positive", form: false, excel: true, width: 14 },
  { key: "expiry_date", section: "stock", level: "stock", type: "date", form: false, excel: true, width: 15 },
  { key: "unit_cost", section: "stock", level: "stock", type: "money", form: false, excel: true, width: 15 },
  { key: "inbound_unit_vnd", section: "stock", level: "stock", type: "money", form: false, excel: true, collapsed: true, width: 18 },
  { key: "lot_no", section: "stock", level: "stock", type: "text", form: false, excel: true, collapsed: true, width: 14 },
];

export const fieldsOf = (section: ProductSection) => PRODUCT_FIELDS.filter((f) => f.section === section);
