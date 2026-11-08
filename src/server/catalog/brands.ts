import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { normalizeForSearch } from "@/lib/myanmar";

export class BrandError extends Error {
  constructor(public readonly code: "brandMissing" | "brandDuplicate" | "brandInUse") {
    super(code);
  }
}

/** Keep the slug stable so existing storefront filter links continue to work. */
export async function updateBrand(id: string, name: string) {
  const clean = z.string().trim().min(1).max(80).parse(name);
  return prisma.$transaction(async (tx) => {
    if (!await tx.brand.findUnique({ where: { id } })) throw new BrandError("brandMissing");
    if (await tx.brand.findFirst({ where: { id: { not: id }, name: { equals: clean, mode: "insensitive" } } })) {
      throw new BrandError("brandDuplicate");
    }
    const brand = await tx.brand.update({ where: { id }, data: { name: clean } });
    const translations = await tx.productTranslation.findMany({ where: { product: { brandId: id } } });
    for (const tr of translations) {
      await tx.productTranslation.update({
        where: { productId_locale: { productId: tr.productId, locale: tr.locale } },
        data: { searchText: normalizeForSearch(`${tr.name} ${clean} ${tr.ingredientsText ?? ""}`) },
      });
    }
    return brand;
  }, { timeout: 30_000 });
}

export async function deleteBrand(id: string) {
  try {
    // The foreign key also protects against a product being attached concurrently.
    return await prisma.$transaction(async (tx) => {
      const brand = await tx.brand.findUnique({ where: { id }, include: { _count: { select: { products: true } } } });
      if (!brand) throw new BrandError("brandMissing");
      if (brand._count.products) throw new BrandError("brandInUse");
      return tx.brand.delete({ where: { id } });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") throw new BrandError("brandInUse");
    throw e;
  }
}
