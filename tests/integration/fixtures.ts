import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";

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
  const product = await prisma.product.create({
    data: {
      slug: `it-${tag}`,
      brandId: brand.id,
      categoryId: category.id,
      translations: { create: { locale: "en", name: `IT product ${tag}`, searchText: tag } },
      variants: { create: { sku: `IT-${tag}`, label: "50ml", priceMmk: 10000 } },
    },
    include: { variants: true },
  });
  const loc = async (suffix: string, type: "VN_STOCK" | "MM_STOCK" | "QUARANTINE" | "IN_TRANSIT") =>
    prisma.location.create({ data: { code: `IT-${tag}-${suffix}`, name: suffix, type, sellable: type === "MM_STOCK" } });
  return {
    tag,
    userId: user.id,
    brandId: brand.id,
    categoryId: category.id,
    productId: product.id,
    variantId: product.variants[0].id,
    vn: await loc("VN", "VN_STOCK"),
    transit: await loc("TR", "IN_TRANSIT"),
    mm: await loc("MM", "MM_STOCK"),
    qc: await loc("QC", "QUARANTINE"),
  };
}

export type Fixture = Awaited<ReturnType<typeof makeFixture>>;

export async function balance(batchId: string, locationId: string, stockType: "SELLABLE" | "TESTER" = "SELLABLE") {
  const b = await prisma.stockBalance.findUnique({
    where: { batchId_locationId_stockType: { batchId, locationId, stockType } },
  });
  return b?.qty ?? 0;
}
