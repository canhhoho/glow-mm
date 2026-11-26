/**
 * Lớp ô nhập (input/select/textarea) dùng chung — hai mật độ:
 * - `compact` (admin, h-9 = Button size `lg`): màn hình bàn phím/chuột, nhiều cột.
 * - `touch` (storefront, h-11 = Button size `touch`): vùng bấm ≥ 44px trên điện thoại.
 * `compact` nằm trong vùng `data-density="touch"` (khung cổng CTV) tự cao h-11 dưới md — CTV dùng thành phần admin
 * nhưng vẫn dễ bấm trên điện thoại (design-system §1 quyết định 5). Button size `lg` có cùng quy tắc.
 * Chuỗi thuần (không JS) → dùng được ở server lẫn client component.
 */
/** Dưới md, trong vùng `data-density="touch"`: cao 44px, chữ 16px (iOS không tự phóng to khi focus). */
export const TOUCH_ON_MOBILE = "in-data-[density=touch]:max-md:h-11 in-data-[density=touch]:max-md:text-base";

const FIELD_BASE =
  "w-full rounded-lg border border-input outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export const FIELD = {
  compact: `h-9 bg-transparent px-2.5 text-sm ${TOUCH_ON_MOBILE} ${FIELD_BASE}`,
  touch: `h-11 bg-card px-3 text-base ${FIELD_BASE}`,
} as const;

export type Density = keyof typeof FIELD;
