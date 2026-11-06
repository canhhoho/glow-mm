/**
 * Cảnh báo minh họa ở bản xem trước; không thay chính sách hay chặn áp giá.
 * Hoa hồng: biến thể có mức CTV cố định → mức đó + % tầng trên; không có → % mặc định (người bán + tầng trên).
 */
export function priceRisks(input: {
  oldPriceMmk: number;
  priceMmk: number;
  costMmk: number | null;
  shipMmk: number;
  commissionBp: number;
  fixedCommissionMmk?: number | null;
  uplineBp?: number;
}) {
  const { oldPriceMmk, priceMmk, costMmk, shipMmk, commissionBp, fixedCommissionMmk, uplineBp = 0 } = input;
  const commission = fixedCommissionMmk != null ? fixedCommissionMmk + Math.round(priceMmk * uplineBp / 10000) : Math.round(priceMmk * commissionBp / 10000);
  const profit = costMmk == null ? null : priceMmk - costMmk - shipMmk - commission;
  return { profit, lowMargin: profit != null && profit <= priceMmk * .05, largeChange: oldPriceMmk > 0 && Math.abs(priceMmk-oldPriceMmk)*100 >= oldPriceMmk*20 };
}
