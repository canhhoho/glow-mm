/**
 * Danh mục địa chỉ người nhận của VTP Myanmar (P15): Liên bang/Vùng → Huyện → Thị trấn, mỗi cấp có mã VTP.
 * Mã KHÔNG duy nhất toàn cục (vd `MYA` = Huyện Monywa và Thị trấn Madaya) → luôn dùng kèm cấp cha.
 * Hàm thuần (không import Next/Prisma) — dùng cho script sinh dữ liệu + unit test.
 */

export type VtpTownship = { code: string; nameEn: string; nameMy: string };
export type VtpDistrict = VtpTownship & { townships: VtpTownship[] };
export type VtpState = VtpTownship & { districts: VtpDistrict[] };

/** `Dagon Myothit (South) (SDG)` → { name: "Dagon Myothit (South)", code: "SDG" } (mã = cặp ngoặc cuối). */
export function parseNamed(raw: string): { nameEn: string; code: string } {
  const m = /^(.*\S)\s*\(([A-Z0-9]+)\)\s*$/.exec(raw.trim());
  if (!m) throw new Error(`Không đọc được mục: "${raw}"`);
  return { nameEn: m[1].trim().replace(/\s+/g, " "), code: m[2] };
}

/**
 * Đọc phần "Danh mục chi tiết" của file vtp_myanmar_receiver_address.md:
 * `### Vùng (MÃ)` rồi các dòng `- Huyện (MÃ): Thị trấn (MÃ), Thị trấn (MÃ)`. Giữ đúng thứ tự trong file.
 * `nameMy(nameEn)` trả tên Myanmar (nháp) — thiếu thì dùng tên tiếng Anh.
 */
export function parseVtpMarkdown(md: string, nameMy: (nameEn: string) => string | undefined = () => undefined): VtpState[] {
  const states: VtpState[] = [];
  const my = (en: string) => nameMy(en) ?? en;
  const section = md.split(/^## Danh mục chi tiết\s*$/m)[1]?.split(/^## /m)[0];
  if (!section) throw new Error("Thiếu mục '## Danh mục chi tiết'");
  for (const line of section.split(/\r?\n/)) {
    const state = /^###\s+(.+)$/.exec(line);
    if (state) {
      const s = parseNamed(state[1]);
      states.push({ ...s, nameMy: my(s.nameEn), districts: [] });
      continue;
    }
    const district = /^-\s+(.+?\([A-Z0-9]+\)):\s*(.+)$/.exec(line);
    if (district) {
      const current = states.at(-1);
      if (!current) throw new Error(`Huyện nằm ngoài vùng: "${line}"`);
      const d = parseNamed(district[1]);
      // Tách theo "), " — tên có thể chứa ngoặc, vd "Dagon Myothit (South) (SDG)".
      const townships = district[2].split(/(?<=\)),\s*/).map((t) => {
        const tw = parseNamed(t);
        return { ...tw, nameMy: my(tw.nameEn) };
      });
      current.districts.push({ ...d, nameMy: my(d.nameEn), townships });
    }
  }
  return states;
}

/** id ổn định theo đường mã (giống nhau ở mọi môi trường): st-YGN, ds-YGN-WYG, tw-YGN-WYG-KMY. */
export const stateId = (s: string) => `st-${s}`;
export const districtId = (s: string, d: string) => `ds-${s}-${d}`;
export const townshipId = (s: string, d: string, t: string) => `tw-${s}-${d}-${t}`;
