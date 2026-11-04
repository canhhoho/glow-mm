import "server-only";
import { prisma } from "@/lib/db";
import type { DocStatus, DocType } from "@/generated/prisma/client";

/** Tên hiển thị của sản phẩm cho admin: ưu tiên tiếng Anh, sau đó tiếng Myanmar. */
export function productName(translations: { locale: string; name: string }[], fallback: string) {
  return (translations.find((t) => t.locale === "en") ?? translations[0])?.name ?? fallback;
}

export async function listLocations() {
  return prisma.location.findMany({ orderBy: { code: "asc" } });
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
  const [variants, lastBatches] = await Promise.all([
    prisma.variant.findMany({
      where: { active: true, isBundle: false, product: { archivedAt: null } },
      orderBy: { sku: "asc" },
      include: { product: { include: { translations: true, brand: true } } },
    }),
    prisma.batch.findMany({
      distinct: ["variantId"],
      orderBy: [{ variantId: "asc" }, { createdAt: "desc" }],
      select: { variantId: true, unitCostVnd: true },
    }),
  ]);
  const lastCost = new Map(lastBatches.map((b) => [b.variantId, b.unitCostVnd]));
  return variants.map((v) => ({
    id: v.id,
    sku: v.sku,
    name: productName(v.product.translations, v.product.slug),
    label: v.label,
    brand: v.product.brand.name,
    requiresExpiry: v.product.requiresExpiry,
    lastCostVnd: lastCost.get(v.id) ?? null,
  }));
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
