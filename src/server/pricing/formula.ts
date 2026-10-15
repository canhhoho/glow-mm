/**
 * Công thức giá bán (PLAN: giá = vốn VND × tỷ giá × (1 + %lãi), làm tròn LÊN tới bội số roundTo MMK).
 * Thuần, không phụ thuộc DB. Tính bằng số nguyên (BigInt) để không sai số dấu phẩy động:
 * tỷ giá tối đa 6 chữ số thập phân (khớp Decimal(14,6)), %lãi tối đa 2 chữ số (Decimal(6,2)).
 */

// Không dùng literal `123n` (tsconfig target < ES2020).
const ZERO = BigInt(0);
const ONE = BigInt(1);
const TEN = BigInt(10);
const RATE_SCALE = BigInt(1_000_000); // 6 chữ số thập phân
const PCT_SCALE = BigInt(10_000); // %lãi 2 chữ số thập phân → 100% = 10000

/** "0.170000" → 170000n (đơn vị 1e-6). Ném lỗi nếu sai định dạng hoặc quá 6 chữ số thập phân. */
export function parseScaled(value: string | number, decimals: number): bigint {
  const s = String(value).trim();
  const m = /^(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new Error(`Số không hợp lệ: ${s}`);
  const frac = (m[2] ?? "").replace(/0+$/, "");
  if (frac.length > decimals) throw new Error(`Tối đa ${decimals} chữ số thập phân: ${s}`);
  return BigInt(m[1]) * TEN ** BigInt(decimals) + BigInt(frac.padEnd(decimals, "0") || "0");
}

export function suggestPrice(input: {
  costVnd: number;
  mmkPerVnd: string | number;
  marginPct: string | number;
  roundTo: number;
}): number {
  const { costVnd, roundTo } = input;
  if (!Number.isInteger(costVnd) || costVnd < 0) throw new Error("Vốn VND phải là số nguyên ≥ 0");
  if (!Number.isInteger(roundTo) || roundTo <= 0) throw new Error("Bội số làm tròn phải > 0");
  const rate = parseScaled(input.mmkPerVnd, 6);
  if (rate <= ZERO) throw new Error("Tỷ giá phải > 0");
  const margin = parseScaled(input.marginPct, 2); // % × 100

  // giá = cost × rate/1e6 × (10000 + margin)/10000
  const num = BigInt(costVnd) * rate * (PCT_SCALE + margin);
  const den = RATE_SCALE * PCT_SCALE * BigInt(roundTo);
  const steps = (num + den - ONE) / den; // làm tròn LÊN
  return Number(steps * BigInt(roundTo));
}

/** % chênh lệch giá mới so với giá cũ (làm tròn 1 chữ số), để cảnh báo thay đổi lớn. */
export function changePct(oldPrice: number, newPrice: number): number | null {
  if (oldPrice <= 0) return null;
  return Math.round(((newPrice - oldPrice) / oldPrice) * 1000) / 10;
}
