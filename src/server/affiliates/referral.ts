/**
 * Link giới thiệu CTV (P10): `?ref=CODE` trên trang storefront → cookie `glow_ref` 30 ngày (ai bấm sau cùng thì tính).
 * Thuần (không import Next/Prisma) để proxy và test dùng chung.
 */

export const REF_COOKIE = "glow_ref";
export const REF_PARAM = "ref";
export const REF_MAX_AGE_S = 30 * 24 * 60 * 60;

/** Mã CTV: 4–12 ký tự A–Z / 0–9 (không phân biệt hoa thường khi khách gõ). Sai định dạng → null. */
export function normalizeRefCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  return /^[A-Z0-9]{4,12}$/.test(code) ? code : null;
}
