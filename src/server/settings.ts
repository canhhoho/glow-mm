import "server-only";
import { prisma } from "@/lib/db";

/** Giá trị mặc định khi bảng Setting chưa có key (PLAN.md: quyết định đã chốt). */
export const SETTING_DEFAULTS = {
  "expiry.blockDays": 90,
  "expiry.warnDays": 180,
  "reservation.transferHours": 24,
  "cod.confirmHours": 24,
  "pricing.roundTo": 100,
} as const;

export type NumericSettingKey = keyof typeof SETTING_DEFAULTS;

export async function getNumberSetting(key: NumericSettingKey): Promise<number> {
  const row = await prisma.setting.findUnique({ where: { key } });
  const v = row?.value;
  return typeof v === "number" && Number.isFinite(v) ? v : SETTING_DEFAULTS[key];
}
