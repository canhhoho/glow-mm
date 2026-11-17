/**
 * Bổ sung giá vốn cho lô cũ (16/11/2026): giá vốn lô VND = giá mua × tỷ giá lúc nhập (phí về kho / chuyến hàng đã bỏ).
 *
 * Chỉ lấp lô còn THIẾU giá vốn (`landedCostMmk` và `estimatedCostMmk` đều null), không thuộc chuyến hàng, có giá mua VND.
 * Lô đã có giá vốn (kể cả đã gồm phí) giữ nguyên — số liệu cũ và giá vốn đã chốt trên đơn không đổi.
 * Dùng đúng hàm của lúc ghi sổ (`lot-cost.ts`): bình quân theo SL các dòng NHẬP đã ghi sổ, đổi theo tỷ giá đã ghim trên
 * từng dòng; dòng chưa ghim tỷ giá dùng tỷ giá của lô, rồi tỷ giá mới nhất đang hiệu lực.
 *
 * An toàn: mặc định CHẠY THỬ (chỉ in kết quả, không ghi). Thêm `--apply` để ghi (một transaction). Nên sao lưu DB trước.
 *
 *   npx tsx --conditions=react-server scripts/backfill-lot-cost.ts            # chạy thử
 *   npx tsx --conditions=react-server scripts/backfill-lot-cost.ts --apply    # ghi
 *
 * Không in secret; dùng DATABASE_URL của môi trường hiện tại (kiểm tra kỹ trước khi `--apply`).
 */
import { prisma } from "../src/lib/db";
import { lotCost, lotCostMmk, type ReceiptCostLine } from "../src/server/inventory/lot-cost";
import { latestRate } from "../src/server/pricing/latest-rate";

const apply = process.argv.includes("--apply");

async function main() {
  const rate = await latestRate(prisma);
  const lots = await prisma.batch.findMany({
    where: { landedCostMmk: null, estimatedCostMmk: null, shipmentId: null, unitCostVnd: { not: null } },
    include: { rate: true, variant: { select: { sku: true } } },
    orderBy: { createdAt: "asc" },
  });
  console.log(`${apply ? "GHI" : "CHẠY THỬ"} — ${lots.length} lô VND thiếu giá vốn; tỷ giá mới nhất: ${rate ? "có" : "KHÔNG CÓ"}`);

  const updates: { id: string; sku: string; lotNo: string; costMmk: number }[] = [];
  const skipped: { sku: string; lotNo: string; reason: string }[] = [];
  for (const b of lots) {
    const posted = await prisma.stockDocumentLine.findMany({
      where: { batchId: b.id, qty: { gt: 0 }, unitCostVnd: { not: null }, document: { type: "RECEIVE", status: "POSTED" } },
      include: { rate: true },
    });
    if (posted.length === 0) {
      skipped.push({ sku: b.variant.sku, lotNo: b.lotNo, reason: "chưa có phiếu nhập đã ghi sổ" });
      continue;
    }
    const lines: ReceiptCostLine[] = posted.map((l) => ({ qty: l.qty, unitCostVnd: l.unitCostVnd, unitCostMmk: null, landedCostVnd: null, rateId: l.rateId, rate: l.rate }));
    const avg = lotCost(lines).unitCostVnd;
    const costMmk = avg == null ? null : lotCostMmk(lines, avg, b.rate ?? rate);
    if (costMmk == null) {
      skipped.push({ sku: b.variant.sku, lotNo: b.lotNo, reason: "chưa có tỷ giá" });
      continue;
    }
    updates.push({ id: b.id, sku: b.variant.sku, lotNo: b.lotNo, costMmk });
  }

  for (const u of updates.slice(0, 50)) console.log(`  ${u.sku} · ${u.lotNo} → ${u.costMmk} MMK/đv`);
  if (updates.length > 50) console.log(`  … và ${updates.length - 50} lô nữa`);
  for (const s of skipped.slice(0, 50)) console.log(`  BỎ QUA ${s.sku} · ${s.lotNo}: ${s.reason}`);

  if (apply && updates.length) {
    await prisma.$transaction(async (tx) => {
      for (const u of updates) await tx.batch.update({ where: { id: u.id }, data: { landedCostMmk: u.costMmk } });
    });
  }
  console.log(`${apply ? "Đã ghi" : "Sẽ ghi"} ${updates.length} lô; bỏ qua ${skipped.length} lô.${apply ? "" : " Thêm --apply để ghi."}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
