import Rabbit from "rabbit-node";
import { ZawgyiDetector } from "./vendor/zawgyi-detector";

/**
 * Chuẩn hoá chữ Myanmar: phát hiện Zawgyi và chuyển sang Unicode.
 * Dùng cho MỌI input từ khách (tìm kiếm, form) trước khi lưu/so khớp.
 */

const THRESHOLD = 0.95;
const MYANMAR_RE = /[က-႟]/;

let detector: ZawgyiDetector | undefined;
function getDetector() {
  return (detector ??= new ZawgyiDetector());
}

export function hasMyanmar(text: string): boolean {
  return MYANMAR_RE.test(text);
}

export function zawgyiProbability(text: string): number {
  if (!hasMyanmar(text)) return 0;
  return getDetector().getZawgyiProbability(text);
}

export function isZawgyi(text: string): boolean {
  return zawgyiProbability(text) > THRESHOLD;
}

/** Trả về chuỗi Unicode (giữ nguyên nếu đã là Unicode hoặc không có chữ Myanmar). */
export function toUnicode(text: string): string {
  const normalized = text.normalize("NFC");
  return isZawgyi(normalized) ? Rabbit.zg2uni(normalized) : normalized;
}

function clean(text: string): string {
  return text.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

/** Chuẩn hoá để tìm kiếm: Unicode, gộp khoảng trắng, lowercase phần Latin. */
export function normalizeForSearch(text: string): string {
  return clean(toUnicode(text));
}

/**
 * Các dạng cần tìm cho một truy vấn. Chuỗi ngắn có thể mơ hồ (xác suất 0.3–0.95)
 * → tìm cả bản gốc lẫn bản chuyển đổi để không bỏ sót.
 */
export function searchVariants(text: string): string[] {
  const p = zawgyiProbability(text.normalize("NFC"));
  if (p > THRESHOLD) return [clean(Rabbit.zg2uni(text.normalize("NFC")))];
  if (p > 0.3) return [...new Set([clean(text), clean(Rabbit.zg2uni(text.normalize("NFC")))])];
  return [clean(text)];
}
