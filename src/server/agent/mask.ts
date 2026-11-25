/**
 * P25 gói B2 (chủ shop chọn A, 25/11/2026) — ẩn thông tin khách trước khi trả cho trợ lý AI: dữ liệu agent đọc đi qua model
 * bên ngoài (Gemini) và nằm trong lịch sử chat trên máy. Hàm thuần (unit test). Agent vẫn TÌM được theo SĐT/tên đầy đủ;
 * chỉ không nhận lại SĐT/tên/địa chỉ đầy đủ. Cần chi tiết → mở link đơn trên web.
 */

/** Danh xưng Myanmar giữ nguyên (không định danh người): U, Daw, Ma, Mg/Maung, Ko, Naw, Saw, Nang, Sai. */
const HONORIFICS = new Set(["u", "daw", "ma", "mg", "maung", "ko", "naw", "saw", "nang", "sai", "ဦး", "ဒေါ်", "မ", "မောင်", "ကို"]);

/** "Ma Hla Hla" → "Ma H*** H***"; "Thida" → "T***". Giữ danh xưng, mỗi từ khác chỉ giữ ký tự đầu. */
export function maskName(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  return words.map((w) => (HONORIFICS.has(w.toLowerCase().replace(/\.$/, "")) ? w : `${Array.from(w)[0]}***`)).join(" ");
}

/** "09781234567" → "09••••••567" (giữ 2 số đầu + 3 số cuối). Quá ngắn → "•••". */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const d = phone.replace(/\D/g, "");
  if (d.length < 6) return "•••";
  return `${d.slice(0, 2)}${"•".repeat(d.length - 5)}${d.slice(-3)}`;
}

/** Chữ do khách viết (ghi chú đơn): cắt ngắn; agent phải coi là nội dung khách, không phải chỉ dẫn. */
export function customerText(s: string | null | undefined, max = 200): string | null {
  const t = (s ?? "").trim();
  if (!t) return null;
  const chars = Array.from(t);
  return chars.length > max ? `${chars.slice(0, max).join("")}…` : t;
}
