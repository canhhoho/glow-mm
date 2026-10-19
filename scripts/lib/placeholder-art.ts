/**
 * Ảnh minh hoạ tự vẽ (SVG → WebP) cho bản Preview: không dùng ảnh của người khác nên không dính bản quyền.
 * Thuần (trừ `toWebp` dùng sharp), không đụng DB — test bằng Vitest.
 * Màu theo token thương hiệu (globals.css); sắc độ đổi theo slug để các SP khác nhau.
 * Chỉ vẽ chữ Latin: chữ Myanmar qua librsvg/sharp chưa kiểm chứng [CẦN XÁC MINH].
 */
import sharp from "sharp";

export const BRAND = "#E8657A";
export const BRAND_2 = "#7FB89A";
export const CREAM = "#FFF8F5";
export const INK = "#2B2B2B";
const FONT = "Segoe UI, Arial, Helvetica, sans-serif";

export function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
}

/** Sắc độ 0–359 ổn định theo chuỗi (cùng slug → cùng màu). */
export function hueOf(seed: string): number {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.codePointAt(0)!) % 360;
  return h;
}

/** Ngắt dòng theo từ, mỗi dòng ≤ `max` ký tự, tối đa `lines` dòng (dòng cuối thêm "…" nếu còn chữ). */
export function wrapText(text: string, max: number, lines: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const word of text.trim().split(/\s+/)) {
    const next = cur ? `${cur} ${word}` : word;
    if (next.length <= max || !cur) cur = next.length > max ? `${next.slice(0, max - 1)}…` : next;
    else {
      out.push(cur);
      cur = word.length > max ? `${word.slice(0, max - 1)}…` : word;
    }
  }
  if (cur) out.push(cur);
  if (out.length <= lines) return out;
  const kept = out.slice(0, lines);
  kept[lines - 1] = `${kept[lines - 1].replace(/…$/, "").slice(0, max - 1)}…`;
  return kept;
}

const demoTag = (x: number, y: number, size: number) =>
  `<g transform="translate(${x} ${y})"><rect x="${-size * 1.9}" y="${-size * 0.8}" width="${size * 3.8}" height="${size * 1.5}" rx="${size * 0.75}" fill="${INK}" fill-opacity="0.75"/>` +
  `<text x="0" y="0" dy="0.35em" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="${size}" fill="#FFFFFF" letter-spacing="2">DEMO</text></g>`;

/** Ảnh sản phẩm vuông 800×800: nền pastel + dáng chai + thương hiệu, tên, dung tích. */
export function productSvg(p: { brand: string; name: string; label: string; hue: number }): string {
  const lines = wrapText(p.name, 22, 3);
  const bg1 = `hsl(${p.hue} 70% 95%)`;
  const bg2 = `hsl(${p.hue} 55% 86%)`;
  const bottle = `hsl(${p.hue} 45% 70%)`;
  const text = lines
    .map((l, i) => `<tspan x="400" dy="${i === 0 ? 0 : 52}">${escapeXml(l)}</tspan>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></linearGradient></defs>
  <rect width="800" height="800" fill="url(#g)"/>
  <rect x="340" y="90" width="120" height="60" rx="14" fill="${INK}" fill-opacity="0.18"/>
  <rect x="300" y="140" width="200" height="260" rx="40" fill="${bottle}"/>
  <rect x="330" y="230" width="140" height="90" rx="12" fill="${CREAM}" fill-opacity="0.85"/>
  <text x="400" y="460" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="34" fill="${BRAND}" letter-spacing="3">${escapeXml(p.brand.toUpperCase())}</text>
  <text x="400" y="530" text-anchor="middle" font-family="${FONT}" font-weight="600" font-size="42" fill="${INK}">${text}</text>
  <text x="400" y="${530 + lines.length * 52 + 20}" text-anchor="middle" font-family="${FONT}" font-size="32" fill="${INK}" fill-opacity="0.6">${escapeXml(p.label)}</text>
  ${demoTag(400, 740, 26)}
</svg>`;
}

/** Banner trang chủ (desktop 1500×500 hoặc mobile 750×500). */
export function bannerSvg(b: { title: string; subtitle: string; w: number; h: number; hue: number }): string {
  const small = b.w < 1000;
  const titleSize = small ? 56 : 72;
  const lines = wrapText(b.title, small ? 18 : 30, 2);
  const title = lines
    .map((l, i) => `<tspan x="${b.w * 0.08}" dy="${i === 0 ? 0 : titleSize * 1.15}">${escapeXml(l)}</tspan>`)
    .join("");
  const subY = b.h * 0.42 + lines.length * titleSize * 1.15;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${b.w}" height="${b.h}" viewBox="0 0 ${b.w} ${b.h}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${CREAM}"/><stop offset="1" stop-color="hsl(${b.hue} 65% 85%)"/></linearGradient></defs>
  <rect width="${b.w}" height="${b.h}" fill="url(#g)"/>
  <circle cx="${b.w * 0.82}" cy="${b.h * 0.5}" r="${b.h * 0.42}" fill="${BRAND}" fill-opacity="0.18"/>
  <circle cx="${b.w * 0.9}" cy="${b.h * 0.25}" r="${b.h * 0.16}" fill="${BRAND_2}" fill-opacity="0.35"/>
  <text x="${b.w * 0.08}" y="${b.h * 0.42}" font-family="${FONT}" font-weight="700" font-size="${titleSize}" fill="${INK}">${title}</text>
  <text x="${b.w * 0.08}" y="${subY}" font-family="${FONT}" font-size="${small ? 30 : 36}" fill="${BRAND}">${escapeXml(b.subtitle)}</text>
  ${demoTag(b.w - (small ? 90 : 120), b.h - 50, small ? 22 : 26)}
</svg>`;
}

/** Icon danh mục 256×256: chữ cái đầu trên nền tròn. */
export function iconSvg(i: { letter: string; hue: number }): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <rect width="256" height="256" fill="${CREAM}"/>
  <circle cx="128" cy="128" r="104" fill="hsl(${i.hue} 60% 86%)"/>
  <text x="128" y="128" dy="0.35em" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="112" fill="${INK}">${escapeXml(i.letter.slice(0, 1).toUpperCase())}</text>
</svg>`;
}

/** SVG → WebP (ảnh mobile banner cần nhỏ, ~≤ 60KB theo ghi chú hiệu năng P6). */
export async function toWebp(svg: string, quality = 80): Promise<Buffer> {
  return sharp(Buffer.from(svg)).webp({ quality }).toBuffer();
}
