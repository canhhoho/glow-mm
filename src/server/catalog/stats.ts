import "server-only";
import { prisma } from "@/lib/db";
import { salesBlockDays } from "@/server/inventory/documents";
import { availableToSell } from "@/server/orders/availability";
import { preorderCapacity } from "@/server/orders/preorder";
import { AWAITING_REVIEW_WHERE, labelWhere, PRODUCT_LABELS, type ProductLabel } from "./approval-rules";
import { loadReadinessErrors } from "./readiness";

/**
 * Số liệu SP cho dashboard (P2) — cùng quy tắc với nhãn hiển thị (§4.2, `labelWhere`), không viết cứng.
 * - `byLabel`: một nhãn chính / SP (cộng lại = mọi SP kể cả ngừng KD).
 * - `awaitingReview`: hàng đợi Chờ duyệt (SP mới gửi + thay đổi của SP đã duyệt đã gửi), `rejected` tương tự.
 * - `draftIncomplete`: Nháp còn lỗi mở bán. `published.outOfStock`: đang bán, không SKU nào còn bán được;
 *   trong đó `preorder` = vẫn nhận đặt trước (SP bật đặt trước và còn hạn mức).
 * - `skus`: biến thể đang bán được của SP chưa ngừng KD (gồm combo, `combos` đếm riêng).
 */
export async function catalogStats(now = new Date()) {
  const byLabel = Object.fromEntries(
    await Promise.all(PRODUCT_LABELS.map(async (l) => [l, await prisma.product.count({ where: labelWhere(l) })] as const)),
  ) as Record<ProductLabel, number>;
  const [awaitingReview, rejected, skus, combos] = await Promise.all([
    prisma.product.count({ where: AWAITING_REVIEW_WHERE }),
    prisma.product.count({ where: { archivedAt: null, approvalStatus: "REJECTED" } }),
    prisma.variant.count({ where: { active: true, product: { archivedAt: null } } }),
    prisma.variant.count({ where: { active: true, isBundle: true, product: { archivedAt: null } } }),
  ]);

  const drafts = await prisma.product.findMany({ where: labelWhere("DRAFT"), select: { id: true } });
  const readiness = await loadReadinessErrors(prisma, drafts.map((p) => p.id));
  const draftIncomplete = drafts.filter((p) => (readiness.get(p.id)?.length ?? 0) > 0).length;

  const published = await prisma.product.findMany({
    where: labelWhere("PUBLISHED"),
    select: { id: true, preorderEnabled: true, variants: { where: { active: true }, select: { id: true, isBundle: true } } },
  });
  const variantIds = published.flatMap((p) => p.variants.map((v) => v.id));
  const blockDays = await salesBlockDays();
  const available = variantIds.length ? await availableToSell(prisma, variantIds, { now, blockDays }) : new Map<string, number>();
  const out = published.filter((p) => p.variants.length === 0 || p.variants.every((v) => (available.get(v.id) ?? 0) <= 0));
  const capacity = await preorderCapacity(prisma, out.flatMap((p) => (p.preorderEnabled ? p.variants.filter((v) => !v.isBundle).map((v) => v.id) : [])));
  const preorder = out.filter((p) => p.preorderEnabled && p.variants.some((v) => !v.isBundle && (capacity.get(v.id) ?? 0) > 0)).length;

  return {
    byLabel,
    totalProducts: PRODUCT_LABELS.reduce((sum, l) => sum + (l === "ARCHIVED" ? 0 : byLabel[l]), 0),
    awaitingReview,
    rejected,
    draftIncomplete,
    published: { total: byLabel.PUBLISHED, outOfStock: out.length, preorder },
    skus,
    combos,
  };
}
