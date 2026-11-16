/**
 * Công thức giá bán (PLAN: giá = vốn VND ÷ tỷ giá VND/MMK × (1 + %lãi), làm tròn LÊN tới bội số roundTo MMK).
 * Thuần, không phụ thuộc DB. Tính bằng số nguyên (BigInt) để không sai số dấu phẩy động:
 * tỷ giá USD tối đa 2 chữ số thập phân (Decimal(14,2)), tỷ giá cũ MMK/VND 6 chữ số (Decimal(14,6)),
 * %lãi tối đa 2 chữ số (Decimal(6,2)).
 */

// Không dùng literal `123n` (tsconfig target < ES2020).
const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
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

type Num = string | number | { toString(): string };

/**
 * Tỷ giá như lưu ở `ExchangeRate` (nhận cả Prisma Decimal). Có 2 cột USD (P23) → dùng chúng cho chính xác tuyệt đối;
 * tỷ giá cũ (USD null) → dùng `mmkPerVnd` nhập tay.
 */
export type RateValue = { mmkPerVnd: Num; mmkPerUsd?: Num | null; vndPerUsd?: Num | null };

/** Tỷ giá MMK cho 1 VND dạng phân số `num/den`: 1 VND = mmkPerUsd / vndPerUsd MMK. */
export function rateFraction(rate: RateValue): { num: bigint; den: bigint } {
  if (rate.mmkPerUsd != null && rate.vndPerUsd != null) {
    const num = parseScaled(String(rate.mmkPerUsd), 2);
    const den = parseScaled(String(rate.vndPerUsd), 2);
    if (num <= ZERO || den <= ZERO) throw new Error("Tỷ giá phải > 0");
    return { num, den };
  }
  const num = parseScaled(String(rate.mmkPerVnd), 6);
  if (num <= ZERO) throw new Error("Tỷ giá phải > 0");
  return { num, den: RATE_SCALE };
}

/** a/b làm tròn nửa lên tới `decimals` chữ số thập phân → chuỗi "5.7778". */
function divToString(a: bigint, b: bigint, decimals: number): string {
  const scale = TEN ** BigInt(decimals);
  const q = (a * scale * TWO + b) / (b * TWO);
  return `${q / scale}.${(q % scale).toString().padStart(decimals, "0")}`;
}

/** MMK cho 1 VND (6 số lẻ) — giá trị lưu vào cột `mmkPerVnd` khi nhập qua USD. */
export function mmkPerVndFromUsd(mmkPerUsd: Num, vndPerUsd: Num): string {
  const { num, den } = rateFraction({ mmkPerVnd: 0, mmkPerUsd, vndPerUsd });
  return divToString(num, den, 6);
}

/** Tỷ giá hai chiều để hiển thị: VND cho 1 MMK (4 số lẻ) và MMK cho 1 VND (6 số lẻ). */
export function rateDisplay(rate: RateValue): { vndPerMmk: string; mmkPerVnd: string } {
  const { num, den } = rateFraction(rate);
  return { vndPerMmk: divToString(den, num, 4), mmkPerVnd: divToString(num, den, 6) };
}

/** Đổi VND → MMK theo tỷ giá, làm tròn nửa lên đến 1 MMK. */
export function convertVndToMmk(amountVnd: number, rate: RateValue): number {
  if (!Number.isInteger(amountVnd) || amountVnd < 0) throw new Error("Số tiền VND phải là số nguyên ≥ 0");
  const { num, den } = rateFraction(rate);
  return Number((BigInt(amountVnd) * num * TWO + den) / (den * TWO));
}

/** Giá MMK = vốn VND ÷ (VND cho 1 MMK) × (1 + % lãi), làm tròn LÊN bội số `roundTo`. */
export function suggestPrice(input: RateValue & { costVnd: number; marginPct: string | number; roundTo: number }): number {
  const { costVnd, roundTo } = input;
  if (!Number.isInteger(costVnd) || costVnd < 0) throw new Error("Vốn VND phải là số nguyên ≥ 0");
  if (!Number.isInteger(roundTo) || roundTo <= 0) throw new Error("Bội số làm tròn phải > 0");
  const rate = rateFraction(input);
  const margin = parseScaled(input.marginPct, 2); // % × 100

  // giá = cost × num/den × (10000 + margin)/10000
  const num = BigInt(costVnd) * rate.num * (PCT_SCALE + margin);
  const den = rate.den * PCT_SCALE * BigInt(roundTo);
  const steps = (num + den - ONE) / den; // làm tròn LÊN
  return Number(steps * BigInt(roundTo));
}

const GRAMS_PER_KG = BigInt(1000);

function assertWhole(n: number, label: string) {
  if (!Number.isInteger(n) || n < 0) throw new Error(`${label} phải là số nguyên ≥ 0`);
}

/** Phí ship MMK của một đơn vị = đơn giá MMK/kg × khối lượng (g) / 1000, làm tròn nửa lên (chỉ để hiển thị). */
export function shippingMmk(shipMmkPerKg: number, weightGrams: number): number {
  assertWhole(shipMmkPerKg, "Phí ship MMK/kg");
  assertWhole(weightGrams, "Khối lượng (g)");
  return Number((BigInt(shipMmkPerKg) * BigInt(weightGrams) * TWO + GRAMS_PER_KG) / (GRAMS_PER_KG * TWO));
}

/**
 * Kho hàng nhập VN (P24 — Kho Thắm): giá = vốn VND × tỷ giá × (1 + % lãi) + ship MMK/kg × khối lượng,
 * % lãi chỉ tính trên giá hàng; cộng chính xác (phân số) rồi làm tròn LÊN bội số `roundTo` một lần.
 */
export function priceVnImport(
  input: RateValue & { costVnd: number; marginPct: string | number; shipMmkPerKg: number; weightGrams: number; roundTo: number },
): number {
  const { costVnd, shipMmkPerKg, weightGrams, roundTo } = input;
  assertWhole(costVnd, "Vốn VND");
  assertWhole(shipMmkPerKg, "Phí ship MMK/kg");
  assertWhole(weightGrams, "Khối lượng (g)");
  if (!Number.isInteger(roundTo) || roundTo <= 0) throw new Error("Bội số làm tròn phải > 0");
  const rate = rateFraction(input);
  const margin = parseScaled(input.marginPct, 2);
  // hàng: cost × num/den × (10000+margin)/10000 ; ship: shipPerKg × g / 1000 → mẫu chung den × 10000 × 1000
  const goods = BigInt(costVnd) * rate.num * (PCT_SCALE + margin) * GRAMS_PER_KG;
  const ship = BigInt(shipMmkPerKg) * BigInt(weightGrams) * rate.den * PCT_SCALE;
  const den = rate.den * PCT_SCALE * GRAMS_PER_KG * BigInt(roundTo);
  return Number(((goods + ship + den - ONE) / den) * BigInt(roundTo));
}

/** Kho mua tại Myanmar (P24 — Kho Chi): giá = vốn MMK lô mới nhất + lãi cố định MMK của SP, làm tròn LÊN bội số `roundTo`. */
export function priceLocalMmk(input: { costMmk: number; fixedProfitMmk: number; roundTo: number }): number {
  const { costMmk, fixedProfitMmk, roundTo } = input;
  assertWhole(costMmk, "Vốn MMK");
  assertWhole(fixedProfitMmk, "Lãi cố định MMK");
  if (!Number.isInteger(roundTo) || roundTo <= 0) throw new Error("Bội số làm tròn phải > 0");
  return Math.ceil((costMmk + fixedProfitMmk) / roundTo) * roundTo;
}

/**
 * Trang Giá bán — chế độ THỦ CÔNG, kho hàng nhập VN (16/11):
 *   Giá bán VND = giá mua NCC (VND) + lãi mong muốn (VND)
 *   Giá bán MMK = Giá bán VND ÷ tỷ giá (VND cho 1 MMK) + vận chuyển (MMK/sp) + CTV (MMK/sp), làm tròn LÊN bội số `roundTo`.
 * Tính bằng phân số chính xác (cùng tỷ giá với các công thức khác), chỉ làm tròn một lần ở cuối.
 * Vd: 100.000 + 50.000 VND, 6 VND/MMK, 800 + 2.000 MMK → 25.000 + 2.800 = 27.800.
 */
export function priceVndManual(input: RateValue & { purchaseVnd: number; profitVnd: number; shipMmk: number; commissionMmk: number; roundTo: number }): number {
  const { purchaseVnd, profitVnd, shipMmk, commissionMmk, roundTo } = input;
  assertWhole(purchaseVnd, "Giá mua NCC (VND)");
  assertWhole(profitVnd, "Lãi mong muốn (VND)");
  assertWhole(shipMmk, "Vận chuyển (MMK)");
  assertWhole(commissionMmk, "CTV (MMK)");
  if (!Number.isInteger(roundTo) || roundTo <= 0) throw new Error("Bội số làm tròn phải > 0");
  const rate = rateFraction(input);
  const goods = BigInt(purchaseVnd + profitVnd) * rate.num;
  const extra = BigInt(shipMmk + commissionMmk) * rate.den;
  const den = rate.den * BigInt(roundTo);
  return Number(((goods + extra + den - ONE) / den) * BigInt(roundTo));
}

/** Giá bán VND ÷ tỷ giá → MMK chưa làm tròn (hiển thị bảng thủ công), làm tròn nửa lên tới 1 MMK. */
export function sellVndToMmk(sellVnd: number, rate: RateValue): number {
  return convertVndToMmk(sellVnd, rate);
}

/** % chênh lệch giá mới so với giá cũ (làm tròn 1 chữ số), để cảnh báo thay đổi lớn. */
export function changePct(oldPrice: number, newPrice: number): number | null {
  if (oldPrice <= 0) return null;
  return Math.round(((newPrice - oldPrice) / oldPrice) * 1000) / 10;
}
