import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { optionalRange } from "@/lib/date-range";
import { addDays, yangonDayStart } from "@/lib/time";

/**
 * P25 gói A (A2) — Nhật ký thao tác (/admin/settings/audit): mọi dòng AuditLog, lọc theo người / nhóm hành động / đối tượng /
 * ngày. Chỉ đọc. `userId` null = hệ thống (cron). Nhóm hành động = phần trước dấu chấm đầu tiên (`agent.call` → `agent`).
 */
export const AUDIT_PAGE_SIZE = 50;
export const SYSTEM_USER = "system";

export type AuditFilter = { userId?: string; action?: string; entityId?: string; from?: string; to?: string; page?: number };

export function parseAuditFilter(sp: Record<string, string | string[] | undefined>): AuditFilter {
  const one = (k: string) => (typeof sp[k] === "string" && sp[k].trim() ? sp[k].trim().slice(0, 100) : undefined);
  return { userId: one("user"), action: one("action"), entityId: one("q"), ...optionalRange({ from: one("from"), to: one("to") }), page: Number(one("page")) || 1 };
}

export async function listAuditLogs(f: AuditFilter) {
  const where: Prisma.AuditLogWhereInput = {
    ...(f.userId && { userId: f.userId === SYSTEM_USER ? null : f.userId }),
    ...(f.action && { action: f.action.includes(".") ? f.action : { startsWith: `${f.action}.` } }),
    ...(f.entityId && { entityId: f.entityId }),
    ...((f.from || f.to) && { createdAt: { ...(f.from && { gte: yangonDayStart(f.from) }), ...(f.to && { lt: yangonDayStart(addDays(f.to, 1)) }) } }),
  };
  const total = await prisma.auditLog.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const page = Math.min(Math.max(1, f.page ?? 1), pageCount);
  const rows = await prisma.auditLog.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * AUDIT_PAGE_SIZE, take: AUDIT_PAGE_SIZE });
  const ids = [...new Set(rows.flatMap((r) => (r.userId ? [r.userId] : [])))];
  const users = new Map((await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, role: true } })).map((u) => [u.id, u]));
  return { total, page, pageCount, rows: rows.map((r) => ({ ...r, user: r.userId ? (users.get(r.userId) ?? null) : null })) };
}

/** Ô lọc: nhân viên (gồm tài khoản đã khoá — "Trợ lý AI") + các nhóm hành động đang có. */
export async function auditFilterOptions() {
  const [users, actions] = await Promise.all([
    prisma.user.findMany({ where: { role: { in: ["ADMIN", "WAREHOUSE_MANAGER", "ORDER_STAFF"] } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.$queryRaw<{ g: string }[]>`SELECT DISTINCT split_part("action", '.', 1) AS g FROM "AuditLog" ORDER BY 1`,
  ]);
  return { users, actionGroups: actions.map((a) => a.g) };
}

/** Link tới đối tượng của dòng nhật ký (nếu có trang admin tương ứng). */
export function auditEntityHref(entity: string, entityId: string | null): string | null {
  if (!entityId) return null;
  switch (entity) {
    case "Product":
      return `/admin/products/${entityId}`;
    case "StockDocument":
      return `/admin/inventory/documents/${entityId}`;
    case "Order":
      return `/admin/orders/${entityId}`;
    case "Batch":
      return `/admin/inventory/batches/${entityId}`;
    case "User":
      return `/admin/users/${entityId}`;
    case "Affiliate":
      return `/admin/affiliates/${entityId}`;
    case "Category":
      return `/admin/categories/${entityId}`;
    case "Banner":
      return `/admin/content/banners/${entityId}`;
    case "Collection":
      return `/admin/content/collections/${entityId}`;
    case "PriceUpdateRun":
      return `/admin/pricing/runs/${entityId}`;
    case "InboundShipment":
      return `/admin/shipments/${entityId}`;
    default:
      return null;
  }
}
