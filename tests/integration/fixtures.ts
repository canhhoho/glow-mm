import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { createDocument, postDocument } from "@/server/inventory/documents";
import { availableToSell } from "@/server/orders/availability";

/** Dữ liệu riêng cho mỗi test (mã ngẫu nhiên) → các test không đụng nhau và không đụng seed. */
export async function makeFixture() {
  const tag = randomBytes(4).toString("hex").toUpperCase();
  const user = await prisma.user.upsert({
    where: { email: "it-runner@glow.local" },
    update: {},
    create: { id: "it-runner", email: "it-runner@glow.local", name: "IT", role: "ADMIN" },
  });
  const brand = await prisma.brand.create({ data: { slug: `it-${tag}`, name: `IT ${tag}` } });
  const category = await prisma.category.create({ data: { slug: `it-${tag}` } });
  const loc = async (suffix: string, type: "VN_STOCK" | "MM_STOCK" | "QUARANTINE" | "IN_TRANSIT", pricingMode?: "VN_IMPORT" | "LOCAL_MMK") =>
    prisma.location.create({ data: { code: `IT-${tag}-${suffix}`, name: suffix, type, sellable: type === "MM_STOCK", pricingMode } });
  const vn = await loc("VN", "VN_STOCK");
  const transit = await loc("TR", "IN_TRANSIT");
  // `mm` = kho bán của SP fixture (giá vốn VND); `chi` = kho bán thứ hai (giá vốn MMK) — P24.
  const mm = await loc("MM", "MM_STOCK", "VN_IMPORT");
  const chi = await loc("CHI", "MM_STOCK", "LOCAL_MMK");
  const qc = await loc("QC", "QUARANTINE");
  const product = await prisma.product.create({
    data: {
      slug: `it-${tag}`,
      brandId: brand.id,
      categoryId: category.id,
      stockLocationId: mm.id,
      translations: { create: { locale: "en", name: `IT product ${tag}`, searchText: tag } },
      variants: { create: { sku: `IT-${tag}`, label: "50ml", priceMmk: 10000 } },
    },
    include: { variants: true },
  });
  return {
    tag,
    userId: user.id,
    brandId: brand.id,
    categoryId: category.id,
    productId: product.id,
    variantId: product.variants[0].id,
    vn,
    transit,
    mm,
    chi,
    qc,
  };
}

export type Fixture = Awaited<ReturnType<typeof makeFixture>>;

export async function balance(batchId: string, locationId: string, stockType: "SELLABLE" | "TESTER" = "SELLABLE") {
  const b = await prisma.stockBalance.findUnique({
    where: { batchId_locationId_stockType: { batchId, locationId, stockType } },
  });
  return b?.qty ?? 0;
}

// ── Bán hàng ──

const DAY = 24 * 60 * 60 * 1000;
export const isoDay = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);

/** Fixture bán hàng: sản phẩm đã đăng, hàng nằm ở kho MM (bán được), vùng giao hàng riêng. */
export async function saleFixture(lots: { lot: string; expiryInDays: number; qty: number; unitCostVnd?: number }[]) {
  const f = await makeFixture();
  await prisma.product.update({ where: { id: f.productId }, data: { published: true } });
  const doc = await createDocument(
    {
      type: "RECEIVE",
      toId: f.mm.id,
      lines: lots.map((l) => ({
        variantId: f.variantId,
        lotNo: l.lot,
        expiryDate: isoDay(l.expiryInDays),
        unitCostVnd: l.unitCostVnd ?? 100_000,
        qty: l.qty,
      })),
    },
    f.userId,
  );
  await postDocument(doc.id, f.userId);
  // Thị trấn VTP có sẵn từ migration P15 (Kamaryut, Yangon West).
  return { ...f, townshipId: "tw-YGN-WYG-KMY" };
}
export type SaleFixture = Awaited<ReturnType<typeof saleFixture>>;

export const admin = (f: Fixture) => ({ userId: f.userId, role: "ADMIN" as const });

export function orderInput(f: SaleFixture, qty: number, extra: Record<string, unknown> = {}) {
  return {
    paymentMethod: "COD",
    name: "Ma Hla",
    phone: "+95 9 7812 3456",
    townshipId: f.townshipId,
    addressLine: "No. 12, Bo Aung Kyaw St",
    items: [{ variantId: f.variantId, qty }],
    ...extra,
  };
}

export const avail = async (variantId: string, now = new Date()) =>
  (await prisma.$transaction((tx) => availableToSell(tx, [variantId], { now, blockDays: 90 }))).get(variantId);

/** Gỡ đăng sản phẩm test khi xong file (storefront của E2E dùng chung DB glow_test). */
export async function unpublishTestProducts() {
  await prisma.product.updateMany({ where: { slug: { startsWith: "it-" }, published: true }, data: { published: false } });
}
