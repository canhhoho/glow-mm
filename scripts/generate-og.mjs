/**
 * Sinh ảnh chia sẻ mặc định public/og-default.png 1200×630 (chạy tay khi đổi tên/logo: `node scripts/generate-og.mjs`; ảnh được commit).
 * Dùng sharp (đi kèm Next). Tên thương hiệu khớp src/lib/brand.ts (P18).
 */
import sharp from "sharp";

const BRAND_NAME = "T&C Cosmetics";
const TAGLINE = "Vietnamese cosmetics · Myanmar";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#FFF8F5"/>
  <circle cx="1050" cy="80" r="260" fill="#E8657A" fill-opacity="0.2"/>
  <circle cx="880" cy="600" r="170" fill="#7FB89A" fill-opacity="0.2"/>
  <text x="96" y="300" font-family="'Segoe UI', Arial, Helvetica, sans-serif" font-weight="700" font-size="120" fill="#E8657A">${esc(BRAND_NAME)}</text>
  <text x="96" y="382" font-family="'Segoe UI', Arial, Helvetica, sans-serif" font-size="44" fill="#3B2F33">${esc(TAGLINE)}</text>
  <rect x="96" y="430" width="140" height="10" rx="5" fill="#7FB89A"/>
</svg>`;

await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile("public/og-default.png");
console.log("✓ og-default.png");
