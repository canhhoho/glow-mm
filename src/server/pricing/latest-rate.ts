import "server-only";
import type { Tx } from "@/server/inventory/ledger";

/**
 * Tỷ giá đang có hiệu lực (P1-B, L3): mới nhất theo `effectiveAt` nhưng không ở tương lai; trùng thời điểm thì
 * lấy bản ghi sau (id). Dùng chung cho ghi sổ phiếu nhập, giá vốn tạm tính, nhập Excel.
 */
export function latestRate(db: Tx, now = new Date()) {
  return db.exchangeRate.findFirst({ where: { effectiveAt: { lte: now } }, orderBy: [{ effectiveAt: "desc" }, { id: "desc" }] });
}
