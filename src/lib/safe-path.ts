/**
 * Đường dẫn nội bộ an toàn để chuyển hướng/gắn link (`/checkout`, `/en/p/abc?x=1`).
 * Chặn mọi biến thể đi ra ngoài web: `//host`, `/\host`, và cả `/<tab>/host` — trình duyệt bỏ tab/xuống dòng khi
 * phân tích URL nên `/\t/evil.com` thành `//evil.com`. Không nhận ký tự điều khiển/khoảng trắng; kiểm lại bằng
 * `URL` rằng kết quả vẫn cùng origin.
 */
export function isSafeInternalPath(raw: unknown): raw is string {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")) return false;
  if (/[\\\s\u0000-\u001f\u007f]/.test(raw)) return false;
  try {
    const base = "http://internal.invalid";
    return new URL(raw, base).origin === base;
  } catch {
    return false;
  }
}
