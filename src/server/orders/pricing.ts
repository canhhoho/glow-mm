/** Tính tiền đơn. Thuần, không phụ thuộc DB. (Chuẩn hoá SĐT: src/lib/phone.ts.) */

export type PricedItem = { variantId: string; qty: number; unitPriceMmk: number };

export function orderTotals(items: PricedItem[], shippingFeeMmk: number) {
  for (const i of items) {
    if (!Number.isInteger(i.qty) || i.qty <= 0) throw new Error("Số lượng không hợp lệ");
    if (!Number.isInteger(i.unitPriceMmk) || i.unitPriceMmk < 0) throw new Error("Giá không hợp lệ");
  }
  if (!Number.isInteger(shippingFeeMmk) || shippingFeeMmk < 0) throw new Error("Phí ship không hợp lệ");
  const subtotalMmk = items.reduce((s, i) => s + i.qty * i.unitPriceMmk, 0);
  return { subtotalMmk, shippingFeeMmk, totalMmk: subtotalMmk + shippingFeeMmk };
}
