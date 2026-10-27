import "server-only";
import { prisma } from "@/lib/db";
import type { Tx } from "@/server/inventory/ledger";

/**
 * Danh mục địa chỉ người nhận VTP Myanmar (P15): Vùng → Huyện → Thị trấn.
 * Form chỉ gửi `townshipId`; server luôn tra lại cả 3 cấp (đang hoạt động) trước khi lưu.
 */

/** Tag cache của danh mục địa chỉ — action admin sửa tên / bật tắt gọi `updateTag(LOCATIONS_TAG)`. */
export const LOCATIONS_TAG = "locations";

/** Cây gọn gửi xuống form chọn địa chỉ (client): chỉ id + tên theo ngôn ngữ, chỉ mục đang hoạt động. */
export type AddressCatalog = { id: string; name: string; districts: { id: string; name: string; townships: { id: string; name: string }[] }[] }[];

/** `my` → tên Myanmar; ngôn ngữ khác (en, vi của admin) → tên tiếng Anh như VTP. */
const pick = (locale: string, row: { nameEn: string; nameMy: string }) => (locale === "my" ? row.nameMy : row.nameEn);

export async function loadAddressCatalog(locale: string): Promise<AddressCatalog> {
  const states = await prisma.mmState.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    include: {
      districts: {
        where: { active: true },
        orderBy: { sortOrder: "asc" },
        include: { townships: { where: { active: true }, orderBy: { sortOrder: "asc" } } },
      },
    },
  });
  return states
    .map((s) => ({
      id: s.id,
      name: pick(locale, s),
      districts: s.districts
        .map((d) => ({ id: d.id, name: pick(locale, d), townships: d.townships.map((t) => ({ id: t.id, name: pick(locale, t) })) }))
        .filter((d) => d.townships.length > 0),
    }))
    .filter((s) => s.districts.length > 0);
}

/** Thị trấn + huyện + vùng nếu cả 3 đang hoạt động, ngược lại null. */
export function findActiveTownship(id: string, db: Tx | typeof prisma = prisma) {
  return db.mmTownship.findFirst({
    where: { id, active: true, district: { active: true, state: { active: true } } },
    include: { district: { include: { state: true } } },
  });
}
export type TownshipPath = NonNullable<Awaited<ReturnType<typeof findActiveTownship>>>;

/** Chuỗi hiển thị / snapshot trên đơn: "Thị trấn, Huyện, Vùng" — tiếng Anh như VTP, kèm tên Myanmar để shipper đọc. */
export function townshipLabel(t: { nameEn: string; nameMy: string; district: { nameEn: string; state: { nameEn: string } } }) {
  return `${t.nameEn}, ${t.district.nameEn}, ${t.district.state.nameEn} (${t.nameMy})`;
}

/** Mã VTP 3 cấp chốt vào đơn. */
export const vtpCodes = (t: TownshipPath) => ({
  stateCode: t.district.state.code,
  districtCode: t.district.code,
  townshipCode: t.code,
});
