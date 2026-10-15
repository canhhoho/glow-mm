/**
 * Ngày theo giờ Yangon (UTC+06:30, không có giờ mùa hè) cho báo cáo.
 * DB lưu UTC; "một ngày" trong báo cáo = 00:00–24:00 giờ Yangon.
 */
const OFFSET_MS = (6 * 60 + 30) * 60_000;
const DAY_MS = 86_400_000;

/** "YYYY-MM-DD" theo giờ Yangon của một thời điểm. */
export function yangonDayKey(d: Date): string {
  return new Date(d.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

/** Thời điểm (UTC) bắt đầu ngày Yangon "YYYY-MM-DD". Ném lỗi nếu sai định dạng. */
export function yangonDayStart(key: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new Error(`Ngày không hợp lệ: ${key}`);
  const t = Date.parse(`${key}T00:00:00Z`);
  if (Number.isNaN(t)) throw new Error(`Ngày không hợp lệ: ${key}`);
  return new Date(t - OFFSET_MS);
}

export function addDays(key: string, days: number): string {
  return new Date(Date.parse(`${key}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Danh sách ngày từ `from` đến `to` (gồm cả hai đầu). */
export function dayRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let k = from; k <= to && out.length < 1000; k = addDays(k, 1)) out.push(k);
  return out;
}
