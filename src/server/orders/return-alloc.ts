/**
 * Phân bổ hàng trả về đúng lô đã xuất. Thuần, không phụ thuộc DB.
 * Các lần trả trước được coi là đã "tiêu" các phân bổ theo thứ tự cố định (theo mảng truyền vào),
 * nên chỉ cần lưu tổng số đã trả (`returnedQty`) mà vẫn biết lô nào còn có thể trả.
 */
export type AllocationSlice = { batchId: string; qty: number };

export function pickReturnBatches(
  allocations: AllocationSlice[],
  alreadyReturned: number,
  units: number,
): AllocationSlice[] {
  if (!Number.isInteger(units) || units <= 0) throw new Error("Số lượng trả phải là số nguyên dương");
  const total = allocations.reduce((s, a) => s + a.qty, 0);
  if (alreadyReturned + units > total) throw new Error(`Trả vượt số đã xuất: còn ${total - alreadyReturned}`);

  const result = new Map<string, number>();
  let skip = alreadyReturned;
  let need = units;
  for (const a of allocations) {
    if (need === 0) break;
    const usedBefore = Math.min(skip, a.qty);
    skip -= usedBefore;
    const take = Math.min(a.qty - usedBefore, need);
    if (take > 0) {
      result.set(a.batchId, (result.get(a.batchId) ?? 0) + take);
      need -= take;
    }
  }
  return [...result].map(([batchId, qty]) => ({ batchId, qty }));
}
