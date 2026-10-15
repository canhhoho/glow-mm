/** Định dạng hiển thị dùng chung (admin). */

export function fmtDate(d: Date | null | undefined, timeZone = "Asia/Yangon"): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Ngày lưu dạng DATE (không có giờ) → hiển thị theo UTC để không lệch ngày. */
export function fmtDay(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : "—";
}

export function fmtInt(n: number | null | undefined): string {
  return n == null ? "—" : new Intl.NumberFormat("en-US").format(n);
}

/** Số ngày còn lại tới hạn dùng (theo UTC). */
export function daysUntil(d: Date, now = new Date()): number {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((d.getTime() - today) / 86_400_000);
}
