import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { toUnicode } from "@/lib/myanmar";

/**
 * Quản trị danh mục địa bàn VTP (P15b): sửa tên (tiếng Anh / Myanmar) và bật/tắt "đang giao" từng vùng, huyện, thị trấn.
 * Mã VTP chỉ đọc. Tắt cấp cha → cấp con không còn trong form chọn địa chỉ (lọc ở `loadAddressCatalog` /
 * `findActiveTownship`), không đổi cờ của cấp con.
 */

export type LocationLevel = "state" | "district" | "township";

const name = z.string().trim().min(1).max(100);

export const locationRowSchema = z.object({
  level: z.enum(["state", "district", "township"]),
  id: z.string().min(1),
  nameEn: name,
  nameMy: name.transform(toUnicode),
  active: z.boolean(),
});
export type LocationRowInput = z.input<typeof locationRowSchema>;

/** 15 vùng kèm số huyện / thị trấn (đang giao / tổng). */
export async function listLocationStates() {
  const [states, townships] = await Promise.all([
    prisma.mmState.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { districts: true } } } }),
    prisma.mmTownship.findMany({ select: { active: true, district: { select: { stateId: true } } } }),
  ]);
  const count = new Map<string, { total: number; active: number }>();
  for (const t of townships) {
    const c = count.get(t.district.stateId) ?? { total: 0, active: 0 };
    c.total++;
    if (t.active) c.active++;
    count.set(t.district.stateId, c);
  }
  return states.map((s) => ({ ...s, townships: count.get(s.id) ?? { total: 0, active: 0 } }));
}

/** Một vùng với toàn bộ huyện + thị trấn (kể cả đang tắt). */
export function getLocationState(stateId: string) {
  return prisma.mmState.findUnique({
    where: { id: stateId },
    include: {
      districts: { orderBy: { sortOrder: "asc" }, include: { townships: { orderBy: { sortOrder: "asc" } } } },
    },
  });
}

/** Tìm thị trấn theo tên (Anh/Myanmar) hoặc mã VTP, tối đa 100 dòng. */
export function searchTownships(q: string) {
  const term = toUnicode(q.trim());
  return prisma.mmTownship.findMany({
    where: {
      OR: [
        { nameEn: { contains: term, mode: "insensitive" } },
        { nameMy: { contains: term } },
        { code: { equals: term.toUpperCase() } },
      ],
    },
    orderBy: [{ district: { state: { sortOrder: "asc" } } }, { district: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    take: 100,
    include: { district: { include: { state: true } } },
  });
}

/** Lưu các dòng đã gửi; chỉ ghi dòng có thay đổi, ghi một AuditLog tóm tắt. Trả số dòng đã đổi. */
export async function updateLocations(raw: unknown, actorId: string): Promise<number> {
  const rows = z.array(locationRowSchema).max(500).parse(raw);
  return prisma.$transaction(async (tx) => {
    const changed: { level: LocationLevel; id: string; from: object; to: object }[] = [];
    for (const r of rows) {
      const data = { nameEn: r.nameEn, nameMy: r.nameMy, active: r.active };
      const select = { nameEn: true, nameMy: true, active: true } as const;
      const current =
        r.level === "state"
          ? await tx.mmState.findUnique({ where: { id: r.id }, select })
          : r.level === "district"
            ? await tx.mmDistrict.findUnique({ where: { id: r.id }, select })
            : await tx.mmTownship.findUnique({ where: { id: r.id }, select });
      if (!current) continue;
      if (current.nameEn === data.nameEn && current.nameMy === data.nameMy && current.active === data.active) continue;
      if (r.level === "state") await tx.mmState.update({ where: { id: r.id }, data });
      else if (r.level === "district") await tx.mmDistrict.update({ where: { id: r.id }, data });
      else await tx.mmTownship.update({ where: { id: r.id }, data });
      changed.push({ level: r.level, id: r.id, from: current, to: data });
    }
    if (changed.length) {
      await tx.auditLog.create({
        data: { userId: actorId, action: "locations.update", entity: "MmTownship", data: { changed } },
      });
    }
    return changed.length;
  });
}
