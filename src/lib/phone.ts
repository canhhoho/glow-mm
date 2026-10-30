/** Số điện thoại Myanmar. Thuần, dùng chung cho đơn hàng, tài khoản khách, CTV. */

const MM_DIGITS: Record<string, string> = {
  "၀": "0", "၁": "1", "၂": "2", "၃": "3", "၄": "4", "၅": "5", "၆": "6", "၇": "7", "၈": "8", "၉": "9",
};

/**
 * Chuẩn hoá số di động Myanmar về dạng 09xxxxxxxx.
 * Nhận: 09…, +959…, 959…, 9… (thiếu 0), có khoảng trắng/gạch, chữ số Myanmar (၀-၉).
 * Trả null nếu không hợp lệ. [CẦN XÁC MINH] độ dài theo từng nhà mạng: chấp nhận 7–9 chữ số sau "09".
 */
export function normalizeMmPhone(input: string): string | null {
  let s = input.replace(/[၀-၉]/g, (d) => MM_DIGITS[d]).replace(/[\s\-().]/g, "");
  if (s.startsWith("+")) s = s.slice(1);
  if (s.startsWith("959")) s = "0" + s.slice(2);
  else if (s.startsWith("9") && !s.startsWith("09")) s = "0" + s;
  return /^09\d{7,9}$/.test(s) ? s : null;
}

/**
 * Chữ số để tìm MỘT PHẦN SĐT trong ô tìm kiếm admin — chỉ khi từ khoá toàn ký tự số điện thoại (số Latin/Myanmar,
 * khoảng trắng, + - ( ) .) và có ≥ 3 chữ số; còn lại trả "". Tránh "abc123" / mã "E2E1" khớp nhầm mọi SĐT chứa "123" / "21".
 */
export function phoneSearchDigits(input: string): string {
  const s = input.trim();
  if (!/^[\d၀-၉\s+().-]+$/.test(s)) return "";
  const digits = s.replace(/[၀-၉]/g, (d) => MM_DIGITS[d]).replace(/\D/g, "");
  return digits.length >= 3 ? digits : "";
}
