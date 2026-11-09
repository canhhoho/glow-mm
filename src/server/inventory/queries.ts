import "server-only";
import { prisma } from "@/lib/db";
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

export async function listVariantsForPicker() {
  const variants = await prisma.variant.findMany({
    where: { active: true },
    orderBy: { sku: "asc" },
    include: { product: { include: { translations: true } } },
  });
  return variants.map((v) => ({
    id: v.id,
    sku: v.sku,
    isBundle: v.isBundle,
    requiresExpiry: v.product.requiresExpiry,
    label: `${v.sku} — ${productName(v.product.translations, v.product.slug)} (${v.label})`,
  }));
}

/** Biến thể nhập kho được (đang dùng, không phải combo) cho bảng nhập nhanh; `lastCostVnd` = giá mua của lô mới nhất. */
export async function listVariantsForReceive() {
  const [variants, lastVnd, lastMmk] = await Promise.all([
    prisma.variant.findMany({
      where: { active: true, isBundle: false, product: { archivedAt: null } },
      orderBy: { sku: "asc" },
      include: { product: { include: { translations: true, brand: true, stockLocation: { select: { pricingMode: true } } } } },
    }),
    prisma.batch.findMany({
      where: { unitCostVnd: { not: null } },
      distinct: ["variantId"],
      orderBy: [{ variantId: "asc" }, { createdAt: "desc" }],
      select: { variantId: true, unitCostVnd: true },
    }),
    prisma.batch.findMany({
      where: { unitCostMmk: { not: null } },
      distinct: ["variantId"],
      orderBy: [{ variantId: "asc" }, { createdAt: "desc" }],
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

/** Mọi lô (kèm tồn theo vị trí) — dữ liệu cho form phiếu kho. */
export async function batchesForForms() {
  const batches = await prisma.batch.findMany({
    orderBy: [{ expiryDate: "asc" }],
    include: { balances: { where: { qty: { not: 0 } } } },
  });
  return batches.map((b) => ({
    id: b.id,
    variantId: b.variantId,
    lotNo: b.lotNo,
    expiryDate: b.expiryDate?.toISOString().slice(0, 10) ?? "",
    expiryStatus: b.expiryStatus,
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
        include: { batch: true, variant: { include: { product: { include: { translations: true } } } } },
        orderBy: { id: "asc" },
      },
    },
  });
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
