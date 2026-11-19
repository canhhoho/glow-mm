/**
 * IP thật của client sau reverse proxy (P19). `x-real-ip` do proxy đặt (Nginx) → tin trước;
 * không có thì lấy phần tử CUỐI của `x-forwarded-for` (do proxy gần nhất thêm) — phần tử đầu là client tự khai.
 * Dùng chung cho rate limit tự viết và Better Auth (`IP_HEADERS`).
 */
export const IP_HEADERS = ["x-real-ip", "x-forwarded-for"];

export function clientIp(headers: Pick<Headers, "get">): string {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = headers.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean);
  return forwarded?.at(-1) ?? "";
}
