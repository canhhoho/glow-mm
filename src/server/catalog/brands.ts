import "server-only";
import { randomUUID } from "node:crypto";
import { toUnicode } from "@/lib/myanmar";
import { slugify } from "@/lib/slug";
import type { Tx } from "@/server/inventory/ledger";
import { writeAudit, writeAudits } from "@/server/audit";

/**
 * Thương hiệu không có trang quản lý riêng: tạo khi gõ tên ở form SP / Excel (`saveProduct`) và
 * tự xoá khi không còn SP nào gắn vào (đổi thương hiệu của SP, xoá hẳn SP). Thương hiệu còn SP
 * ngừng kinh doanh được giữ (SP cần thương hiệu cho lịch sử); storefront chỉ hiện thương hiệu có SP đang đăng.
 */
export async function pruneEmptyBrands(tx: Tx, brandIds: (string | null | undefined)[], userId: string | null = null) {
  const ids = [...new Set(brandIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return 0;
  const empty = await tx.brand.findMany({ where: { id: { in: ids }, products: { none: {} } }, select: { id: true, name: true } });
  if (empty.length === 0) return 0;
  const res = await tx.brand.deleteMany({ where: { id: { in: empty.map((b) => b.id) }, products: { none: {} } } });
  await writeAudits(tx, empty.map((b) => ({ userId, action: "brand.prune", entity: "Brand", entityId: b.id, data: { name: b.name } })));
  return res.count;
}

/** Tên thương hiệu gõ tay: Unicode, NFC, gộp khoảng trắng. */
export const normalizeBrandName = (name: string) => toUnicode(name).normalize("NFC").trim().replace(/\s+/g, " ");

/** Slug so khớp thương hiệu; rỗng khi tên không có chữ Latin (vd. chỉ chữ Myanmar). */
export const brandSlug = (name: string) => slugify(normalizeBrandName(name), "");

/**
 * Tìm thương hiệu theo tên (không phân biệt hoa thường), rồi theo slug — "Estée Lauder" / "Estee Lauder",
 * "L’Oréal" / "L'Oreal" là cùng một thương hiệu (slug là unique nên không thể tạo bản thứ hai).
 * Chưa có thì tạo trong transaction của người gọi.
 */
export async function findOrCreateBrand(tx: Tx, rawName: string, userId: string | null = null) {
  const name = normalizeBrandName(rawName);
  const slug = brandSlug(name);
  const found =
    (await tx.brand.findFirst({ where: { name: { equals: name, mode: "insensitive" } } })) ??
    (slug ? await tx.brand.findUnique({ where: { slug } }) : null);
  if (found) return found;
  const created = await tx.brand.create({ data: { name, slug: slug || `brand-${randomUUID().slice(0, 8)}` } });
  await writeAudit(tx, { userId, action: "brand.create", entity: "Brand", entityId: created.id, data: { name } });
  return created;
}
