/**
 * Quy tắc chọn lô ở form phiếu kho (chuyển / xuất / điều chỉnh) — thuần, dùng chung cho danh sách lô hiện ra và việc
 * bỏ chọn lô không còn hợp lệ khi đổi kho / loại tồn, để giao diện và dữ liệu gửi đi không lệch nhau.
 * Server vẫn kiểm tra lại khi tạo / ghi sổ phiếu.
 */
export type FormBatchLike = {
  id: string;
  variantId: string;
  /** Lô đã có sổ kho; lô chỉ có ở phiếu nhập nháp không điều chỉnh được. */
  posted?: boolean;
  balances: { locationId: string; stockType: string; qty: number }[];
};

type DocKind = "RECEIVE" | "TRANSFER" | "ISSUE" | "ADJUST";

/** Số lượng của lô tại một vị trí theo loại tồn. */
export function batchQtyAt(b: Pick<FormBatchLike, "balances">, locationId: string, stockType: string): number {
  return b.balances.find((x) => x.locationId === locationId && x.stockType === stockType)?.qty ?? 0;
}

/**
 * Lô được chọn ở dòng phiếu: điều chỉnh → mọi lô đã có sổ kho (kể cả đang 0 ở vị trí này, để nhập thừa); chuyển / xuất →
 * lô còn hàng ở kho xuất theo loại tồn của dòng.
 */
export function batchSelectable(type: DocKind, b: FormBatchLike, stockLocationId: string, stockType: string): boolean {
  return type === "ADJUST" ? b.posted !== false : batchQtyAt(b, stockLocationId, stockType) > 0;
}

/** Bỏ chọn lô không còn hợp lệ (đổi kho / loại tồn); trả số dòng bị bỏ để báo cho người dùng. */
export function keepValidBatches<L extends { variantId: string; batchId: string; stockType: string }>(
  lines: L[],
  batches: FormBatchLike[],
  type: DocKind,
  stockLocationId: string,
): { lines: L[]; cleared: number } {
  let cleared = 0;
  const next = lines.map((l) => {
    if (!l.batchId) return l;
    const b = batches.find((x) => x.id === l.batchId && x.variantId === l.variantId);
    if (b && batchSelectable(type, b, stockLocationId, l.stockType)) return l;
    cleared++;
    return { ...l, batchId: "" };
  });
  return { lines: next, cleared };
}
