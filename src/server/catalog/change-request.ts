import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { deleteFileIfUnused } from "@/server/files/public-images";
import type { Tx } from "@/server/inventory/ledger";
import { PRODUCT_EDIT_INCLUDE, toProductEditData, type ProductEditData } from "./admin-queries";
import { approvalHashes, guardApproval } from "./approval";
import { CatalogError, productSchema, writeProduct, type ProductInput } from "./products";

/**
 * Bản đang sửa của SP đã duyệt (P1-A, kế hoạch admin §6). Khách luôn thấy bản live (đã duyệt); thay đổi cần duyệt
 * nằm ở `ProductChangeRequest` cho đến khi được duyệt (áp vào live qua `writeProduct` + ghi giá) hoặc bị huỷ.
 *
 * Phân loại (người dùng không thấy): CẦN DUYỆT = tên, mô tả, danh mục, thương hiệu, SKU/nhãn/bật-tắt biến thể,
 * combo, thêm/xoá ảnh, giá bán. KHÔNG CẦN DUYỆT (ghi thẳng) = khối lượng, ngưỡng tồn, hoa hồng CTV, lãi cố định,
 * kho bán, hạn dùng/PAO, ghi chú bảo quản, cách dùng, thành phần, tag, slug, thứ tự/alt ảnh, đặt trước.
 */

export type StagedPrice = { priceMmk: number; baseLivePrice: number; reason: string; runId?: string | null; userId: string };
export type StagedImages = { add: { fileId: string }[]; remove: string[] };
type ChangeRow = { content: ProductInput | null; prices: Record<string, StagedPrice>; images: StagedImages };

const EMPTY_IMAGES: StagedImages = { add: [], remove: [] };

async function readChanges(tx: Tx, productId: string): Promise<(ChangeRow & { exists: true }) | null> {
  const row = await tx.productChangeRequest.findUnique({ where: { productId } });
  if (!row) return null;
  return {
    exists: true,
    content: (row.content as ProductInput | null) ?? null,
    prices: (row.prices as Record<string, StagedPrice> | null) ?? {},
    images: (row.images as StagedImages | null) ?? EMPTY_IMAGES,
  };
}

const isEmpty = (c: ChangeRow) => !c.content && Object.keys(c.prices).length === 0 && c.images.add.length === 0 && c.images.remove.length === 0;
const json = (v: unknown) => (v == null ? Prisma.DbNull : (v as Prisma.InputJsonValue));

/**
 * Ghi bản đang sửa + cập nhật trạng thái duyệt: có thay đổi → phiên bản +1, đang chờ duyệt → về nháp (rời hàng đợi),
 * bị từ chối giữ nguyên (lý do vẫn hiện) cho đến khi gửi lại. Bản đang sửa rỗng → xoá, trạng thái về đã duyệt.
 */
async function writeChanges(tx: Tx, productId: string, next: ChangeRow, userId: string, changed: boolean) {
  if (isEmpty(next)) {
    const removed = await tx.productChangeRequest.deleteMany({ where: { productId } });
    if (removed.count) await tx.product.update({ where: { id: productId }, data: { approvalStatus: "APPROVED", approvalVersion: { increment: 1 }, submittedAt: null, submittedById: null } });
    return;
  }
  const data = { content: json(next.content), prices: json(Object.keys(next.prices).length ? next.prices : null), images: json(next.images.add.length || next.images.remove.length ? next.images : null) };
  await tx.productChangeRequest.upsert({ where: { productId }, create: { productId, createdById: userId, ...data }, update: data });
  if (!changed) return;
  const p = await tx.product.findUniqueOrThrow({ where: { id: productId }, select: { approvalStatus: true } });
  await tx.product.update({
    where: { id: productId },
    data: {
      approvalVersion: { increment: 1 },
      ...(p.approvalStatus !== "REJECTED" && { approvalStatus: "DRAFT", submittedAt: null, submittedById: null }),
    },
  });
  await tx.auditLog.create({ data: { userId, action: "product.change_stage", entity: "Product", entityId: productId } });
}

/** Chạy `fn` rồi hoàn tác mọi ghi của nó (SAVEPOINT) — xem trước kết quả áp bản đang sửa / so dấu vân tay. */
let savepointSeq = 0;
export async function withSavepoint<T>(tx: Tx, fn: () => Promise<T>): Promise<T> {
  const name = `cr_preview_${++savepointSeq}`;
  await tx.$executeRawUnsafe(`SAVEPOINT ${name}`);
  try {
    return await fn();
  } finally {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${name}`);
  }
}

// ── Ghép payload: phần CẦN DUYỆT từ `a`, phần KHÔNG CẦN DUYỆT từ `b` ──

type Variant = ProductInput["variants"][number];
const pickA = (v: Variant) => ({ sku: v.sku, label: v.label, active: v.active, isBundle: v.isBundle, components: v.components });
const pickB = (v: Variant) => ({
  weightGrams: v.weightGrams,
  lowStockAt: v.lowStockAt,
  leadTimeDays: v.leadTimeDays,
  safetyStock: v.safetyStock,
  affiliateCommissionMmk: v.affiliateCommissionMmk,
});

/**
 * Payload mới: tên/mô tả/danh mục/thương hiệu + SKU/nhãn/bật-tắt/combo của biến thể lấy từ `a`; còn lại từ `b`.
 * Biến thể có id: hợp hai bên. Biến thể mới (chưa có id) chỉ lấy từ `a`. Giá luôn bỏ trống (= giữ giá live).
 */
export function composePayload(a: ProductInput, b: ProductInput): ProductInput {
  const byIdA = new Map(a.variants.filter((v) => v.id).map((v) => [v.id!, v]));
  const byIdB = new Map(b.variants.filter((v) => v.id).map((v) => [v.id!, v]));
  const ids = [...new Set([...byIdB.keys(), ...byIdA.keys()])];
  const variants: Variant[] = ids.map((id) => {
    const va = byIdA.get(id);
    const vb = byIdB.get(id);
    const base = (vb ?? va)!;
    return { ...base, ...pickA(va ?? base), ...pickB(vb ?? base), id, priceMmk: undefined, autoSku: false };
  });
  for (const v of a.variants) if (!v.id) variants.push({ ...v, priceMmk: undefined });
  return {
    ...b,
    id: b.id ?? a.id,
    brandId: a.brandId,
    brandName: a.brandName,
    categoryId: a.categoryId,
    my: { ...b.my, name: a.my.name, description: a.my.description },
    en: { ...b.en, name: a.en.name, description: a.en.description },
    copyFromId: undefined,
    autoSlug: false,
    variants,
  };
}

/** Dữ liệu live dưới dạng payload `saveProduct` (đã parse). */
export async function livePayload(tx: Tx, productId: string): Promise<{ payload: ProductInput; edit: ProductEditData }> {
  const p = await tx.product.findUniqueOrThrow({ where: { id: productId }, include: PRODUCT_EDIT_INCLUDE });
  const edit = toProductEditData(p);
  const payload = productSchema.parse({ ...edit, variants: edit.variants.map((v) => ({ ...v, priceMmk: undefined })) });
  return { payload, edit };
}

const withoutPrices = (p: ProductInput): ProductInput => ({ ...p, variants: p.variants.map((v) => ({ ...v, priceMmk: undefined })) });

/** Dấu vân tay của SP nếu ghi `payload` vào live (xem trước, hoàn tác ngay). */
async function hashIfWritten(tx: Tx, productId: string, payload: ProductInput, userId: string) {
  return withSavepoint(tx, async () => {
    await writeProduct(tx, payload, userId, { mode: "apply" });
    return (await approvalHashes(tx, [productId])).get(productId)!;
  });
}

/**
 * Định tuyến lần lưu SP ĐÃ DUYỆT (gọi từ `saveProduct`, đã giữ khoá catalog + dòng Product):
 * phần không cần duyệt ghi thẳng; phần cần duyệt vào bản đang sửa; giá (từ Excel) vào bản đang sửa.
 */
export async function stageProductEdit(tx: Tx, parsed: ProductInput, userId: string, opts: { priceReason?: string } = {}) {
  const productId = parsed.id!;
  const { payload: live } = await livePayload(tx, productId);
  const existing = await readChanges(tx, productId);
  const incoming = withoutPrices(parsed);

  // So phần cần duyệt: bản mới so với bản đang sửa hiện có (hoặc live nếu chưa có).
  const liveHash = (await approvalHashes(tx, [productId])).get(productId)!;
  const candidateHash = await hashIfWritten(tx, productId, composePayload(incoming, live), userId);
  const draftHash = existing?.content ? await hashIfWritten(tx, productId, composePayload(existing.content, live), userId) : liveHash;
  const contentChanged = candidateHash !== draftHash;

  // Phần không cần duyệt → live (giữ nguyên phần cần duyệt của live). Lưới an toàn: dấu vân tay live không được đổi.
  await guardApproval(tx, [productId], userId, () => writeProduct(tx, composePayload(live, incoming), userId));

  // Giá trong payload (nhập Excel): SKU có sẵn đổi giá → bản đang sửa.
  const prices = { ...(existing?.prices ?? {}) };
  let pricesChanged = false;
  const liveVariants = await tx.variant.findMany({ where: { productId }, select: { id: true, priceMmk: true } });
  const livePrice = new Map(liveVariants.map((v) => [v.id, v.priceMmk]));
  for (const v of parsed.variants) {
    if (!v.id || v.priceMmk === undefined || !livePrice.has(v.id)) continue;
    const effective = prices[v.id]?.priceMmk ?? livePrice.get(v.id)!;
    if (v.priceMmk === effective) continue;
    if (v.priceMmk < 1) throw new CatalogError(`Giá bán của ${v.sku} phải lớn hơn 0`);
    pricesChanged = true;
    if (v.priceMmk === livePrice.get(v.id)) delete prices[v.id];
    else prices[v.id] = { priceMmk: v.priceMmk, baseLivePrice: livePrice.get(v.id)!, reason: opts.priceReason ?? "manual", userId };
  }

  const next: ChangeRow = {
    content: candidateHash === liveHash ? null : incoming,
    prices,
    images: existing?.images ?? EMPTY_IMAGES,
  };
  if (existing || !isEmpty(next)) await writeChanges(tx, productId, next, userId, contentChanged || pricesChanged);
  return tx.product.findUniqueOrThrow({ where: { id: productId } });
}

/** Giá hiệu lực để so xung đột: giá trong bản đang sửa nếu có, nếu không là giá live. */
export async function effectivePrices(tx: Tx, productId: string): Promise<Map<string, number>> {
  const variants = await tx.variant.findMany({ where: { productId }, select: { id: true, priceMmk: true } });
  const staged = (await readChanges(tx, productId))?.prices ?? {};
  return new Map(variants.map((v) => [v.id, staged[v.id]?.priceMmk ?? v.priceMmk]));
}

/** Đưa giá của SP đã duyệt vào bản đang sửa (Giá bán / bảng tính giá / Excel). Giá trở về đúng giá live → bỏ khỏi bản. */
export async function stagePrices(
  tx: Tx,
  productId: string,
  entries: { variantId: string; priceMmk: number; reason: string; runId?: string | null }[],
  userId: string,
) {
  if (entries.length === 0) return;
  const existing = await readChanges(tx, productId);
  const live = new Map((await tx.variant.findMany({ where: { productId }, select: { id: true, priceMmk: true } })).map((v) => [v.id, v.priceMmk]));
  const prices = { ...(existing?.prices ?? {}) };
  let changed = false;
  for (const e of entries) {
    if (!live.has(e.variantId)) throw new CatalogError("Biến thể không thuộc sản phẩm này");
    const effective = prices[e.variantId]?.priceMmk ?? live.get(e.variantId)!;
    if (effective === e.priceMmk) continue;
    changed = true;
    if (e.priceMmk === live.get(e.variantId)) delete prices[e.variantId];
    else prices[e.variantId] = { priceMmk: e.priceMmk, baseLivePrice: live.get(e.variantId)!, reason: e.reason, runId: e.runId ?? null, userId };
  }
  if (!changed) return;
  await writeChanges(tx, productId, { content: existing?.content ?? null, prices, images: existing?.images ?? EMPTY_IMAGES }, userId, true);
}

/** Ảnh của SP đã duyệt: thêm (file đã lưu, chưa gắn) / xoá (ảnh live) → bản đang sửa. */
export async function stageImages(tx: Tx, productId: string, change: { addFileIds?: string[]; removeImageId?: string }, userId: string) {
  const existing = await readChanges(tx, productId);
  const images: StagedImages = {
    add: [...(existing?.images.add ?? []), ...(change.addFileIds ?? []).map((fileId) => ({ fileId }))],
    remove: [...new Set([...(existing?.images.remove ?? []), ...(change.removeImageId ? [change.removeImageId] : [])])],
  };
  await writeChanges(tx, productId, { content: existing?.content ?? null, prices: existing?.prices ?? {}, images }, userId, true);
}

/** SKU `sku` đang nằm trong bản đang sửa của SP khác (biến thể mới chưa áp). */
export async function skuPendingElsewhere(tx: Tx, sku: string, productId?: string) {
  const needle = JSON.stringify({ variants: [{ sku }] });
  const rows = await tx.$queryRaw<{ productId: string }[]>`
    SELECT "productId" FROM "ProductChangeRequest" WHERE "content" @> ${needle}::jsonb AND "productId" <> ${productId ?? ""} LIMIT 1`;
  return rows.length > 0;
}

/**
 * Áp bản đang sửa vào live (trong transaction của thao tác duyệt). Trả về key file trên storage cần xoá sau commit
 * (ảnh bị xoá không còn ai dùng). Giá: chỉ ghi khi giá live vẫn đúng như lúc đưa vào bản đang sửa.
 */
export async function applyChangeRequest(tx: Tx, productId: string, approverId: string): Promise<{ orphanKeys: string[] }> {
  const cr = await readChanges(tx, productId);
  if (!cr) return { orphanKeys: [] };
  if (cr.content) {
    const { payload: live } = await livePayload(tx, productId);
    await writeProduct(tx, composePayload(cr.content, live), approverId, { mode: "apply" });
  }
  for (const [variantId, p] of Object.entries(cr.prices)) {
    const res = await tx.variant.updateMany({ where: { id: variantId, productId, priceMmk: p.baseLivePrice }, data: { priceMmk: p.priceMmk } });
    if (res.count !== 1) throw new CatalogError("Giá bán vừa bị đổi ở nơi khác — huỷ thay đổi giá rồi đặt lại");
    await tx.priceHistory.create({ data: { variantId, oldPriceMmk: p.baseLivePrice, newPriceMmk: p.priceMmk, reason: p.reason, runId: p.runId ?? null, userId: p.userId } });
  }
  const orphanKeys: string[] = [];
  if (cr.images.add.length) {
    const last = await tx.productImage.aggregate({ where: { productId }, _max: { sortOrder: true } });
    let sortOrder = (last._max.sortOrder ?? -1) + 1;
    for (const a of cr.images.add) await tx.productImage.create({ data: { productId, fileId: a.fileId, sortOrder: sortOrder++ } });
  }
  for (const imageId of cr.images.remove) {
    const image = await tx.productImage.findUnique({ where: { id: imageId } });
    if (!image || image.productId !== productId) continue;
    await tx.productImage.delete({ where: { id: imageId } });
    const key = await deleteFileIfUnused(tx, image.fileId);
    if (key) orphanKeys.push(key);
  }
  await tx.productChangeRequest.delete({ where: { productId } });
  return { orphanKeys };
}

/** Huỷ bản đang sửa: ảnh đã tải lên nhưng chưa gắn thì xoá file. Trả về key file storage cần xoá sau commit. */
export async function dropChangeRequest(tx: Tx, productId: string): Promise<{ orphanKeys: string[] }> {
  const cr = await readChanges(tx, productId);
  if (!cr) return { orphanKeys: [] };
  await tx.productChangeRequest.delete({ where: { productId } });
  const orphanKeys: string[] = [];
  for (const a of cr.images.add) {
    const key = await deleteFileIfUnused(tx, a.fileId);
    if (key) orphanKeys.push(key);
  }
  return { orphanKeys };
}

/** Đọc bản đang sửa để hiển thị (trang SP, cột "Thay đổi"). */
export async function changeRequestsFor(db: Tx, productIds: string[]) {
  if (productIds.length === 0) return new Map<string, ChangeRow>();
  const rows = await db.productChangeRequest.findMany({ where: { productId: { in: productIds } } });
  return new Map(
    rows.map((r) => [
      r.productId,
      { content: (r.content as ProductInput | null) ?? null, prices: (r.prices as Record<string, StagedPrice> | null) ?? {}, images: (r.images as StagedImages | null) ?? EMPTY_IMAGES },
    ]),
  );
}
export type ChangeRequestView = ChangeRow;
