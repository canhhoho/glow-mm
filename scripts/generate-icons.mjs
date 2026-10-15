/**
 * Sinh icon PWA vào public/icons/ (chạy tay khi đổi logo: `node scripts/generate-icons.mjs`; ảnh được commit).
 * Dùng sharp (đi kèm Next). Logo tạm: chữ "G" trắng trên nền màu chính (#E8657A) — thay khi có logo thật.
 */
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const BRAND = "#E8657A";
const CREAM = "#FFF8F5";

/** `pad`: tỉ lệ vùng an toàn (icon maskable cần chữ nằm trong ~80% giữa). */
const svg = (size, { rounded, pad }) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="${rounded ? 22 : 0}" fill="${BRAND}"/>
  <circle cx="50" cy="50" r="${32 * pad}" fill="${CREAM}" fill-opacity="0.18"/>
  <text x="50" y="50" dy="0.35em" text-anchor="middle" font-family="Arial, Helvetica, sans-serif"
        font-weight="700" font-size="${62 * pad}" fill="#FFFFFF">G</text>
</svg>`;

const out = [
  { file: "icon-192.png", size: 192, rounded: true, pad: 1 },
  { file: "icon-512.png", size: 512, rounded: true, pad: 1 },
  { file: "icon-maskable-512.png", size: 512, rounded: false, pad: 0.8 },
  { file: "apple-touch-icon.png", size: 180, rounded: false, pad: 0.9 },
];

await mkdir("public/icons", { recursive: true });
for (const o of out) {
  await sharp(Buffer.from(svg(o.size, o))).png({ compressionLevel: 9 }).toFile(`public/icons/${o.file}`);
  console.log("✓", o.file);
}
