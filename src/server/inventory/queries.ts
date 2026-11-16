import "server-only";
import { prisma } from "@/lib/db";
import { balanceKey, previewDocument, type PreviewDoc } from "./document-preview";
import { receiptSourceLine } from "@/server/pricing/cost";
import type { DocStatus, DocType } from "@/generated/prisma/client";

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
    label: `${v.sku} — ${productName(v.product.translations, v.product.slug)} (${v.label})`,
  }));
}

/** Biến thể nhập kho được (đang dùng, không phải combo) cho bảng nhập nhanh; `lastCost` = giá mua của lần nhập gần nhất. */
/** `includeIds`: biến thể đang có trong phiếu nháp được sửa — luôn kèm (kể cả đã tắt / ngừng KD) để không rơi dòng khi lưu. */
export async function listVariantsForReceive(opts: { includeIds?: string[] } = {}) {
  const [variants, lastVnd, lastMmk] = await Promise.all([
    prisma.variant.findMany({
      where: {
        isBundle: false,
        OR: [{ active: true, product: { archivedAt: null } }, ...(opts.includeIds?.length ? [{ id: { in: opts.includeIds } }] : [])],
      },
      orderBy: { sku: "asc" },
      include: { product: { include: { translations: true, brand: true, stockLocation: { select: { pricingMode: true } } } } },
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
  ]);
  const vnd = new Map(lastVnd.map((b) => [b.variantId, b.unitCostVnd]));
  const mmk = new Map(lastMmk.map((b) => [b.variantId, b.unitCostMmk]));
  return variants.map((v) => {
    // P24: loại tiền giá mua theo kho của SP (kho mua tại Myanmar → MMK).
    const currency = v.product.stockLocation.pricingMode === "LOCAL_MMK" ? ("MMK" as const) : ("VND" as const);
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
      lastCost: (currency === "MMK" ? mmk.get(v.id) : vnd.get(v.id)) ?? null,
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

export async function listDocuments(filter: { type?: DocType; status?: DocStatus }) {
  return prisma.stockDocument.findMany({
    where: { type: filter.type, status: filter.status },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { from: true, to: true, _count: { select: { lines: true } } },
  });
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
