/**
 * Lớp ô nhập (input/select/textarea) dùng chung — hai mật độ:
 * - `compact` (admin, h-9 = Button size `lg`): màn hình bàn phím/chuột, nhiều cột.
 * - `touch` (storefront + cổng CTV, h-11 = Button size `touch`): vùng bấm ≥ 44px trên điện thoại.
 * Chuỗi thuần (không JS) → dùng được ở server lẫn client component.
 */
const FIELD_BASE =
  "w-full rounded-lg border border-input outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export const FIELD = {
  compact: `h-9 bg-transparent px-2.5 text-sm ${FIELD_BASE}`,
  touch: `h-11 bg-card px-3 text-base ${FIELD_BASE}`,
} as const;

export type Density = keyof typeof FIELD;
