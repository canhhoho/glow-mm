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

/** Số thập phân (Decimal/chuỗi) có phân cách nghìn, tối đa `max` chữ số lẻ: "26000.00" → "26,000". */
export function fmtDecimal(n: { toString(): string } | null | undefined, max = 2): string {
  return n == null ? "—" : new Intl.NumberFormat("en-US", { maximumFractionDigits: max }).format(Number(n.toString()));
}

export function fmtDateTime(d: Date | null | undefined, timeZone = "Asia/Yangon"): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
}
