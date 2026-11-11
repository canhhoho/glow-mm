import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { Tx } from "@/server/inventory/ledger";

/**
 * Ghi nhật ký thao tác (P2, M9) — một chỗ cho mọi thao tác ghi của admin. Gọi trong cùng transaction với thao tác
 * để nhật ký và dữ liệu luôn khớp. `userId` null = hệ thống (cron, chuyển đổi dữ liệu).
 */
export type AuditEntry = { userId: string | null; action: string; entity: string; entityId?: string | null; data?: Prisma.InputJsonValue };

export function writeAudit(db: Tx, entry: AuditEntry) {
  return db.auditLog.create({ data: { userId: entry.userId, action: entry.action, entity: entry.entity, entityId: entry.entityId ?? null, ...(entry.data !== undefined && { data: entry.data }) } });
}

export function writeAudits(db: Tx, entries: AuditEntry[]) {
  if (entries.length === 0) return Promise.resolve({ count: 0 });
  return db.auditLog.createMany({
    data: entries.map((e) => ({ userId: e.userId, action: e.action, entity: e.entity, entityId: e.entityId ?? null, ...(e.data !== undefined && { data: e.data }) })),
  });
}
