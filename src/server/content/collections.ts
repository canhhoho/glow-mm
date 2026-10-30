import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { toUnicode } from "@/lib/myanmar";
import { pick } from "@/server/catalog/queries";
import { loadCardRowsByIds, withStock } from "@/server/catalog/store-queries";
import type { Tx } from "@/server/inventory/ledger";
import { ContentError, directionSchema, inSchedule, isInSchedule, moveInList, scheduleSchema, type Direction } from "./common";

/**
 * Bộ sưu tập sản phẩm chọn tay (vd "Hàng mới về", "Thanh lý"): tên my/en, lịch hiển thị, cờ trang chủ.
 * Chỉ gom sản phẩm, không đổi giá. Storefront chỉ hiện SP đã đăng + còn biến thể bán (STORE_VISIBLE).
 */

const TX = { maxWait: 10_000, timeout: 30_000 };
export const COLLECTION_RAIL_SIZE = 10;
const MAX_ITEMS = 200;

const collectionSchema = z
  .object({
    slug: z.string().trim().min(1).max(60).regex(/^[a-z0-9-]+$/, "Slug chỉ gồm a-z, 0-9 và dấu -"),
    nameMy: z.string().trim().min(1).max(80).transform(toUnicode),
    nameEn: z.string().trim().min(1).max(80),
    active: z.boolean(),
    showOnHome: z.boolean(),
  })
  .and(scheduleSchema);

export type CollectionInput = z.input<typeof collectionSchema>;

async function lockOrder(tx: Tx) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('collection-order'))`;
}

/** Khoá dòng Collection: thêm/bớt/sắp xếp SP đồng thời không giẫm sortOrder của nhau. */
async function lockCollection(tx: Tx, id: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Collection" WHERE "id" = ${id} FOR UPDATE`;
  if (rows.length === 0) throw new ContentError("Không tìm thấy bộ sưu tập");
}

function slugTaken(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

function translations(input: { nameMy: string; nameEn: string }) {
  return [
    { locale: "my", name: input.nameMy },
    { locale: "en", name: input.nameEn },
  ];
}

export async function createCollection(raw: CollectionInput, userId: string) {
  const { nameMy, nameEn, ...input } = collectionSchema.parse(raw);
  try {
    return await prisma.$transaction(async (tx) => {
      await lockOrder(tx);
      const last = await tx.collection.aggregate({ _max: { sortOrder: true } });
      const c = await tx.collection.create({
        data: { ...input, sortOrder: (last._max.sortOrder ?? -1) + 1, translations: { create: translations({ nameMy, nameEn }) } },
      });
      await tx.auditLog.create({ data: { userId, action: "collection.create", entity: "Collection", entityId: c.id } });
      return c;
    }, TX);
  } catch (e) {
    if (slugTaken(e)) throw new ContentError("Slug đã được dùng");
    throw e;
  }
}

export async function updateCollection(id: string, raw: CollectionInput, userId: string) {
  const { nameMy, nameEn, ...input } = collectionSchema.parse(raw);
  try {
    return await prisma.$transaction(async (tx) => {
      await lockCollection(tx, id);
      const c = await tx.collection.update({ where: { id }, data: input });
      for (const t of translations({ nameMy, nameEn })) {
        await tx.collectionTranslation.upsert({
          where: { collectionId_locale: { collectionId: id, locale: t.locale } },
          create: { collectionId: id, ...t },
          update: { name: t.name },
        });
      }
      await tx.auditLog.create({ data: { userId, action: "collection.update", entity: "Collection", entityId: id } });
      return c;
    }, TX);
  } catch (e) {
    if (slugTaken(e)) throw new ContentError("Slug đã được dùng");
    throw e;
  }
}

export async function deleteCollection(id: string, userId: string) {
  await prisma.$transaction(async (tx) => {
    await lockCollection(tx, id);
    await tx.collection.delete({ where: { id } });
    await tx.auditLog.create({ data: { userId, action: "collection.delete", entity: "Collection", entityId: id } });
  }, TX);
}

export async function moveCollection(id: string, direction: Direction, userId: string) {
  const dir = directionSchema.parse(direction);
  return prisma.$transaction(async (tx) => {
    await lockOrder(tx);
    const list = await tx.collection.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, sortOrder: true } });
    const next = moveInList(
      list.map((c) => c.id),
      id,
      dir,
    );
    if (!next) return false;
    for (const [i, cid] of next.entries()) {
      if (list.find((c) => c.id === cid)?.sortOrder !== i) await tx.collection.update({ where: { id: cid }, data: { sortOrder: i } });
    }
    await tx.auditLog.create({ data: { userId, action: "collection.move", entity: "Collection", entityId: id, data: { direction: dir } } });
    return true;
  }, TX);
}

/** Thêm SP vào cuối bộ sưu tập (SP đã có thì bỏ qua). Trả số SP thêm mới. */
export async function addCollectionProducts(id: string, productIds: string[], userId: string) {
  const ids = [...new Set(z.array(z.string().trim().min(1).max(40)).min(1).max(50).parse(productIds))];
  return prisma.$transaction(async (tx) => {
    await lockCollection(tx, id);
    const found = await tx.product.findMany({ where: { id: { in: ids } }, select: { id: true } });
    if (found.length !== ids.length) throw new ContentError("Có sản phẩm không tồn tại");
    const existing = await tx.collectionItem.findMany({ where: { collectionId: id }, select: { productId: true, sortOrder: true } });
    const have = new Set(existing.map((i) => i.productId));
    const add = ids.filter((pid) => !have.has(pid));
    if (existing.length + add.length > MAX_ITEMS) throw new ContentError(`Tối đa ${MAX_ITEMS} sản phẩm mỗi bộ sưu tập`);
    let sortOrder = Math.max(-1, ...existing.map((i) => i.sortOrder)) + 1;
    for (const productId of add) await tx.collectionItem.create({ data: { collectionId: id, productId, sortOrder: sortOrder++ } });
    if (add.length > 0) {
      await tx.auditLog.create({
        data: { userId, action: "collection.items.add", entity: "Collection", entityId: id, data: { productIds: add } },
      });
    }
    return add.length;
  }, TX);
}

export async function removeCollectionProduct(id: string, productId: string, userId: string) {
  await prisma.$transaction(async (tx) => {
    await lockCollection(tx, id);
    await tx.collectionItem.deleteMany({ where: { collectionId: id, productId } });
    await tx.auditLog.create({
      data: { userId, action: "collection.items.remove", entity: "Collection", entityId: id, data: { productId } },
    });
  }, TX);
}

export async function moveCollectionProduct(id: string, productId: string, direction: Direction, userId: string) {
  const dir = directionSchema.parse(direction);
  return prisma.$transaction(async (tx) => {
    await lockCollection(tx, id);
    const items = await tx.collectionItem.findMany({
      where: { collectionId: id },
      orderBy: [{ sortOrder: "asc" }, { productId: "asc" }],
    });
    const next = moveInList(
      items.map((i) => i.productId),
      productId,
      dir,
    );
    if (!next) return false;
    for (const [i, pid] of next.entries()) {
      if (items.find((x) => x.productId === pid)?.sortOrder !== i) {
        await tx.collectionItem.update({ where: { collectionId_productId: { collectionId: id, productId: pid } }, data: { sortOrder: i } });
      }
    }
    await tx.auditLog.create({
      data: { userId, action: "collection.items.move", entity: "Collection", entityId: id, data: { productId, direction: dir } },
    });
    return true;
  }, TX);
}

// ───────────────────────── Đọc ─────────────────────────

const nameOf = (rows: { locale: string; name: string }[], l: string) => rows.find((t) => t.locale === l)?.name ?? "";

export async function listCollectionsAdmin() {
  const rows = await prisma.collection.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { translations: true, _count: { select: { items: true } } },
  });
  return rows.map((c) => ({
    id: c.id,
    slug: c.slug,
    nameMy: nameOf(c.translations, "my"),
    nameEn: nameOf(c.translations, "en"),
    active: c.active,
    showOnHome: c.showOnHome,
    startAt: c.startAt,
    endAt: c.endAt,
    items: c._count.items,
  }));
}

export async function getCollectionAdmin(id: string) {
  const c = await prisma.collection.findUnique({
    where: { id },
    include: {
      translations: true,
      items: {
        orderBy: [{ sortOrder: "asc" }, { productId: "asc" }],
        include: { product: { select: { id: true, slug: true, published: true, translations: true } } },
      },
    },
  });
  if (!c) return null;
  return {
    id: c.id,
    slug: c.slug,
    nameMy: nameOf(c.translations, "my"),
    nameEn: nameOf(c.translations, "en"),
    active: c.active,
    showOnHome: c.showOnHome,
    startAt: c.startAt,
    endAt: c.endAt,
    items: c.items.map((i) => ({
      productId: i.product.id,
      slug: i.product.slug,
      published: i.product.published,
      name: pick(i.product.translations, "en")?.name ?? i.product.slug,
    })),
  };
}

const visibleWhere = (now: Date) => ({ active: true, ...inSchedule(now) });

const ITEMS_ORDER = { orderBy: [{ sortOrder: "asc" as const }, { productId: "asc" as const }], select: { productId: true } };

/**
 * Bộ sưu tập đang bật hiện trên trang chủ, kèm lịch và thẻ SP **chưa có tồn** (cache được, P20). Lọc lịch
 * (`visibleCollections`) và gắn tồn (`withStock`) làm lúc request.
 */
export async function loadHomeCollectionRows(locale: string, take = COLLECTION_RAIL_SIZE) {
  const rows = await prisma.collection.findMany({
    where: { active: true, showOnHome: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { translations: true, items: ITEMS_ORDER },
  });
  return Promise.all(
    rows.map(async (c) => ({
      slug: c.slug,
      name: pick(c.translations, locale)?.name ?? c.slug,
      startAt: c.startAt,
      endAt: c.endAt,
      // Lấy dư id vì SP ẩn/hết biến thể bị lọc bỏ.
      products: (await loadCardRowsByIds(c.items.slice(0, take * 3).map((i) => i.productId), locale)).slice(0, take),
    })),
  );
}

/** Bộ sưu tập đang bật theo slug (chưa xét lịch), thẻ SP chưa có tồn. */
export async function loadCollectionRow(slug: string, locale: string) {
  const c = await prisma.collection.findFirst({ where: { slug, active: true }, include: { translations: true, items: ITEMS_ORDER } });
  if (!c) return null;
  return {
    slug: c.slug,
    name: pick(c.translations, locale)?.name ?? c.slug,
    startAt: c.startAt,
    endAt: c.endAt,
    products: await loadCardRowsByIds(
      c.items.map((i) => i.productId),
      locale,
    ),
  };
}

/** Trong lịch tại `now` và còn SP hiển thị. */
export function visibleCollections<T extends { startAt: Date | null; endAt: Date | null; products: unknown[] }>(rows: T[], now: Date) {
  return rows.filter((c) => isInSchedule(c, now) && c.products.length > 0);
}

/** Bộ sưu tập hiện trên trang chủ (đang bật, trong lịch, có SP hiển thị), mỗi bộ tối đa `take` thẻ SP. */
export async function homeCollections(locale: string, now: Date, take = COLLECTION_RAIL_SIZE) {
  const rows = visibleCollections(await loadHomeCollectionRows(locale, take), now);
  const stocked = await withStock(rows.map((c) => c.products));
  return rows.map((c, i) => ({ slug: c.slug, name: c.name, products: stocked[i] }));
}

/** Trang /collection/[slug]: null nếu không có, đang tắt hoặc ngoài lịch. */
export async function getStoreCollection(slug: string, locale: string, now: Date) {
  const c = await loadCollectionRow(slug, locale);
  if (!c || !isInSchedule(c, now)) return null;
  const [products] = await withStock([c.products]);
  return { slug: c.slug, name: c.name, products };
}

/** Cho proxy 404: bộ sưu tập có đang hiển thị không. */
export async function collectionVisible(slug: string, now: Date) {
  return !!(await prisma.collection.findFirst({ where: { slug, ...visibleWhere(now) }, select: { id: true } }));
}
