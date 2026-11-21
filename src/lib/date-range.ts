import { validDay } from "@/lib/pagination";
import { addDays, yangonDayKey } from "@/lib/time";

/**
 * Khoảng ngày (giờ Yangon, "YYYY-MM-DD") dùng chung cho bộ lọc admin (21/11/2026, audit #10): báo cáo bán hàng, analytics,
 * đơn hàng, phiếu kho. Trước đây mỗi trang tự kiểm ngày, giới hạn khác nhau, không có nút nhanh.
 */
export type DayRange = { from: string; to: string };

export const DATE_PRESETS = ["today", "last7", "last30", "thisMonth", "lastMonth"] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];

/** Khoảng của một nút nhanh, tính theo ngày Yangon của `now`. */
export function presetRange(preset: DatePreset, now = new Date()): DayRange {
  const today = yangonDayKey(now);
  const monthStart = `${today.slice(0, 7)}-01`;
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "last7":
      return { from: addDays(today, -6), to: today };
    case "last30":
      return { from: addDays(today, -29), to: today };
    case "thisMonth":
      return { from: monthStart, to: today };
    case "lastMonth": {
      const lastDay = addDays(monthStart, -1);
      return { from: `${lastDay.slice(0, 7)}-01`, to: lastDay };
    }
  }
}

/** Khoảng tuỳ chọn (danh sách): bỏ ngày sai định dạng, nhập ngược thì đảo. */
export function optionalRange(raw: { from?: unknown; to?: unknown }): { from?: string; to?: string } {
  let from = validDay(raw.from);
  let to = validDay(raw.to);
  if (from && to && from > to) [from, to] = [to, from];
  return { from, to };
}

/** Khoảng bắt buộc (báo cáo): thiếu → `defaultDays` ngày gần nhất; đảo nếu ngược; dài quá `maxDays` → cắt bớt đầu. */
export function requiredRange(raw: { from?: unknown; to?: unknown }, opts: { defaultDays: number; maxDays: number; now?: Date }): DayRange {
  const today = yangonDayKey(opts.now ?? new Date());
  const r = optionalRange(raw);
  let to = r.to ?? (r.from && r.from > today ? r.from : today);
  let from = r.from ?? addDays(to, -(opts.defaultDays - 1));
  if (from > to) [from, to] = [to, from];
  if (from < addDays(to, -(opts.maxDays - 1))) from = addDays(to, -(opts.maxDays - 1));
  return { from, to };
}

/** Các nút nhanh cho `DateRangeFields`: `href(range)` do trang dựng (giữ các bộ lọc khác). */
export function datePresetItems(
  labels: Record<DatePreset, string>,
  href: (range: DayRange) => string,
  current: { from?: string; to?: string },
  now = new Date(),
) {
  return DATE_PRESETS.map((p) => {
    const range = presetRange(p, now);
    return { key: p, label: labels[p], href: href(range), active: current.from === range.from && current.to === range.to };
  });
}

/** Nhãn nút nhanh từ namespace `Common` (`Common.datePreset.*`). */
export function presetLabels(t: (key: string) => string): Record<DatePreset, string> {
  return Object.fromEntries(DATE_PRESETS.map((p) => [p, t(`datePreset.${p}`)])) as Record<DatePreset, string>;
}
