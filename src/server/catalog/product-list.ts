import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { salesBlockDays } from "@/server/inventory/documents";
import { productName } from "@/server/inventory/queries";
import { availableToSell } from "@/server/orders/availability";
import { preorderCapacity } from "@/server/orders/preorder";
import { AWAITING_REVIEW_WHERE, deriveLabel, labelWhere, type ChangeLabel, type ProductLabel } from "./approval-rules";
import { loadReadiness, loadReadinessErrors } from "./readiness";
import { changeRequestsFor } from "./change-request";

/**
 * Danh sách SP admin có phân trang (P3, ảnh thiết kế "Sản phẩm"). Tab = trạng thái hiển thị (cùng quy tắc nhãn §4.2);
 * "Chờ hoàn thiện" / "Nháp" tách theo kiểm tra mở bán, "Hết hàng" theo khả dụng — tính trên tập ứng viên rồi mới
 * cắt trang. Mỗi dòng: ảnh đại diện, SKU, giá, tồn bán được, điều kiện bán (còn hàng / đặt trước / hết hàng).
 */
export const LIST_TABS = ["active", "published", "review", "incomplete", "draft", "hidden", "outOfStock", "rejected", "archived"] as const;
export type ListTab = (typeof LIST_TABS)[number];
/** Tab chính trên danh sách (theo việc cần làm); trạng thái phụ nằm trong ô chọn "Trạng thái khác" — cùng tham số `status`. */
export const MAIN_LIST_TABS = ["active", "incomplete", "review", "published", "archived"] as const satisfies readonly ListTab[];
export const OTHER_LIST_TABS = ["draft", "hidden", "outOfStock", "rejected"] as const satisfies readonly ListTab[];
export const SELL_MODES = ["instock", "preorder", "out"] as const;
export type SellMode = (typeof SELL_MODES)[number];
export const PAGE_SIZES = [20, 50, 100] as const;

/** Tham số cũ (link, dashboard trước P3) → tab mới. */
export function parseListTab(v: unknown): ListTab {
  if (v === "toApprove" || v === "reapprove") return "review";
  if (v === "ready") return "draft";
  return LIST_TABS.find((t) => t === v) ?? "active";
}

export type ListFilter = {
  tab: ListTab;
  q?: string;
  brandId?: string;
  categoryId?: string;
  warehouseId?: string;
  sell?: SellMode;
  page?: number;
  pageSize?: number;
};

function tabWhere(tab: ListTab): Prisma.ProductWhereInput {
  switch (tab) {
    case "active":
      return { archivedAt: null };
    case "published":
    case "outOfStock":
      return labelWhere("PUBLISHED");
    case "review":
      return AWAITING_REVIEW_WHERE;
    case "incomplete":
    case "draft":
      return labelWhere("DRAFT");
    case "hidden":
      return labelWhere("HIDDEN");
    case "rejected":
      return { archivedAt: null, approvalStatus: "REJECTED" };
    case "archived":
      return labelWhere("ARCHIVED");
  }
}

/** Nhãn hiển thị trên danh sách: Nháp còn lỗi mở bán → "Chờ hoàn thiện". */
export type ListLabel = ProductLabel | "INCOMPLETE";

type Candidate = { id: string; preorderEnabled: boolean; variants: { id: string; isBundle: boolean }[] };

/** Tồn bán được (tổng biến thể thường; chỉ có combo → số bộ) + điều kiện bán của từng SP. */
async function stockOf(candidates: Candidate[], now: Date) {
  const variantIds = candidates.flatMap((p) => p.variants.map((v) => v.id));
  const available = variantIds.length ? await availableToSell(prisma, variantIds, { now, blockDays: await salesBlockDays() }) : new Map<string, number>();
  const sum = (p: Candidate) => {
    const plain = p.variants.filter((v) => !v.isBundle);
    return (plain.length ? plain : p.variants).reduce((s, v) => s + (available.get(v.id) ?? 0), 0);
  };
  const outIds = candidates.filter((p) => p.variants.length > 0 && sum(p) <= 0);
  const capacity = await preorderCapacity(prisma, outIds.flatMap((p) => (p.preorderEnabled ? p.variants.filter((v) => !v.isBundle).map((v) => v.id) : [])));
  return new Map(
    candidates.map((p) => {
      if (p.variants.length === 0) return [p.id, { stock: null as number | null, sell: "out" as SellMode }];
      const stock = sum(p);
      const sell: SellMode = stock > 0 ? "instock" : p.preorderEnabled && p.variants.some((v) => !v.isBundle && (capacity.get(v.id) ?? 0) > 0) ? "preorder" : "out";
      return [p.id, { stock, sell }];
    }),
  );
}

export async function listProductsPage(f: ListFilter, now = new Date()) {
  const q = f.q?.trim();
  const pageSize = PAGE_SIZES.find((s) => s === f.pageSize) ?? PAGE_SIZES[0];
  const where: Prisma.ProductWhereInput = {
    ...tabWhere(f.tab),
    ...(q && {
      OR: [
        { slug: { contains: q, mode: "insensitive" } },
        { translations: { some: { name: { contains: q, mode: "insensitive" } } } },
        { variants: { some: { sku: { contains: q, mode: "insensitive" } } } },
      ],
    }),
    ...(f.brandId && { brandId: f.brandId }),
    ...(f.warehouseId && { stockLocationId: f.warehouseId }),
    ...(f.categoryId && { category: { OR: [{ id: f.categoryId }, { parentId: f.categoryId }] } }),
  };
  const candidates = await prisma.product.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    select: { id: true, preorderEnabled: true, variants: { where: { active: true }, select: { id: true, isBundle: true } } },
  });

  // Lọc theo dữ liệu tính được (kiểm tra mở bán, khả dụng) trên toàn bộ ứng viên rồi mới cắt trang.
  let ids = candidates.map((c) => c.id);
  if (f.tab === "incomplete" || f.tab === "draft") {
    const r = await loadReadinessErrors(prisma, ids);
    ids = ids.filter((id) => ((r.get(id)?.length ?? 0) > 0) === (f.tab === "incomplete"));
  }
  if (f.tab === "outOfStock" || f.sell) {
    const keep = new Set(ids);
    const stock = await stockOf(candidates.filter((c) => keep.has(c.id)), now);
    ids = ids.filter((id) => {
      const s = stock.get(id)!;
      return (f.tab !== "outOfStock" || s.sell !== "instock") && (!f.sell || s.sell === f.sell);
    });
  }

  const total = ids.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, f.page ?? 1), pageCount);
  const pageIds = ids.slice((page - 1) * pageSize, page * pageSize);

  const rows = await prisma.product.findMany({
    where: { id: { in: pageIds } },
    include: {
      brand: { select: { name: true } },
      category: { select: { slug: true, translations: { select: { locale: true, name: true } } } },
      stockLocation: { select: { name: true } },
      translations: { select: { locale: true, name: true } },
      variants: { orderBy: { sku: "asc" }, select: { id: true, sku: true, label: true, priceMmk: true, isBundle: true, active: true } },
      images: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }], take: 1, select: { alt: true, file: { select: { url: true } } } },
      changeRequest: { select: { productId: true } },
    },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = pageIds.map((id) => byId.get(id)!).filter(Boolean);
  const readiness = await loadReadiness(prisma, ordered.filter((p) => !p.approvedAt && !p.archivedAt).map((p) => p.id), now);
  const stock = await stockOf(candidates.filter((c) => pageIds.includes(c.id)), now);
  // Giá chờ duyệt (SP đã duyệt có bản đang sửa) — hiện cạnh giá đang bán.
  const staged = await changeRequestsFor(prisma, ordered.filter((p) => p.approvedAt && p.changeRequest).map((p) => p.id));

  return {
    total,
    page,
    pageSize,
    pageCount,
    rows: ordered.map((p) => {
      const lab = deriveLabel({ ...p, hasChanges: !!p.changeRequest });
      const missing = readiness.get(p.id)?.errors.length ?? 0;
      const active = p.variants.filter((v) => v.active);
      const prices = active.map((v) => v.priceMmk).filter((x) => x > 0);
      const stagedPrices = staged.get(p.id)?.prices ?? {};
      const pending = active.flatMap((v) => {
        const x = stagedPrices[v.id]?.priceMmk;
        return x != null && x > 0 && x !== v.priceMmk ? [x] : [];
      });
      const s = stock.get(p.id) ?? { stock: null, sell: "out" as SellMode };
      return {
        id: p.id,
        slug: p.slug,
        name: productName(p.translations, p.slug),
        brand: p.brand.name,
        category: productName(p.category.translations, p.category.slug),
        warehouse: p.stockLocation.name,
        image: p.images[0] ? { url: p.images[0].file.url, alt: p.images[0].alt ?? "" } : null,
        updatedAt: p.updatedAt,
        label: (lab.label === "DRAFT" && missing > 0 ? "INCOMPLETE" : lab.label) as ListLabel,
        change: lab.change as ChangeLabel | null,
        missing,
        published: p.published,
        archived: p.archivedAt !== null,
        approvedAt: p.approvedAt,
        approvalVersion: p.approvalVersion,
        hasChanges: !!p.changeRequest,
        variants: p.variants.map((v) => ({ sku: v.sku, label: v.label, isBundle: v.isBundle, active: v.active })),
        priceMin: prices.length ? Math.min(...prices) : null,
        priceMax: prices.length ? Math.max(...prices) : null,
        pendingMin: pending.length ? Math.min(...pending) : null,
        pendingMax: pending.length ? Math.max(...pending) : null,
        stock: s.stock,
        sell: s.sell,
      };
    }),
  };
}
export type ProductListRow = Awaited<ReturnType<typeof listProductsPage>>["rows"][number];

/**
 * P3b — SP trước / sau theo thứ tự mặc định của danh sách (mới cập nhật trước, chưa ngừng KD).
 * Thứ tự đổi khi SP được lưu (updatedAt) — chấp nhận được cho nút duyệt nhanh.
 */
export async function adjacentProducts(id: string) {
  const cur = await prisma.product.findUnique({ where: { id }, select: { updatedAt: true } });
  if (!cur) return { prev: null, next: null };
  const at = cur.updatedAt;
  const [prev, next] = await Promise.all([
    prisma.product.findFirst({
      where: { archivedAt: null, id: { not: id }, OR: [{ updatedAt: { gt: at } }, { updatedAt: at, id: { lt: id } }] },
      orderBy: [{ updatedAt: "asc" }, { id: "desc" }],
      select: { id: true },
    }),
    prisma.product.findFirst({
      where: { archivedAt: null, id: { not: id }, OR: [{ updatedAt: { lt: at } }, { updatedAt: at, id: { gt: id } }] },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      select: { id: true },
    }),
  ]);
  return { prev: prev?.id ?? null, next: next?.id ?? null };
}
