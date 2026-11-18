import adminVi from "../../messages/admin.vi.json";
import adminEn from "../../messages/admin.en.json";
import adminMy from "../../messages/admin.my.json";
import { toUnicode } from "@/lib/myanmar";

/**
 * Nhãn phân loại HỆ THỐNG "một loại tiêu chuẩn" (`Products.standardVariant`) — được ghi vào `Variant.label` khi tạo SP
 * không chia loại / nhập Excel không ghi phân loại, theo ngôn ngữ admin lúc đó ("Tiêu chuẩn" / "Standard" / …).
 * Không đổi dữ liệu cũ: nơi hiển thị cho khách nhận diện nhãn này để dịch theo ngôn ngữ khách hoặc ẩn khi SP chỉ một loại.
 * Tên do người dùng đặt (vd "50ml", "Đỏ") luôn hiện nguyên văn.
 */
export const STANDARD_VARIANT_LABELS = [adminVi, adminEn, adminMy].map((m) => m.Products.standardVariant);

/** Chuẩn hoá để so khớp chữ (Unicode Myanmar, khoảng trắng, hoa thường). */
export const fold = (s: string) => toUnicode(s).normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
const STANDARD = new Set(STANDARD_VARIANT_LABELS.map(fold));

export const isStandardVariantLabel = (label: string | null | undefined) => !!label && STANDARD.has(fold(label));

/**
 * Tên hiển thị "sản phẩm (phân loại)" dùng chung: bỏ phân loại khi là nhãn hệ thống hoặc đã có trong tên
 * (vd "Serum 30ml" + "30ml" → "Serum 30ml", không thành "Serum 30ml (30ml)").
 */
export function variantDisplayName(name: string, label: string | null | undefined) {
  if (!label || isStandardVariantLabel(label)) return name;
  const squash = (s: string) => fold(s).replace(/[\s()[\]·,.-]/g, "");
  return squash(name).includes(squash(label)) ? name : `${name} (${label})`;
}
