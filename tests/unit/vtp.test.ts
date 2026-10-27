import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseNamed, parseVtpMarkdown, townshipId } from "@/server/locations/vtp";

const md = readFileSync("vtp_myanmar_receiver_address.md", "utf8");
const data = JSON.parse(readFileSync("prisma/data/vtp-myanmar-addresses.json", "utf8"));

describe("Danh mục địa chỉ VTP Myanmar (P15)", () => {
  it("đọc tên + mã, kể cả tên có ngoặc và khoảng trắng thừa", () => {
    expect(parseNamed("Dagon Myothit (South) (SDG)")).toEqual({ nameEn: "Dagon Myothit (South)", code: "SDG" });
    expect(parseNamed("  Det Khi Na Thi Ri  (DKN) ")).toEqual({ nameEn: "Det Khi Na Thi Ri", code: "DKN" });
    expect(() => parseNamed("Không có mã")).toThrow();
  });

  it("đủ 15 vùng / 74 huyện / 329 thị trấn, giữ thứ tự VTP", () => {
    const states = parseVtpMarkdown(md);
    const districts = states.flatMap((s) => s.districts);
    expect([states.length, districts.length, districts.flatMap((d) => d.townships).length]).toEqual([15, 74, 329]);
    expect(states.map((s) => s.code).slice(0, 3)).toEqual(["SGG", "MGY", "KCN"]);
    const west = states.find((s) => s.code === "YGN")!.districts.find((d) => d.code === "WYG")!;
    expect(west.nameEn).toBe("Yangon (West)");
    expect(west.townships.find((t) => t.code === "KMY")?.nameEn).toBe("Kamaryut");
  });

  it("mã trùng giữa các cấp vẫn gắn đúng cha (MYA = huyện Monywa và thị trấn Madaya)", () => {
    const states = parseVtpMarkdown(md);
    const sgg = states.find((s) => s.code === "SGG")!;
    expect(sgg.districts.find((d) => d.code === "MYA")?.nameEn).toBe("Monywa");
    const mdy = states.find((s) => s.code === "MDY")!;
    expect(mdy.districts.find((d) => d.code === "POL")!.townships.find((t) => t.code === "MYA")?.nameEn).toBe("Madaya");
    expect(townshipId("MDY", "POL", "MYA")).toBe("tw-MDY-POL-MYA");
  });

  it("file JSON đã commit khớp file nguồn và mọi mục có tên Myanmar", () => {
    const parsed = parseVtpMarkdown(md);
    const strip = (x: unknown) => JSON.parse(JSON.stringify(x, (k, v) => (k === "nameMy" ? undefined : v)));
    expect(strip(data)).toEqual(strip(parsed));
    const all = data.flatMap((s: { nameMy: string; nameEn: string; districts: { nameMy: string; nameEn: string; townships: { nameMy: string; nameEn: string }[] }[] }) => [
      s,
      ...s.districts.flatMap((d) => [d, ...d.townships]),
    ]);
    expect(all.filter((x: { nameMy: string; nameEn: string }) => !/[က-႟]/.test(x.nameMy))).toEqual([]);
  });
});
