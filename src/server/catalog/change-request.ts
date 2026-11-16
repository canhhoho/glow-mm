import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { deleteFileIfUnused } from "@/server/files/public-images";
import type { Tx } from "@/server/inventory/ledger";
import { PRODUCT_EDIT_INCLUDE, toProductEditData, type ProductEditData } from "./admin-queries";
import { approvalHashes, guardApproval } from "./approval";
import { CatalogError, productSchema, writeProduct, type ProductInput } from "./products";
import { commissionOverPrice, writeLivePrice } from "./price-write";

/**
 * Bản đang sửa của SP đã duyệt (P1-A, kế hoạch admin §6). Khách luôn thấy bản live (đã duyệt); thay đổi cần duyệt
 * nằm ở `ProductChangeRequest` cho đến khi được duyệt (áp vào live qua `writeProduct` + ghi giá) hoặc bị huỷ.
 *
 * Phân loại (người dùng không thấy): CẦN DUYỆT = tên, mô tả, danh mục, thương hiệu, SKU/nhãn/bật-tắt biến thể,
 * combo, thêm/xoá ảnh, giá bán + hoa hồng CTV cố định (16/11: có hiệu lực CÙNG LÚC với giá khi duyệt).
 * KHÔNG CẦN DUYỆT (ghi thẳng) = khối lượng, ngưỡng tồn, lãi cố định, kho bán, hạn dùng/PAO, ghi chú bảo quản,
 * cách dùng, thành phần, tag, slug, thứ tự/alt ảnh, đặt trước.
 */

/**
 * Giá (và hoa hồng) chờ duyệt của một biến thể. `priceMmk` = giá sẽ áp (bằng giá live nếu chỉ đổi hoa hồng).
 * `commission` có mặt = hoa hồng CTV cố định đổi (`value` null = theo % CTV), `base` = hoa hồng live lúc đưa vào.
 * Bản ghi cũ (trước 16/11) không có `commission` / `stagedAt` → vẫn đọc được.
 */
export type StagedPrice = {
  priceMmk: number;
  baseLivePrice: number;
  commission?: { value: number | null; base: number | null };
  reason: string;
  runId?: string | null;
  userId: string;
  stagedAt?: string;
};

export const effectivePrice = (sp: StagedPrice | undefined, live: number) => sp?.priceMmk ?? live;
export const effectiveCommission = (sp: StagedPrice | undefined, live: number | null) => (sp?.commission ? sp.commission.value : live);

/** Thay đổi giá / hoa hồng của một biến thể. `priceMmk` / `commission` undefined = không đổi phần đó. */
export type PriceEntry = { variantId: string; priceMmk?: number; commission?: number | null; reason: string; runId?: string | null };

/**
 * Gộp một thay đổi vào `prices` (sửa tại chỗ). Trở về đúng giá + hoa hồng live → bỏ khỏi bản đang sửa.
 * Trả về true nếu giá trị hiệu lực đổi.
 */
function mergeStaged(prices: Record<string, StagedPrice>, live: { priceMmk: number; affiliateCommissionMmk: number | null }, e: PriceEntry, userId: string, now: Date) {
  const id = e.variantId;
  const cur = prices[id];
  const curPrice = effectivePrice(cur, live.priceMmk);
  const curCommission = effectiveCommission(cur, live.affiliateCommissionMmk);
  const price = e.priceMmk ?? curPrice;
  const commission = e.commission !== undefined ? e.commission : curCommission;
  if (price === curPrice && commission === curCommission) return false;
  if (price < 1) throw new CatalogError("Giá bán phải lớn hơn 0");
  if (price === live.priceMmk && commission === live.affiliateCommissionMmk) {
    delete prices[id];
    return true;
  }
  const priceMoved = price !== curPrice;
  prices[id] = {
    priceMmk: price,
    baseLivePrice: live.priceMmk,
    ...(commission !== live.affiliateCommissionMmk && { commission: { value: commission, base: live.affiliateCommissionMmk } }),
    reason: priceMoved || !cur ? e.reason : cur.reason,
    runId: priceMoved || !cur ? (e.runId ?? null) : (cur.runId ?? null),
    userId,
    stagedAt: now.toISOString(),
  };
  return true;
}
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
 * Biến thể có id: hợp hai bên, giá bỏ trống (= giữ giá live; giá đổi đi qua `prices`). Biến thể mới (chưa có id)
 * chỉ lấy từ `a`, giữ nguyên giá ban đầu của nó.
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
  // Biến thể mới (chưa có id) giữ giá + hoa hồng gửi kèm (Excel thêm SKU mới cho SP đã duyệt — A2 16/11): áp khi duyệt.
  for (const v of a.variants) if (!v.id) variants.push({ ...v });
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

/** Biến thể có sẵn: bỏ giá + hoa hồng (đi qua `prices`); biến thể mới giữ nguyên (áp cùng nội dung). */
const withoutPrices = (p: ProductInput): ProductInput => ({
  ...p,
  variants: p.variants.map((v) => (v.id ? { ...v, priceMmk: undefined, affiliateCommissionMmk: undefined } : v)),
});

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

  // Giá + hoa hồng trong payload (nhập Excel): SKU có sẵn đổi → bản đang sửa (có hiệu lực cùng lúc khi duyệt).
  const prices = { ...(existing?.prices ?? {}) };
  let pricesChanged = false;
  const liveVariants = await tx.variant.findMany({ where: { productId }, select: { id: true, sku: true, priceMmk: true, affiliateCommissionMmk: true } });
  const liveById = new Map(liveVariants.map((v) => [v.id, v]));
  const now = new Date();
  for (const v of parsed.variants) {
    const live = v.id ? liveById.get(v.id) : undefined;
    if (!live || (v.priceMmk === undefined && v.affiliateCommissionMmk === undefined)) continue;
    if (v.priceMmk !== undefined && v.priceMmk < 1) throw new CatalogError(`Giá bán của ${v.sku} phải lớn hơn 0`);
    const entry: PriceEntry = { variantId: live.id, priceMmk: v.priceMmk, commission: v.affiliateCommissionMmk, reason: opts.priceReason ?? "manual" };
    if (mergeStaged(prices, live, entry, userId, now)) pricesChanged = true;
  }
  checkCommissions(prices, liveVariants);

  const next: ChangeRow = {
    content: candidateHash === liveHash ? null : incoming,
    prices,
    images: existing?.images ?? EMPTY_IMAGES,
  };
  if (existing || !isEmpty(next)) await writeChanges(tx, productId, next, userId, contentChanged || pricesChanged);
  return tx.product.findUniqueOrThrow({ where: { id: productId } });
}

/** Hoa hồng CTV hiệu lực không được vượt giá hiệu lực (giá > 0). */
function checkCommissions(prices: Record<string, StagedPrice>, live: { id: string; sku: string; priceMmk: number; affiliateCommissionMmk: number | null }[]) {
  for (const v of live) {
    const price = effectivePrice(prices[v.id], v.priceMmk);
    const commission = effectiveCommission(prices[v.id], v.affiliateCommissionMmk);
    if (commissionOverPrice(price, commission)) throw new CatalogError(`Hoa hồng CTV của ${v.sku} lớn hơn giá bán`);
  }
}

/**
 * Giá + hoa hồng HIỆU LỰC của các biến thể (để so xung đột / hiển thị): trong bản đang sửa nếu SP đã duyệt và có
 * giá chờ, nếu không là live. `pending` = đang có giá/hoa hồng chờ duyệt. Một cách tính cho mọi đường (R1).
 */
export async function effectivePricingOf(tx: Tx, variantIds: string[]) {
  const variants = await tx.variant.findMany({
    where: { id: { in: variantIds } },
    select: { id: true, productId: true, priceMmk: true, affiliateCommissionMmk: true, product: { select: { approvedAt: true } } },
  });
  const staged = await changeRequestsFor(tx, [...new Set(variants.filter((v) => v.product.approvedAt).map((v) => v.productId))]);
  return new Map(
    variants.map((v) => {
      const sp = staged.get(v.productId)?.prices[v.id];
      return [v.id, { priceMmk: effectivePrice(sp, v.priceMmk), commission: effectiveCommission(sp, v.affiliateCommissionMmk), pending: !!sp }] as const;
    }),
  );
}

/** `effectivePricingOf` cho mọi biến thể của một SP. */
export async function effectivePricing(tx: Tx, productId: string) {
  const ids = (await tx.variant.findMany({ where: { productId }, select: { id: true } })).map((v) => v.id);
  return effectivePricingOf(tx, ids);
}

/**
 * Đưa giá / hoa hồng của SP đã duyệt vào bản đang sửa (Giá bán / bảng tính giá / Excel); giữ nguyên các phần khác
 * của bản đang sửa. Trở về đúng giá trị live → bỏ khỏi bản. Hoa hồng hiệu lực > giá hiệu lực → lỗi.
 */
export async function stagePrices(tx: Tx, productId: string, entries: PriceEntry[], userId: string) {
  if (entries.length === 0) return;
  const existing = await readChanges(tx, productId);
  const liveRows = await tx.variant.findMany({ where: { productId }, select: { id: true, sku: true, priceMmk: true, affiliateCommissionMmk: true } });
  const live = new Map(liveRows.map((v) => [v.id, v]));
  const prices = { ...(existing?.prices ?? {}) };
  let changed = false;
  const now = new Date();
  for (const e of entries) {
    const v = live.get(e.variantId);
    if (!v) throw new CatalogError("Biến thể không thuộc sản phẩm này");
    if (mergeStaged(prices, v, e, userId, now)) changed = true;
  }
  if (!changed) return;
  checkCommissions(prices, liveRows);
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
  // Giá + hoa hồng có hiệu lực CÙNG LÚC (16/11): chỉ ghi khi live vẫn đúng như lúc đưa vào bản đang sửa.
  for (const [variantId, p] of Object.entries(cr.prices)) {
    // Bản cũ (trước 16/11) không có `commission` → không đụng hoa hồng.
    const ok = await writeLivePrice(tx, {
      variantId,
      productId,
      from: { priceMmk: p.baseLivePrice, ...(p.commission && { commission: p.commission.base }) },
      to: { priceMmk: p.priceMmk, ...(p.commission && { commission: p.commission.value }) },
      reason: p.reason,
      runId: p.runId,
      userId: p.userId,
    });
    if (!ok) throw new CatalogError("Giá bán / hoa hồng CTV vừa bị đổi ở nơi khác — huỷ thay đổi giá rồi đặt lại");
  }
  checkCommissions({}, await tx.variant.findMany({ where: { productId }, select: { id: true, sku: true, priceMmk: true, affiliateCommissionMmk: true } }));
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
