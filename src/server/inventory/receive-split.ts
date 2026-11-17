/**
 * Phiếu NHẬP nháp tách theo kho (Phase 3, 16/11/2026): form gửi mỗi dòng kèm `toId` (kho của sản phẩm), server tách thành
 * mỗi kho một phiếu nháp. Hàm thuần (không DB) — chỉ nhóm dòng; kiểm tra nghiệp vụ nằm ở `documents.ts`.
 */

export type SplitGroup = { toId: string; payload: Record<string, unknown> };

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * Nhóm dòng theo `line.toId` (thiếu thì dùng `toId` cấp phiếu — payload cũ/Excel), giữ thứ tự xuất hiện đầu tiên.
 * - Khối lượng (`weights`) chỉ gửi cho MỘT phiếu: phiếu đầu tiên có biến thể đó (khối lượng không phụ thuộc kho).
 * - Khoá chống trùng: một nhóm → giữ nguyên; nhiều nhóm → `${key}:${toId}` (gửi lại cùng form ra cùng các khoá).
 * - Payload sai cấu trúc trả về nguyên một nhóm để schema Zod báo lỗi đúng chỗ.
 */
export function splitReceivePayload(raw: unknown): SplitGroup[] {
  if (!isRecord(raw) || !Array.isArray(raw.lines)) return [{ toId: String((raw as { toId?: unknown } | null)?.toId ?? ""), payload: isRecord(raw) ? raw : {} }];
  const fallback = typeof raw.toId === "string" && raw.toId ? raw.toId : "";
  const order: string[] = [];
  const byWarehouse = new Map<string, Record<string, unknown>[]>();
  for (const line of raw.lines) {
    if (!isRecord(line)) return [{ toId: fallback, payload: raw }];
    const toId = typeof line.toId === "string" && line.toId ? line.toId : fallback;
    if (!toId) return [{ toId: "", payload: raw }];
    const { toId: _drop, ...rest } = line;
    void _drop;
    if (!byWarehouse.has(toId)) {
      byWarehouse.set(toId, []);
      order.push(toId);
    }
    byWarehouse.get(toId)!.push(rest);
  }
  if (order.length === 0) return [{ toId: fallback, payload: raw }];

  const key = typeof raw.idempotencyKey === "string" && raw.idempotencyKey ? raw.idempotencyKey : undefined;
  const weights = Array.isArray(raw.weights) ? raw.weights.filter(isRecord) : [];
  const firstGroupOf = new Map<string, string>();
  for (const toId of order) for (const l of byWarehouse.get(toId)!) if (typeof l.variantId === "string" && !firstGroupOf.has(l.variantId)) firstGroupOf.set(l.variantId, toId);

  return order.map((toId) => {
    const payload: Record<string, unknown> = { ...raw, toId, lines: byWarehouse.get(toId)! };
    if (weights.length) {
      // Biến thể không có dòng nào → để ở nhóm đầu, schema/fillWeights báo "chỉ nhập cho SKU có trong phiếu".
      const mine = weights.filter((w) => (firstGroupOf.get(String(w.variantId)) ?? order[0]) === toId);
      payload.weights = mine;
    }
    if (key && order.length > 1) payload.idempotencyKey = `${key}:${toId}`;
    return { toId, payload };
  });
}
