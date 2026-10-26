import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { toUnicode } from "@/lib/myanmar";

/** Giá trị mặc định khi bảng Setting chưa có key (PLAN.md: quyết định đã chốt). */
export const SETTING_DEFAULTS = {
  "expiry.blockDays": 90,
  "expiry.warnDays": 180,
  "reservation.transferHours": 24,
  "cod.confirmHours": 24,
  "pricing.roundTo": 100,
  "reorder.coverDays": 30,
  "reorder.salesWindowDays": 60,
  /** Số ngày sau khi đơn hoàn thành mới tính hoa hồng CTV là đến hạn (chờ đổi trả) — P10. */
  "affiliate.holdDays": 7,
} as const;

export type NumericSettingKey = keyof typeof SETTING_DEFAULTS;
export const NUMERIC_SETTING_KEYS = Object.keys(SETTING_DEFAULTS) as NumericSettingKey[];

export async function getNumberSetting(key: NumericSettingKey): Promise<number> {
  const row = await prisma.setting.findUnique({ where: { key } });
  const v = row?.value;
  return typeof v === "number" && Number.isFinite(v) ? v : SETTING_DEFAULTS[key];
}

/** Bật/tắt nhận đơn web (tắt khi bảo trì / chuyển server). Đơn tạo tay trong admin không bị chặn. */
export async function getBoolSetting(key: "store.checkoutEnabled"): Promise<boolean> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return typeof row?.value === "boolean" ? row.value : true;
}

export async function getStringSetting(key: "payment.bankInstructions"): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return typeof row?.value === "string" ? row.value : "";
}

/** Toàn bộ cài đặt (giá trị đang dùng, kể cả mặc định) cho trang /admin/settings. */
export async function getAllSettings() {
  const rows = await prisma.setting.findMany();
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const numbers = Object.fromEntries(
    NUMERIC_SETTING_KEYS.map((k) => {
      const v = byKey.get(k);
      return [k, typeof v === "number" && Number.isFinite(v) ? v : SETTING_DEFAULTS[k]];
    }),
  ) as Record<NumericSettingKey, number>;
  const bank = byKey.get("payment.bankInstructions");
  const checkout = byKey.get("store.checkoutEnabled");
  return {
    numbers,
    bankInstructions: typeof bank === "string" ? bank : "",
    checkoutEnabled: typeof checkout === "boolean" ? checkout : true,
  };
}

const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

export const settingsSchema = z
  .object({
    "expiry.blockDays": int(0, 730),
    "expiry.warnDays": int(0, 1095),
    "reservation.transferHours": int(1, 168),
    "cod.confirmHours": int(1, 168),
    "pricing.roundTo": int(1, 100_000),
    "reorder.coverDays": int(0, 365),
    "reorder.salesWindowDays": int(7, 365),
    "affiliate.holdDays": int(0, 90),
    "payment.bankInstructions": z.string().trim().max(1000).transform(toUnicode),
    // Không gửi → giữ nguyên giá trị hiện tại.
    "store.checkoutEnabled": z.boolean().optional(),
  })
  .refine((s) => s["expiry.warnDays"] >= s["expiry.blockDays"], {
    path: ["expiry.warnDays"],
    message: "Ngưỡng cảnh báo phải ≥ ngưỡng ngừng bán",
  });

/** Lưu toàn bộ cài đặt (một transaction) + ghi audit những key thay đổi. */
export async function saveSettings(raw: unknown, userId: string) {
  const input = settingsSchema.parse(raw);
  const before = await getAllSettings();
  const changed: Record<string, { from: number | string | boolean; to: number | string | boolean }> = {};
  for (const k of NUMERIC_SETTING_KEYS) {
    if (before.numbers[k] !== input[k]) changed[k] = { from: before.numbers[k], to: input[k] };
  }
  if (before.bankInstructions !== input["payment.bankInstructions"]) {
    changed["payment.bankInstructions"] = { from: before.bankInstructions, to: input["payment.bankInstructions"] };
  }
  const checkout = input["store.checkoutEnabled"];
  if (checkout !== undefined && checkout !== before.checkoutEnabled) {
    changed["store.checkoutEnabled"] = { from: before.checkoutEnabled, to: checkout };
  }
  if (Object.keys(changed).length === 0) return changed;

  await prisma.$transaction([
    ...Object.keys(changed).map((key) =>
      prisma.setting.upsert({
        where: { key },
        update: { value: changed[key].to },
        create: { key, value: changed[key].to },
      }),
    ),
    prisma.auditLog.create({ data: { userId, action: "settings.save", entity: "Setting", data: changed } }),
  ]);
  return changed;
}
