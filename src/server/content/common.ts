import { z } from "zod";

/** Nội dung trang chủ (banner, bộ sưu tập) — phần dùng chung, không phụ thuộc Next/DB. */

/** Tag cache dữ liệu trang chủ — action admin đổi banner/bộ sưu tập gọi `updateTag(HOME_TAG)`. */
export const HOME_TAG = "home";

export class ContentError extends Error {}

/** Link đích: đường dẫn nội bộ `/…` (không phải `//host`) hoặc `https://…`. Rỗng → null. */
export const linkSchema = z
  .string()
  .trim()
  .max(500)
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^\/(?!\/)\S*$/.test(v) || /^https:\/\/[^\s/]+\S*$/i.test(v), {
    message: "Link phải là đường dẫn trong web (/...) hoặc https://",
  });

/** Lịch hiển thị (UTC). Ô trống = không giới hạn. */
export const scheduleSchema = z
  .object({ startAt: z.date().nullable(), endAt: z.date().nullable() })
  .refine((s) => !s.startAt || !s.endAt || s.endAt > s.startAt, {
    message: "Ngày kết thúc phải sau ngày bắt đầu",
    path: ["endAt"],
  });

/** Điều kiện Prisma "đang trong lịch" tại thời điểm `now`. */
export function inSchedule(now: Date) {
  return {
    AND: [{ OR: [{ startAt: null }, { startAt: { lte: now } }] }, { OR: [{ endAt: null }, { endAt: { gt: now } }] }],
  };
}

export function isInSchedule(s: { startAt: Date | null; endAt: Date | null }, now: Date) {
  return (!s.startAt || s.startAt <= now) && (!s.endAt || s.endAt > now);
}

/** Đã chuyển sang src/lib/schemas.ts (P21) — re-export cho banners/collections/test cũ. */
export { directionSchema, type Direction } from "@/lib/schemas";
import type { Direction } from "@/lib/schemas";

/** Đổi chỗ phần tử `id` với phần tử kề trên/dưới; null nếu không di chuyển được. */
export function moveInList<T>(ids: T[], id: T, direction: Direction): T[] | null {
  const from = ids.indexOf(id);
  const to = direction === "up" ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= ids.length) return null;
  const next = [...ids];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
