/** Tiền luôn là số nguyên (MMK, VND). */

export function formatMmk(amount: number, locale: string = "my"): string {
  const n = new Intl.NumberFormat(locale === "my" ? "en-US" : locale).format(amount);
  return locale === "my" ? `${n} ကျပ်` : `${n} MMK`;
}

/** Làm tròn LÊN tới bội số `step` (mặc định 100 MMK). */
export function roundUpTo(amount: number, step = 100): number {
  if (step <= 0) throw new Error("step phải > 0");
  return Math.ceil(amount / step) * step;
}
