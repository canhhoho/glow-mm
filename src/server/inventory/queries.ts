import "server-only";
import { variantDisplayName } from "@/lib/variant-label";
import { prisma } from "@/lib/db";
import { balanceKey, previewDocument, type PreviewDoc } from "./document-preview";
import { receiptSourceLine } from "@/server/pricing/cost";
import type { DocStatus, DocType, Prisma } from "@/generated/prisma/client";
import { addDays, yangonDayKey, yangonDayStart } from "@/lib/time";

/** Tên hiển thị của sản phẩm cho admin: ưu tiên tiếng Anh, sau đó tiếng Myanmar. */
export function productName(translations: { locale: string; name: string }[], fallback: string) {
  return (translations.find((t) => t.locale === "en") ?? translations[0])?.name ?? fallback;
}

/** Kho đang dùng (ô chọn kho ở phiếu kho, nhập Excel). `includeInactive`: cả kho đã ngừng (xuất/chuyển tồn cũ). */
export async function listLocations(opts: { includeInactive?: boolean } = {}) {
  return prisma.location.findMany({
    where: opts.includeInactive ? undefined : { active: true },
    orderBy: [{ active: "desc" }, { code: "asc" }],
  });
}

/**
 * Biến thể chọn được ở form Xuất / Chuyển / Điều chỉnh (#2): đang dùng, HOẶC đã tắt / SP ngừng KD nhưng còn tồn —
 * để dọn nốt tồn còn lại. `inactive` / `archived` để form gắn nhãn. Không đổi quyền bán: storefront và đơn lọc
 * `active` + `published` + `archivedAt` riêng, nên chuyển tồn của biến thể đã tắt không làm nó bán lại.
 */
export async function listVariantsForPicker() {
  const variants = await prisma.variant.findMany({
    where: { OR: [{ active: true }, { batches: { some: { balances: { some: { qty: { not: 0 } } } } } }] },
    orderBy: { sku: "asc" },
    include: { product: { include: { translations: true } } },
  });
  return variants.map((v) => ({
    id: v.id,
    sku: v.sku,
    isBundle: v.isBundle,
    requiresExpiry: v.product.requiresExpiry,
    inactive: !v.active,
    archived: v.product.archivedAt != null,
    label: `${v.sku} — ${variantDisplayName(productName(v.product.translations, v.product.slug), v.label)}`,
    // Bộ chọn 3 ô ở phiếu kho (tên SP → SKU → phân loại, 18/11/2026).
    productId: v.productId,
    productName: productName(v.product.translations, v.product.slug),
    variantLabel: v.label,
  }));
}

/** Biến thể nhập kho được (đang dùng, không phải combo) cho bảng nhập nhanh; `lastCost` = giá mua của lần nhập gần nhất. */
/** `includeIds`: biến thể đang có trong phiếu nháp được sửa — luôn kèm (kể cả đã tắt / ngừng KD) để không rơi dòng khi lưu. */
/**
 * Số lô gợi ý của phiếu nhập (19/11/2026): "NK" + ngày tạo phiếu (giờ Yangon) dạng yymmdd — cùng mẫu với lô tự sinh trước đây.
 * Tính ở server để server/client hiển thị giống nhau (không lệch hydration quanh nửa đêm).
 */
export function suggestedReceiveLot(now = new Date()): string {
  return `NK${yangonDayKey(now).slice(2).replaceAll("-", "")}`;
}

/**
 * Danh sách gợi ý của phiếu nhập: mọi phân loại đang bán (không combo, SP chưa ngừng kinh doanh), kèm dữ liệu cho bộ lọc
 * (thương hiệu, danh mục, kho bán, tình trạng hàng, SL dự kiến nhập) và giá trị gợi ý (SL dự kiến nhập, giá mua hiện tại).
 */
export async function listVariantsForReceive(opts: { includeIds?: string[] } = {}) {
  const [variants, lastVnd, lastMmk, balances, waiting] = await Promise.all([
    prisma.variant.findMany({
      where: {
        isBundle: false,
        OR: [{ active: true, product: { archivedAt: null } }, ...(opts.includeIds?.length ? [{ id: { in: opts.includeIds } }] : [])],
      },
      orderBy: { sku: "asc" },
      include: {
        product: {
          include: {
            translations: true,
            brand: true,
            stockLocation: { select: { pricingMode: true } },
            category: { select: { id: true, slug: true, translations: { select: { locale: true, name: true } } } },
          },
        },
      },
    }),
    // Giá mua gợi ý: giá của lần nhập ĐÃ GHI SỔ gần nhất (hàng bán được) — không phải giá bình quân của lô (P1-C, A1 16/11).
    prisma.stockDocumentLine.findMany({
      where: { unitCostVnd: { not: null }, ...receiptSourceLine },
      distinct: ["variantId"],
      orderBy: [{ variantId: "asc" }, { document: { postedAt: "desc" } }, { id: "desc" }],
      select: { variantId: true, unitCostVnd: true },
    }),
    prisma.stockDocumentLine.findMany({
      where: { unitCostMmk: { not: null }, ...receiptSourceLine },
      distinct: ["variantId"],
      orderBy: [{ variantId: "asc" }, { document: { postedAt: "desc" } }, { id: "desc" }],
      select: { variantId: true, unitCostMmk: true },
    }),
    // Tồn hàng bán ở kho bán (bộ lọc "Còn hàng / Hết hàng") — chỉ để lọc, không phải số khả dụng (không trừ giữ hàng).
    prisma.stockBalance.findMany({
      where: { qty: { gt: 0 }, stockType: "SELLABLE", location: { sellable: true } },
      select: { qty: true, batch: { select: { variantId: true } } },
    }),
    // Đơn đặt trước đang chờ hàng (bộ lọc "Có đơn chờ hàng").
    prisma.orderItem.groupBy({ by: ["variantId"], where: { order: { status: "AWAITING_STOCK" } }, _sum: { qty: true } }),
  ]);
  const vnd = new Map(lastVnd.map((b) => [b.variantId, b.unitCostVnd]));
  const mmk = new Map(lastMmk.map((b) => [b.variantId, b.unitCostMmk]));
  const onHand = new Map<string, number>();
  for (const b of balances) onHand.set(b.batch.variantId, (onHand.get(b.batch.variantId) ?? 0) + b.qty);
  const awaiting = new Map(waiting.map((w) => [w.variantId, w._sum.qty ?? 0]));
  return variants.map((v) => {
    // P24: loại tiền giá mua theo kho của SP (kho mua tại Myanmar → MMK). SP chưa có kho → null, form lấy theo kho nhận.
    const loc = v.product.stockLocation;
    const currency = !loc ? null : loc.pricingMode === "LOCAL_MMK" ? ("MMK" as const) : ("VND" as const);
    return {
      id: v.id,
      sku: v.sku,
      productId: v.productId,
      name: productName(v.product.translations, v.product.slug),
      label: v.label,
      brand: v.product.brand.name,
      stockLocationId: v.product.stockLocationId,
      /** QT1b: chưa có → nhập ở cột Khối lượng của phiếu nhập. */
      weightGrams: v.weightGrams,
      requiresExpiry: v.product.requiresExpiry,
      currency,
      lastCost: (currency === "MMK" ? mmk.get(v.id) : currency === "VND" ? vnd.get(v.id) : undefined) ?? null,
      /** Giá mua hiện tại theo tiền của kho bán (19/11/2026) — gợi ý giá mua của phiếu; null = chưa có (dùng giá lần nhập trước). */
      purchasePrice: (currency === "MMK" ? v.purchasePriceMmk : currency === "VND" ? v.purchasePriceVnd : null) ?? null,
      /** SL dự kiến nhập (điền khi tạo SP / Excel) — gợi ý số lượng của phiếu. */
      plannedQty: v.plannedReceiveQty,
      categoryId: v.product.categoryId,
      category: v.product.category ? productName(v.product.category.translations, v.product.category.slug) : "",
      onHand: onHand.get(v.id) ?? 0,
      awaiting: awaiting.get(v.id) ?? 0,
    };
  });
}
export type ReceiveVariant = Awaited<ReturnType<typeof listVariantsForReceive>>[number];

/**
 * Mọi lô (kèm tồn theo vị trí) — dữ liệu cho form phiếu kho. `posted` = lô đã có sổ kho (đã ghi nhận nhập thật);
 * lô chỉ thuộc phiếu nhập nháp chưa có sổ → form Điều chỉnh không cho chọn (#4).
 */
export async function batchesForForms() {
  const batches = await prisma.batch.findMany({
    orderBy: [{ expiryDate: "asc" }],
    include: { balances: { where: { qty: { not: 0 } } }, _count: { select: { ledger: true } } },
  });
  return batches.map((b) => ({
    id: b.id,
    variantId: b.variantId,
    lotNo: b.lotNo,
    expiryDate: b.expiryDate?.toISOString().slice(0, 10) ?? "",
    expiryStatus: b.expiryStatus,
    posted: b._count.ledger > 0,
    balances: b.balances.map((x) => ({ locationId: x.locationId, stockType: x.stockType, qty: x.qty })),
  }));
}

export const DOC_PAGE_SIZE = 50;
const DOC_TYPES = ["RECEIVE", "TRANSFER", "ISSUE", "ADJUST", "RETURN"] as const satisfies readonly DocType[];
export const isDocType = (v: unknown): v is DocType => DOC_TYPES.includes(v as (typeof DOC_TYPES)[number]);
export { DOC_TYPES };

/**
 * Danh sách phiếu kho (20/11/2026, audit #3): tìm theo mã phiếu / SKU / lý do, lọc loại phiếu và khoảng ngày tạo (giờ Yangon),
 * phân trang — trước đây cắt cứng 200 phiếu mới nhất, phiếu cũ hơn không mở được từ danh sách.
 */
export async function listDocuments(filter: { type?: DocType; status?: DocStatus; q?: string; from?: string; to?: string; page?: number }) {
  const q = filter.q?.trim();
  let { from, to } = filter;
  const day = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);
  from = day(from);
  to = day(to);
  if (from && to && from > to) [from, to] = [to, from];
  const where: Prisma.StockDocumentWhereInput = {
    type: filter.type,
    status: filter.status,
    ...(q && {
      OR: [
        { code: { contains: q, mode: "insensitive" } },
        { reason: { contains: q, mode: "insensitive" } },
        { lines: { some: { variant: { sku: { contains: q, mode: "insensitive" } } } } },
      ],
    }),
    ...((from || to) && { createdAt: { ...(from && { gte: yangonDayStart(from) }), ...(to && { lt: yangonDayStart(addDays(to, 1)) }) } }),
  };
  const total = await prisma.stockDocument.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / DOC_PAGE_SIZE));
  const page = Math.min(Math.max(1, filter.page ?? 1), pageCount);
  const rows = await prisma.stockDocument.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * DOC_PAGE_SIZE,
    take: DOC_PAGE_SIZE,
    include: { from: true, to: true, _count: { select: { lines: true } } },
  });
  return { rows, total, page, pageCount };
}

export async function getDocument(id: string) {
  return prisma.stockDocument.findUnique({
    where: { id },
    include: {
      from: true,
      to: true,
      shipment: true,
      lines: {
        include: { batch: true, rate: true, variant: { include: { product: { include: { translations: true } } } } },
        orderBy: { id: "asc" },
      },
    },
  });
}

/**
 * Xem trước ghi sổ của phiếu nháp: tồn hiện tại tại kho đi / đến theo biến thể × loại tồn (cộng mọi lô) rồi tính thay đổi
 * và tồn dự kiến (`document-preview.ts`). Chỉ đọc; server vẫn kiểm tra lại khi ghi sổ.
 */
export async function loadDocumentPreview(doc: PreviewDoc) {
  const locationIds = [doc.fromId, doc.toId].filter((x): x is string => !!x);
  const variantIds = [...new Set(doc.lines.map((l) => l.variantId))];
  const rows = locationIds.length && variantIds.length
    ? await prisma.stockBalance.findMany({
        where: { locationId: { in: locationIds }, qty: { not: 0 }, batch: { variantId: { in: variantIds } } },
        select: { locationId: true, stockType: true, qty: true, batch: { select: { variantId: true } } },
      })
    : [];
  const current = new Map<string, number>();
  for (const r of rows) {
    const key = balanceKey(r.locationId, r.batch.variantId, r.stockType);
    current.set(key, (current.get(key) ?? 0) + r.qty);
  }
  return previewDocument(doc, current);
}

export async function listShipments() {
  return prisma.inboundShipment.findMany({
    orderBy: { createdAt: "desc" },
    include: { costs: true, _count: { select: { batches: true } } },
  });
}

export async function getShipment(id: string) {
  return prisma.inboundShipment.findUnique({
    where: { id },
    include: {
      costs: { orderBy: { type: "asc" } },
      batches: { include: { variant: true, rate: true }, orderBy: { lotNo: "asc" } },
    },
  });
}
