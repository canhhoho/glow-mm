import "server-only";
import { prisma } from "@/lib/db";
import { addDays, dayRange, yangonDayKey, yangonDayStart } from "@/lib/time";
import { NOT_RECEIVED_VARIANT } from "@/server/inventory/overview";
import { productName } from "@/server/inventory/queries";
import { deriveLabel } from "@/server/catalog/approval-rules";

/**
 * Số liệu dashboard (P3, thiết kế "Dashboard") — mọi số lấy từ dữ liệu thật, không viết cứng.
 * Xu hướng = thay đổi trong `days` ngày gần nhất (theo ngày Asia/Yangon).
 */
export const DASHBOARD_RANGES = [7, 30] as const;

/** Hoạt động SP theo ngày (từ nhật ký): tạo mới, gửi duyệt, đăng bán. */
export async function productActivity(days: number, now = new Date()) {
  const today = yangonDayKey(now);
  const from = addDays(today, -(days - 1));
  const keys = dayRange(from, today);
  const logs = await prisma.auditLog.findMany({
    where: { entity: "Product", action: { in: ["product.create", "product.submit", "product.publish"] }, createdAt: { gte: yangonDayStart(from) } },
    select: { action: true, createdAt: true },
  });
  const series = { created: new Map<string, number>(), submitted: new Map<string, number>(), published: new Map<string, number>() };
  const key = { "product.create": "created", "product.submit": "submitted", "product.publish": "published" } as const;
  for (const l of logs) {
    const m = series[key[l.action as keyof typeof key]];
    const d = yangonDayKey(l.createdAt);
    m.set(d, (m.get(d) ?? 0) + 1);
  }
  return keys.map((d) => ({ day: d, created: series.created.get(d) ?? 0, submitted: series.submitted.get(d) ?? 0, published: series.published.get(d) ?? 0 }));
}

/** Việc cần xử lý về SP (mỗi dòng dẫn tới danh sách đã lọc). */
export async function catalogTasks() {
  const [noImage, noPrice, notReceived] = await Promise.all([
    prisma.product.count({ where: { archivedAt: null, images: { none: {} } } }),
    prisma.product.count({ where: { archivedAt: null, variants: { some: { active: true, priceMmk: { lte: 0 } } } } }),
    prisma.product.count({ where: { archivedAt: null, variants: { some: NOT_RECEIVED_VARIANT } } }),
  ]);
  return { noImage, noPrice, notReceived };
}

/** Phiếu nhập gần đây (nháp + đã ghi sổ). */
export async function recentReceipts(take = 3) {
  const docs = await prisma.stockDocument.findMany({
    where: { type: "RECEIVE", status: { in: ["DRAFT", "POSTED"] } },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, code: true, status: true, createdAt: true, postedAt: true, to: { select: { name: true } }, lines: { select: { qty: true, variantId: true } } },
  });
  return docs.map((d) => ({
    id: d.id,
    code: d.code,
    status: d.status,
    at: d.postedAt ?? d.createdAt,
    location: d.to?.name ?? "—",
    skus: new Set(d.lines.map((l) => l.variantId)).size,
    qty: d.lines.reduce((s, l) => s + l.qty, 0),
  }));
}

/** SP vừa cập nhật (nhãn theo cùng quy tắc danh sách). */
export async function recentProducts(take = 3) {
  const rows = await prisma.product.findMany({
    orderBy: { updatedAt: "desc" },
    take,
    select: {
      id: true,
      slug: true,
      updatedAt: true,
      archivedAt: true,
      published: true,
      approvedAt: true,
      approvalStatus: true,
      changeRequest: { select: { productId: true } },
      translations: { select: { locale: true, name: true } },
      variants: { orderBy: { sku: "asc" }, take: 1, select: { sku: true } },
      images: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }], take: 1, select: { file: { select: { url: true } } } },
    },
  });
  return rows.map((p) => ({
    id: p.id,
    name: productName(p.translations, p.slug),
    sku: p.variants[0]?.sku ?? "",
    image: p.images[0]?.file.url ?? null,
    updatedAt: p.updatedAt,
    label: deriveLabel({ ...p, hasChanges: !!p.changeRequest }).label,
  }));
}
