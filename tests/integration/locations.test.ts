import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { searchTownships, updateLocations } from "@/server/locations/admin";
import { findActiveTownship, loadAddressCatalog } from "@/server/locations/locations";

const ACTOR = "it-runner";
const TW = "tw-YGN-SYG-DLA"; // Dala, Yangon (South)
const DS = "ds-YGN-SYG";

async function actor() {
  await prisma.user.upsert({
    where: { email: "it-runner@glow.local" },
    update: {},
    create: { id: ACTOR, email: "it-runner@glow.local", name: "IT", role: "ADMIN" },
  });
}

const row = async (level: "district" | "township", id: string, patch: { active?: boolean; nameMy?: string }) => {
  const cur =
    level === "district" ? await prisma.mmDistrict.findUniqueOrThrow({ where: { id } }) : await prisma.mmTownship.findUniqueOrThrow({ where: { id } });
  return { level, id, nameEn: cur.nameEn, nameMy: patch.nameMy ?? cur.nameMy, active: patch.active ?? cur.active };
};

afterEach(async () => {
  await prisma.mmTownship.update({ where: { id: TW }, data: { active: true, nameMy: "ဒလ" } });
  await prisma.mmDistrict.update({ where: { id: DS }, data: { active: true } });
});

describe("Quản trị địa bàn VTP (P15b)", () => {
  it("chỉ ghi dòng thay đổi + AuditLog; tên Zawgyi → Unicode", async () => {
    await actor();
    const before = await prisma.auditLog.count({ where: { action: "locations.update" } });
    expect(await updateLocations([await row("township", TW, {}), await row("district", DS, {})], ACTOR)).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "locations.update" } })).toBe(before);

    expect(await updateLocations([await row("township", TW, { nameMy: "ဒလ (စမ်း)" })], ACTOR)).toBe(1);
    expect((await prisma.mmTownship.findUniqueOrThrow({ where: { id: TW } })).nameMy).toBe("ဒလ (စမ်း)");
    expect(await prisma.auditLog.count({ where: { action: "locations.update" } })).toBe(before + 1);
    await expect(updateLocations([{ ...(await row("township", TW, {})), nameEn: " " }], ACTOR)).rejects.toThrow();
  });

  it("tắt thị trấn / tắt huyện → không còn trong danh mục chọn địa chỉ và không đặt được", async () => {
    await actor();
    const has = async () =>
      (await loadAddressCatalog("en")).find((s) => s.id === "st-YGN")!.districts.flatMap((d) => d.townships).some((t) => t.id === TW);
    expect(await has()).toBe(true);

    await updateLocations([await row("township", TW, { active: false })], ACTOR);
    expect(await has()).toBe(false);
    expect(await findActiveTownship(TW)).toBeNull();

    await updateLocations([await row("township", TW, { active: true }), await row("district", DS, { active: false })], ACTOR);
    expect(await has()).toBe(false);
    expect(await findActiveTownship(TW)).toBeNull();
    // Cờ của thị trấn không bị đổi khi tắt cấp cha.
    expect((await prisma.mmTownship.findUniqueOrThrow({ where: { id: TW } })).active).toBe(true);
  });

  it("tìm thị trấn theo tên Anh / Myanmar / mã VTP", async () => {
    expect((await searchTownships("kamar")).map((t) => t.id)).toContain("tw-YGN-WYG-KMY");
    expect((await searchTownships("ကမာရွတ်")).map((t) => t.id)).toContain("tw-YGN-WYG-KMY");
    expect((await searchTownships("kmy")).map((t) => t.id)).toContain("tw-YGN-WYG-KMY");
  });
});
