import "server-only";
import { z } from "zod";
import { rawId } from "@/lib/schemas";
import { prisma } from "@/lib/db";
import { deleteStoredKeys } from "@/server/files/public-images";
import type { Tx } from "@/server/inventory/ledger";
import { productName } from "@/server/inventory/queries";
import { approvalHashes } from "./approval";
import { AWAITING_REVIEW_WHERE } from "./approval-rules";
import { applyChangeRequest, changeRequestsFor, composePayload, dropChangeRequest, livePayload, withSavepoint } from "./change-request";
import { summarizeChanges, type ChangeItem } from "./change-summary";
import { loadReadiness, ReadinessError, type LoadedReadiness } from "./readiness";
import { CatalogError, lockCatalog, saveProduct } from "./products";
import { PRODUCT_EDIT_INCLUDE, toProductEditData } from "./admin-queries";
import type { Issue } from "./readiness-rules";

/**
 * Quy trình duyệt SP (P1-A, kế hoạch admin §4): Gửi duyệt → Duyệt (& Đăng) / Từ chối; Huỷ thay đổi; Lưu & Duyệt.
 * Mỗi SP một transaction: khoá catalog → khoá dòng Product → CAS theo `approvalStatus` + `approvalVersion`
 * (người duyệt gửi kèm phiên bản đã xem — đổi sau đó thì bỏ qua, không duyệt bản chưa xem).
 */

const TX = { maxWait: 10_000, timeout: 60_000 };

export class StateChangedError extends CatalogError {
  constructor() {
    super("Nội dung vừa thay đổi — tải lại và xem lại trước khi duyệt");
    this.name = "StateChangedError";
  }
}

async function lockProduct(tx: Tx, id: string) {
  await lockCatalog(tx);
  await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = ${id} FOR UPDATE`;
  const p = await tx.product.findUnique({
    where: { id },
    select: { id: true, slug: true, archivedAt: true, published: true, approvedAt: true, approvalStatus: true, approvalVersion: true, translations: { select: { locale: true, name: true } } },
  });
  if (!p) throw new CatalogError("Không tìm thấy sản phẩm");
  return p;
}

/** Kiểm tra mở bán của SP SAU KHI áp bản đang sửa (nếu có) — xem trước, hoàn tác ngay. */
export async function readinessAfterChanges(tx: Tx, productId: string, approverId = "system"): Promise<LoadedReadiness> {
  const hasChanges = !!(await tx.productChangeRequest.findUnique({ where: { productId }, select: { productId: true } }));
  if (!hasChanges) return (await loadReadiness(tx, [productId])).get(productId)!;
  return withSavepoint(tx, async () => {
    await applyChangeRequest(tx, productId, approverId);
    return (await loadReadiness(tx, [productId])).get(productId)!;
  });
}

/** Trang SP: kiểm tra mở bán theo bản sẽ được duyệt (đọc, không ghi). */
export async function productReadinessView(productId: string) {
  return prisma.$transaction((tx) => readinessAfterChanges(tx, productId), TX);
}

/** Tóm tắt thay đổi của bản đang sửa so với live (nhiều SP một lần). */
export async function changeSummaries(db: Tx, productIds: string[]): Promise<Map<string, ChangeItem[]>> {
  const crs = await changeRequestsFor(db, productIds);
  if (crs.size === 0) return new Map();
  const products = await db.product.findMany({ where: { id: { in: [...crs.keys()] } }, include: PRODUCT_EDIT_INCLUDE });
  return new Map(
    products.map((p) => {
      const live = toProductEditData(p);
      return [p.id, summarizeChanges(live, crs.get(p.id)!)];
    }),
  );
}

// ── Gửi duyệt ──

async function submitOne(tx: Tx, id: string, userId: string) {
  const p = await lockProduct(tx, id);
  if (p.archivedAt) throw new CatalogError("Sản phẩm đã ngừng kinh doanh");
  if (p.approvalStatus === "PENDING") return { already: true };
  if (p.approvedAt && !(await tx.productChangeRequest.findUnique({ where: { productId: id }, select: { productId: true } }))) {
    throw new CatalogError("Không có thay đổi nào để gửi duyệt");
  }
  const readiness = await readinessAfterChanges(tx, id);
  if (readiness.errors.length) throw new ReadinessError(readiness.errors);
  await tx.product.update({ where: { id }, data: { approvalStatus: "PENDING", submittedAt: new Date(), submittedById: userId, rejectionReason: null } });
  await tx.auditLog.create({ data: { userId, action: "product.submit", entity: "Product", entityId: id, data: { version: p.approvalVersion } } });
  return { already: false };
}

export type ReviewResult = { id: string; name: string; ok: boolean; error?: string; issues?: Issue[]; stateChanged?: boolean };

async function nameOf(id: string) {
  const p = await prisma.product.findUnique({ where: { id }, select: { slug: true, translations: { select: { locale: true, name: true } } } });
  return p ? productName(p.translations, p.slug) : id;
}

async function perProduct(ids: string[], run: (tx: Tx, id: string) => Promise<{ orphanKeys?: string[] } | unknown>): Promise<ReviewResult[]> {
  const results: ReviewResult[] = [];
  for (const id of [...new Set(ids)]) {
    try {
      const out = (await prisma.$transaction((tx) => run(tx, id), TX)) as { orphanKeys?: string[] } | undefined;
      if (out?.orphanKeys?.length) await deleteStoredKeys(out.orphanKeys);
      results.push({ id, name: await nameOf(id), ok: true });
    } catch (e) {
      if (!(e instanceof CatalogError) && !(e instanceof ReadinessError)) throw e;
      results.push({
        id,
        name: await nameOf(id),
        ok: false,
        error: e.message,
        ...(e instanceof ReadinessError && { issues: e.issues }),
        ...(e instanceof StateChangedError && { stateChanged: true }),
      });
    }
  }
  return results;
}

const idsSchema = z.object({ ids: z.array(rawId).min(1, "Chưa chọn sản phẩm nào").max(500) });

/** Gửi duyệt (một hoặc nhiều SP). SP chưa đủ điều kiện / không có gì để gửi → báo lý do, SP khác vẫn gửi. */
export async function submitProducts(raw: unknown, userId: string) {
  const { ids } = idsSchema.parse(raw);
  return perProduct(ids, (tx, id) => submitOne(tx, id, userId));
}

/** Kết quả gửi duyệt cho các SP của một lượt (nhập Excel / áp bảng tính giá). */
export type BatchSubmitResult = {
  submitted: string[];
  already: string[];
  /** SP chưa gửi được: chưa đủ điều kiện (issues) hoặc lý do khác (error). */
  skipped: { id: string; name: string; error?: string; issues?: Issue[] }[];
};

/**
 * §6.4 "Gửi duyệt ngay": gửi duyệt các SP do lượt này tạo / sửa, trong CHÍNH transaction của lượt đó.
 * SP chưa đủ điều kiện → bỏ qua kèm lý do (lỗi kiểm tra là lỗi JS trước khi ghi → transaction vẫn dùng tiếp được).
 * SP đã duyệt mà không có bản đang sửa (vd. chỉ đổi khối lượng / hoa hồng) → không có gì để gửi, bỏ qua im lặng.
 */
export async function submitTouched(tx: Tx, productIds: string[], userId: string): Promise<BatchSubmitResult> {
  const out: BatchSubmitResult = { submitted: [], already: [], skipped: [] };
  for (const id of [...new Set(productIds)].sort()) {
    const p = await tx.product.findUnique({ where: { id }, select: { slug: true, archivedAt: true, approvedAt: true, translations: { select: { locale: true, name: true } } } });
    if (!p || p.archivedAt) continue;
    if (p.approvedAt && !(await tx.productChangeRequest.findUnique({ where: { productId: id }, select: { productId: true } }))) continue;
    try {
      const r = await submitOne(tx, id, userId);
      (r.already ? out.already : out.submitted).push(id);
    } catch (e) {
      if (!(e instanceof CatalogError) && !(e instanceof ReadinessError)) throw e;
      out.skipped.push({
        id,
        name: productName(p.translations, p.slug),
        ...(e instanceof ReadinessError ? { issues: e.issues } : { error: e.message }),
      });
    }
  }
  return out;
}

// ── Duyệt / Từ chối ──

const reviewSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.enum(["approve", "approvePublish"]), items: z.array(z.object({ id: rawId, version: z.coerce.number().int() })).min(1).max(500) }),
  z.object({
    decision: z.literal("reject"),
    items: z.array(z.object({ id: rawId, version: z.coerce.number().int() })).min(1).max(500),
    reason: z.string().trim().min(5, "Lý do từ chối cần ít nhất 5 ký tự").max(500),
  }),
]);

async function approveOne(tx: Tx, id: string, version: number, userId: string, opts: { publish: boolean; selfApproved?: boolean }) {
  const p = await lockProduct(tx, id);
  if (p.archivedAt) throw new CatalogError("Sản phẩm đã ngừng kinh doanh");
  if (p.approvalStatus !== "PENDING" || p.approvalVersion !== version) throw new StateChangedError();
  const changes = p.approvedAt ? (await changeSummaries(tx, [id])).get(id) ?? [] : null;
  const { orphanKeys } = p.approvedAt ? await applyChangeRequest(tx, id, userId) : { orphanKeys: [] as string[] };
  const readiness = (await loadReadiness(tx, [id])).get(id)!;
  if (readiness.errors.length) throw new ReadinessError(readiness.errors);
  const now = new Date();
  const hash = (await approvalHashes(tx, [id])).get(id)!;
  // "Duyệt & Đăng" chỉ đăng SP mới (chưa từng duyệt); duyệt thay đổi của SP đã duyệt giữ nguyên trạng thái hiển thị.
  const publish = opts.publish && !p.published && !p.approvedAt;
  await tx.product.update({
    where: { id },
    data: {
      approvedAt: now,
      approvedById: userId,
      approvedHash: hash,
      approvalStatus: "APPROVED",
      approvalVersion: { increment: 1 },
      rejectionReason: null,
      submittedAt: null,
      submittedById: null,
      ...(publish && { published: true }),
    },
  });
  if (publish) await tx.product.updateMany({ where: { id, firstPublishedAt: null }, data: { firstPublishedAt: now } });
  await tx.auditLog.create({
    data: { userId, action: "product.approve", entity: "Product", entityId: id, data: { hash, version, ...(changes && { changes }), ...(opts.selfApproved && { selfApproved: true }) } },
  });
  if (publish) await tx.auditLog.create({ data: { userId, action: "product.publish", entity: "Product", entityId: id, data: { withApproval: true } } });
  return { orphanKeys };
}

async function rejectOne(tx: Tx, id: string, version: number, reason: string, userId: string) {
  const p = await lockProduct(tx, id);
  if (p.approvalStatus !== "PENDING" || p.approvalVersion !== version) throw new StateChangedError();
  await tx.product.update({ where: { id }, data: { approvalStatus: "REJECTED", rejectionReason: reason, submittedAt: null, submittedById: null } });
  await tx.auditLog.create({ data: { userId, action: "product.reject", entity: "Product", entityId: id, data: { reason, version } } });
}

/**
 * Duyệt / Duyệt & Đăng / Từ chối (một hoặc nhiều SP, mỗi SP kèm phiên bản đã xem). Duyệt SP đã duyệt = áp bản
 * đang sửa vào live; trạng thái hiển thị giữ nguyên. Kết quả theo từng SP.
 */
export async function reviewProducts(raw: unknown, userId: string) {
  const input = reviewSchema.parse(raw);
  const version = new Map(input.items.map((i) => [i.id, i.version]));
  return perProduct(input.items.map((i) => i.id), (tx, id) =>
    input.decision === "reject"
      ? rejectOne(tx, id, version.get(id)!, input.reason, userId)
      : approveOne(tx, id, version.get(id)!, userId, { publish: input.decision === "approvePublish" }),
  );
}

/**
 * §6.4 "Duyệt luôn" (người có quyền duyệt): chạy SAU khi lượt nhập / áp giá đã commit, mỗi SP một transaction
 * (một SP lỗi không ảnh hưởng lượt và SP khác — SP lỗi giữ Chờ duyệt). Không bao giờ tự đăng SP mới;
 * SP đang bán chỉ được áp thay đổi. Ghi vết tự duyệt (`selfApproved`).
 */
export async function approveSubmitted(ids: string[], userId: string): Promise<ReviewResult[]> {
  if (ids.length === 0) return [];
  const versions = new Map(
    (await prisma.product.findMany({ where: { id: { in: ids }, approvalStatus: "PENDING" }, select: { id: true, approvalVersion: true } })).map((p) => [p.id, p.approvalVersion]),
  );
  return perProduct([...versions.keys()], (tx, id) => approveOne(tx, id, versions.get(id)!, userId, { publish: false, selfApproved: true }));
}

// ── Huỷ thay đổi / Lưu & Duyệt ──

/** Huỷ bản đang sửa của SP đã duyệt (về đúng bản đang bán). */
export async function discardChanges(raw: unknown, userId: string) {
  const { id } = z.object({ id: rawId }).parse(raw);
  const [result] = await perProduct([id], async (tx) => {
    const p = await lockProduct(tx, id);
    if (!p.approvedAt) throw new CatalogError("Sản phẩm chưa từng được duyệt — không có bản đang sửa");
    const { orphanKeys } = await dropChangeRequest(tx, id);
    await tx.product.update({ where: { id }, data: { approvalStatus: "APPROVED", approvalVersion: { increment: 1 }, rejectionReason: null, submittedAt: null, submittedById: null } });
    await tx.auditLog.create({ data: { userId, action: "product.change_discard", entity: "Product", entityId: id } });
    return { orphanKeys };
  });
  if (!result.ok) throw new CatalogError(result.error ?? "Không huỷ được");
  return result;
}

/**
 * Nút tắt cho người có quyền duyệt (Q-B): lưu rồi gửi + duyệt trong một transaction (tự duyệt, ghi vết `selfApproved`).
 * `publish`: SP chưa đăng thì đăng luôn. Không có gì cần duyệt → chỉ lưu.
 */
export async function saveAndApprove(raw: unknown, userId: string, opts: { publish: boolean }) {
  return prisma.$transaction(async (tx) => {
    const product = await saveProduct(raw, userId, tx);
    const p = await tx.product.findUniqueOrThrow({ where: { id: product.id }, select: { approvedAt: true, approvalStatus: true } });
    const hasChanges = !!(await tx.productChangeRequest.findUnique({ where: { productId: product.id }, select: { productId: true } }));
    if (p.approvedAt && !hasChanges) return { id: product.id, orphanKeys: [] as string[] };
    await submitOne(tx, product.id, userId);
    const { approvalVersion } = await tx.product.findUniqueOrThrow({ where: { id: product.id }, select: { approvalVersion: true } });
    const { orphanKeys } = await approveOne(tx, product.id, approvalVersion, userId, { publish: opts.publish, selfApproved: true });
    return { id: product.id, orphanKeys };
  }, TX).then(async (r) => {
    if (r.orphanKeys.length) await deleteStoredKeys(r.orphanKeys);
    return { id: r.id };
  });
}

/** Dashboard: số SP chờ duyệt (gồm bản đang sửa đã gửi) và bị từ chối. */
export async function reviewCounts() {
  const [pending, rejected] = await Promise.all([
    prisma.product.count({ where: AWAITING_REVIEW_WHERE }),
    prisma.product.count({ where: { archivedAt: null, approvalStatus: "REJECTED" } }),
  ]);
  return { pending, rejected };
}

/**
 * Dữ liệu form sửa SP: SP có bản đang sửa → form hiện bản đang sửa (phần cần duyệt) ghép với live (phần còn lại),
 * để lưu tiếp không làm mất thay đổi đang chờ. `draftBrandName`: thương hiệu gõ mới trong bản đang sửa (chưa tạo).
 */
export async function productEditView(id: string) {
  const p = await prisma.product.findUnique({ where: { id }, include: PRODUCT_EDIT_INCLUDE });
  if (!p) return null;
  const live = toProductEditData(p);
  const cr = (await changeRequestsFor(prisma, [id])).get(id) ?? null;
  const changes = cr ? summarizeChanges(live, cr) : null;
  if (!cr?.content) return { edit: live, draftBrandName: undefined, changes, changeRequest: cr };
  const { payload } = await livePayload(prisma, id);
  const merged = composePayload(cr.content, payload);
  const livePrice = new Map(live.variants.map((v) => [v.id, v.priceMmk]));
  const edit: typeof live = {
    ...live,
    brandId: merged.brandId ?? "",
    categoryId: merged.categoryId,
    my: { name: merged.my.name, description: merged.my.description, usage: merged.my.usage },
    en: { name: merged.en.name, description: merged.en.description, usage: merged.en.usage },
    variants: merged.variants.map((v) => ({
      id: v.id ?? "",
      sku: v.sku,
      label: v.label,
      priceMmk: (v.id && livePrice.get(v.id)) || 0,
      weightGrams: v.weightGrams ?? null,
      affiliateCommissionMmk: v.affiliateCommissionMmk ?? null,
      lowStockAt: v.lowStockAt,
      leadTimeDays: v.leadTimeDays,
      safetyStock: v.safetyStock,
      active: v.active,
      isBundle: v.isBundle,
      components: v.components,
    })),
  };
  return { edit, draftBrandName: merged.brandId ? undefined : merged.brandName, changes, changeRequest: cr };
}
