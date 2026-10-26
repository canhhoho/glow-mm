/** Cây CTV (P11) — hàm thuần. */

/**
 * Gắn `parentId` làm cấp trên của `id` có tạo vòng không: đi ngược chuỗi cấp trên từ `parentId`;
 * gặp lại `id` (kể cả chính nó) → vòng. Dừng nếu dữ liệu đã có vòng (không lặp vô hạn).
 */
export function wouldCreateCycle(id: string, parentId: string, parentOf: Map<string, string | null>): boolean {
  const seen = new Set<string>();
  for (let cur: string | null | undefined = parentId; cur; cur = parentOf.get(cur)) {
    if (cur === id) return true;
    if (seen.has(cur)) return true;
    seen.add(cur);
  }
  return false;
}
