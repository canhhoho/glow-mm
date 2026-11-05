/** Cảnh báo minh họa ở bản xem trước; không thay chính sách hay chặn áp giá. */
export function priceRisks(input: { oldPriceMmk: number; priceMmk: number; costMmk: number | null; shipMmk: number; commissionBp: number }) {
  const { oldPriceMmk, priceMmk, costMmk, shipMmk, commissionBp } = input;
  const profit = costMmk == null ? null : priceMmk - costMmk - shipMmk - Math.round(priceMmk * commissionBp / 10000);
  return { profit, lowMargin: profit != null && profit <= priceMmk * .05, largeChange: oldPriceMmk > 0 && Math.abs(priceMmk-oldPriceMmk)*100 >= oldPriceMmk*20 };
}
