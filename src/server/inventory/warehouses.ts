import "server-only";
import { z } from "zod";
import { formId } from "@/lib/schemas";
import { prisma } from "@/lib/db";
import type { PricingMode } from "@/generated/prisma/client";
import type { Tx } from "./ledger";

/**
 * Kho (P24): kho bán (MM_STOCK, sellable) — mỗi SP thuộc đúng một kho bán (`Product.stockLocationId`),
 * mỗi kho một cách tính giá (`pricingMode`); khu chờ kiểm tra (QUARANTINE) giữ hàng trả.
 * Kho có sổ kho không xoá được → tắt (`active = false`): ẩn khỏi ô chọn, không nhận phiếu mới.
 */

export class WarehouseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WarehouseError";
  }
}

/** Kho bán mặc định cho SP mới (import, tạo nhanh): cài đặt `catalog.defaultLocationCode` nếu là kho bán đang dùng, không thì kho bán đầu tiên. */
export async function defaultStockLocationId(tx: Tx = prisma): Promise<string> {
  const code = (await tx.setting.findUnique({ where: { key: "catalog.defaultLocationCode" } }))?.value;
  const preferred = typeof code === "string" && code
    ? await tx.location.findFirst({ where: { code, sellable: true, active: true }, select: { id: true } })
    : null;
  if (preferred) return preferred.id;
  const first = await tx.location.findFirst({
    where: { sellable: true, active: true },
    orderBy: [{ pricingMode: "asc" }, { code: "asc" }],
    select: { id: true },
  });
  if (!first) throw new WarehouseError("Chưa có kho bán nào — tạo kho ở Cài đặt → Kho hàng");
  return first.id;
}

/** Kho bán hợp lệ để gán SP: tồn tại, bán được, đang dùng. */
export async function assertStockLocation(tx: Tx, locationId: string) {
  const loc = await tx.location.findUnique({ where: { id: locationId } });
  if (!loc || !loc.sellable) throw new WarehouseError("Kho của sản phẩm phải là kho bán");
  if (!loc.active) throw new WarehouseError(`Kho ${loc.name} đã ngừng dùng`);
  return loc;
}

/** Kho bán đang dùng theo mã (cột `warehouse_code` khi import). */
export async function stockLocationByCode(tx: Tx, code: string) {
  const loc = await tx.location.findUnique({ where: { code: code.trim().toUpperCase() } });
  if (!loc || !loc.sellable || !loc.active) throw new WarehouseError(`Không có kho bán "${code}"`);
  return loc;
}

// ───────────────────────── Trang Quản lý kho ─────────────────────────

/** Mặc định chỉ kho đang dùng; `includeInactive` thêm kho đã ngừng (tối đa 200). */
export async function listWarehouses(opts: { includeInactive?: boolean } = {}) {
  const [active, inactive] = await Promise.all([
    prisma.location.findMany({ where: { active: true }, orderBy: [{ sellable: "desc" }, { pricingMode: "asc" }, { code: "asc" }] }),
    opts.includeInactive ? prisma.location.findMany({ where: { active: false }, orderBy: { code: "asc" }, take: 200 }) : [],
  ]);
  const locations = [...active, ...inactive];
  const ids = locations.map((l) => l.id);
  const [products, stock, inactiveCount, anyProducts, moves] = await Promise.all([
    prisma.product.groupBy({ by: ["stockLocationId"], where: { archivedAt: null, stockLocationId: { in: ids } }, _count: { _all: true } }),
    prisma.stockBalance.groupBy({ by: ["locationId"], where: { qty: { gt: 0 }, locationId: { in: ids } }, _sum: { qty: true } }),
    prisma.location.count({ where: { active: false } }),
    // Cùng điều kiện chặn đổi cách tính giá ở updateWarehouse (kể cả SP ngừng KD, kho đã từng có sổ kho) → khoá ô trên form.
    prisma.product.groupBy({ by: ["stockLocationId"], where: { stockLocationId: { in: ids } }, _count: { _all: true } }),
    prisma.stockLedger.groupBy({ by: ["locationId"], where: { locationId: { in: ids } }, _count: { _all: true } }),
  ]);
  const locked = new Set([...anyProducts.map((p) => p.stockLocationId), ...moves.map((m) => m.locationId)]);
  const productCount = new Map(products.map((p) => [p.stockLocationId, p._count._all]));
  const stockQty = new Map(stock.map((s) => [s.locationId, s._sum.qty ?? 0]));
  const rows = locations.map((l) => ({
    id: l.id,
    code: l.code,
    name: l.name,
    type: l.type,
    sellable: l.sellable,
    active: l.active,
    pricingMode: l.pricingMode,
    products: productCount.get(l.id) ?? 0,
    stock: stockQty.get(l.id) ?? 0,
    /** Kho đã có SP / đã có sổ kho → không đổi được cách tính giá (server chặn ở updateWarehouse). */
    modeLocked: locked.has(l.id),
  }));
  return { rows, inactiveCount };
}
export type WarehouseRow = Awaited<ReturnType<typeof listWarehouses>>["rows"][number];

const pricingModeSchema = z.enum(["VN_IMPORT", "LOCAL_MMK"]);
const nameSchema = z.string().trim().min(1, "Nhập tên kho").max(60);

const createSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("sell"),
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,20}$/, "Mã kho 2–20 ký tự: chữ, số, dấu -"),
    name: nameSchema,
    pricingMode: pricingModeSchema,
  }),
  z.object({
    kind: z.literal("quarantine"),
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,20}$/, "Mã kho 2–20 ký tự: chữ, số, dấu -"),
    name: nameSchema,
  }),
]);

async function audit(tx: Tx, userId: string, action: string, entityId: string, data?: object) {
  await tx.auditLog.create({ data: { userId, action, entity: "Location", entityId, data: data ?? undefined } });
}

export async function createWarehouse(raw: unknown, userId: string) {
  const input = createSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    if (await tx.location.findUnique({ where: { code: input.code } })) throw new WarehouseError(`Mã kho ${input.code} đã có`);
    const loc = await tx.location.create({
      data:
        input.kind === "sell"
          ? { code: input.code, name: input.name, type: "MM_STOCK", sellable: true, pricingMode: input.pricingMode }
          : { code: input.code, name: input.name, type: "QUARANTINE", sellable: false },
    });
    await audit(tx, userId, "location.create", loc.id, { code: loc.code });
    return loc;
  });
}

const updateSchema = z.object({ id: formId(40), name: nameSchema, pricingMode: pricingModeSchema.optional() });

export async function updateWarehouse(raw: unknown, userId: string) {
  const input = updateSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Location" WHERE "id" = ${input.id} FOR UPDATE`;
    const loc = await tx.location.findUnique({ where: { id: input.id } });
    if (!loc) throw new WarehouseError("Không tìm thấy kho");
    const pricingMode: PricingMode | null = loc.sellable ? (input.pricingMode ?? loc.pricingMode) : null;
    // P1-B (H5): đổi cách tính giá khi kho đã có SP / đã từng có hàng làm lô cũ (giá vốn VND hoặc MMK) rơi khỏi cách tính.
    if (pricingMode !== loc.pricingMode) {
      const [products, moves] = [await tx.product.count({ where: { stockLocationId: loc.id } }), await tx.stockLedger.count({ where: { locationId: loc.id } })];
      if (products || moves) {
        throw new WarehouseError(`Kho ${loc.name} đã có sản phẩm hoặc đã có hàng — không đổi được cách tính giá. Tạo kho mới với cách tính giá khác.`);
      }
    }
    const updated = await tx.location.update({ where: { id: loc.id }, data: { name: input.name, pricingMode } });
    await audit(tx, userId, "location.update", loc.id, { name: input.name, pricingMode });
    return updated;
  });
}

/** Tắt kho: không còn tồn, không còn SP gán vào; luôn giữ ít nhất một kho bán và một khu chờ kiểm tra. */
export async function setWarehouseActive(raw: unknown, userId: string) {
  const input = z.object({ id: formId(40), active: z.boolean() }).parse(raw);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Location" WHERE "id" = ${input.id} FOR UPDATE`;
    const loc = await tx.location.findUnique({ where: { id: input.id } });
    if (!loc) throw new WarehouseError("Không tìm thấy kho");
    if (loc.active === input.active) return loc;
    if (!input.active) {
      const stock = await tx.stockBalance.aggregate({ where: { locationId: loc.id, qty: { not: 0 } }, _sum: { qty: true } });
      if ((stock._sum.qty ?? 0) !== 0) throw new WarehouseError(`Kho ${loc.name} còn tồn — chuyển hoặc xuất hết hàng trước khi ngừng dùng`);
      const products = await tx.product.count({ where: { stockLocationId: loc.id } });
      if (products) throw new WarehouseError(`Còn ${products} sản phẩm thuộc kho ${loc.name} — đổi kho cho các sản phẩm này trước`);
      const sameKind = await tx.location.count({
        where: { id: { not: loc.id }, active: true, ...(loc.sellable ? { sellable: true } : { type: loc.type }) },
      });
      if ((loc.sellable || loc.type === "QUARANTINE") && sameKind === 0) {
        throw new WarehouseError(loc.sellable ? "Phải còn ít nhất một kho bán" : "Phải còn ít nhất một khu chờ kiểm tra hàng trả");
      }
    }
    const updated = await tx.location.update({ where: { id: loc.id }, data: { active: input.active } });
    await audit(tx, userId, input.active ? "location.activate" : "location.deactivate", loc.id);
    return updated;
  });
}
