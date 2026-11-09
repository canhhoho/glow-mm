import "server-only";
import { z } from "zod";
import { rawId, slugSchema } from "@/lib/schemas";
import { prisma } from "@/lib/db";
import { normalizeForSearch, toUnicode } from "@/lib/myanmar";
import { slugify } from "@/lib/slug";
import { resolveProductIdentifiers } from "@/lib/product-identifiers";
import { assertStockLocation, defaultStockLocationId } from "@/server/inventory/warehouses";
import type { Tx } from "@/server/inventory/ledger";
import { productName } from "@/server/inventory/queries";
import { loadReadiness, ReadinessError } from "./readiness";
import { blockingErrors, type Issue } from "./readiness-rules";
import { guardApproval } from "./approval";
import { pruneEmptyBrands } from "./brands";

/** Quản lý sản phẩm (admin). Giá đổi → ghi PriceHistory. Chữ Myanmar → Unicode trước khi lưu. */

/** Chữ tuỳ chọn (rỗng → ""); toUnicode làm sau khi parse. */
const optionalText = (max: number) => z.string().trim().max(max).optional().default("");

const translation = z.object({
  name: z.string().trim().max(200).optional().default(""),
  description: optionalText(5000),
  usage: optionalText(3000),
});

const variantSchema = z.object({
  id: z.string().optional(),
  sku: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9._-]+$/, "SKU chỉ gồm chữ, số, . _ -"),
  autoSku: z.boolean().default(false),
  label: z.string().trim().min(1).max(60),
  /** Bỏ qua (undefined) = giữ giá đang có; biến thể mới = 0 (QT1b: giá đặt ở bước 3 — khối "Giá bán" / bảng tính giá). */
  priceMmk: z.coerce.number().int().min(0).optional(),
  weightGrams: z.coerce.number().int().min(0).optional().nullable(),
  /** Hoa hồng CTV cố định MMK/cái; null = theo % của CTV. Bỏ qua (undefined) = giữ giá trị cũ. */
  affiliateCommissionMmk: z.preprocess((v) => (v === "" ? null : v), z.coerce.number().int().min(0).max(1_000_000_000).nullable()).optional(),
  lowStockAt: z.coerce.number().int().min(0).default(5),
  leadTimeDays: z.coerce.number().int().min(0).default(21),
  safetyStock: z.coerce.number().int().min(0).default(0),
  active: z.boolean().default(true),
  isBundle: z.boolean().default(false),
  components: z.array(z.object({ componentId: rawId, qty: z.coerce.number().int().positive() })).default([]),
});

export const productSchema = z.object({
  id: z.string().optional(),
  copyFromId: rawId.optional(),
  slug: slugSchema(80, "Slug chỉ gồm a-z, 0-9 và -"),
  autoSlug: z.boolean().default(false),
  brandId: rawId.optional(),
  brandName: z.string().trim().max(80).optional(),
  categoryId: rawId,
  /** Kho bán (P24). Bỏ trống: SP mới → kho mặc định; SP đang có → giữ kho cũ. */
  stockLocationId: z.preprocess((v) => (v === "" || v == null ? undefined : v), rawId.optional()),
  published: z.boolean().default(false),
  requiresExpiry: z.boolean().default(true),
  paoMonths: z.preprocess((v) => v === "" || v == null ? null : v, z.coerce.number().int().min(1).max(120).nullable()).optional(),
  /** Lãi cố định MMK/đơn vị — kho mua tại Myanmar (P24). Bỏ qua (undefined) = giữ giá trị cũ. */
  fixedProfitMmk: z.preprocess((v) => (v === "" ? null : v), z.coerce.number().int().min(0).max(1_000_000_000).nullable()).optional(),
  storageNote: optionalText(500),
  ingredientsText: optionalText(5000),
  my: translation,
  en: translation,
  tagIds: z.array(z.string()).default([]),
  variants: z.array(variantSchema).min(1),
}).superRefine((data, ctx) => {
  if (!data.my.name && !data.en.name) {
    ctx.addIssue({ code: "custom", message: "Cần ít nhất một tên (Myanmar hoặc tiếng Anh)", path: ["my", "name"] });
  }
  if (!data.brandId && !data.brandName) {
    ctx.addIssue({ code: "custom", message: "Cần chọn hoặc nhập tên thương hiệu", path: ["brandId"] });
  }
});

export class CatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogError";
  }
}

/** `priceReason`: lý do ghi vào PriceHistory khi payload có đổi giá (mặc định "manual"; Excel = "import"). */
export async function saveProduct(raw: unknown, userId: string, transaction?: Tx, opts: { priceReason?: string } = {}) {
  const parsed = productSchema.parse(raw);
  if (parsed.copyFromId && parsed.id) throw new CatalogError("Chỉ sao chép khi tạo sản phẩm mới");
  // Tên nào trống → chép tên còn lại (luôn có hai bản dịch).
  const myName = toUnicode(parsed.my.name) || parsed.en.name;
  const enName = parsed.en.name || toUnicode(parsed.my.name);
  const my = {
    name: myName,
    description: toUnicode(parsed.my.description),
    usage: toUnicode(parsed.my.usage),
  };
  const body = async (tx: Tx) => {
    // Serialize catalog code allocation, including manual saves/imports, until commit.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('catalog.product-identifiers'))`;
    const input = await resolveProductIdentifiers(parsed, async (kind, value) => {
      const row = kind === "slug"
        ? await tx.product.findUnique({ where: { slug: value }, select: { id: true } })
        : await tx.variant.findUnique({ where: { sku: value }, select: { id: true } });
      return !!row;
    });
    // Coordinate with image deletion/reordering so shared image files remain referenced.
    if (input.copyFromId) await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = ${input.copyFromId} FOR UPDATE`;
    const source = input.copyFromId
      ? await tx.product.findUnique({ where: { id: input.copyFromId }, select: { images: { select: { fileId: true, alt: true, sortOrder: true } } } })
      : null;
    if (input.copyFromId && !source) throw new CatalogError("Sản phẩm nguồn không còn tồn tại");
    const current = input.id
      ? await tx.product.findUnique({ where: { id: input.id }, select: { archivedAt: true, stockLocationId: true, published: true, brandId: true } })
      : null;
    if (input.id && !current) throw new CatalogError("Không tìm thấy sản phẩm");
    if (current?.archivedAt && input.published) throw new CatalogError("Sản phẩm đã ngừng kinh doanh — khôi phục trước khi hiển thị trên web");
    // Đổi kho được cả khi còn tồn: hàng ở kho cũ chỉ bán lại sau khi tạo phiếu chuyển sang kho mới.
    const stockLocationId = input.stockLocationId ?? current?.stockLocationId ?? (await defaultStockLocationId(tx));
    if (stockLocationId !== current?.stockLocationId) {
      try {
        await assertStockLocation(tx, stockLocationId);
      } catch (e) {
        throw new CatalogError(e instanceof Error ? e.message : String(e));
      }
    }
    // Thương hiệu: chọn sẵn (brandId) hoặc gõ tên — tìm không phân biệt hoa thường, chưa có thì tạo
    // trong cùng transaction (lưu lỗi → không để lại thương hiệu thừa).
    const brand = parsed.brandId
      ? await tx.brand.findUnique({ where: { id: parsed.brandId } })
      : (await tx.brand.findFirst({ where: { name: { equals: parsed.brandName!, mode: "insensitive" } } })) ??
        (await tx.brand.create({ data: { name: parsed.brandName!, slug: slugify(parsed.brandName!, `brand-${Date.now()}`) } }));
    if (!brand) throw new CatalogError("Không tìm thấy thương hiệu");
    const brandId = brand.id;
    const brandName = brand.name;
    const data = {
      slug: input.slug,
      brandId,
      categoryId: input.categoryId,
      stockLocationId,
      ...(input.fixedProfitMmk !== undefined && { fixedProfitMmk: input.fixedProfitMmk }),
      published: input.published,
      requiresExpiry: input.requiresExpiry,
      paoMonths: input.paoMonths,
      storageNote: input.storageNote || null,
    };
    const product = input.id
      ? await tx.product.update({ where: { id: input.id }, data })
      : await tx.product.create({ data });

    const en = { ...input.en, name: enName };
    for (const [locale, tr] of [
      ["my", my],
      ["en", en],
    ] as const) {
      const row = {
        name: tr.name,
        description: tr.description || null,
        usage: tr.usage || null,
        ingredientsText: input.ingredientsText || null,
        searchText: normalizeForSearch(`${tr.name} ${brandName} ${input.ingredientsText}`),
      };
      await tx.productTranslation.upsert({
        where: { productId_locale: { productId: product.id, locale } },
        create: { productId: product.id, locale, ...row },
        update: row,
      });
    }

    await tx.productTag.deleteMany({ where: { productId: product.id } });
    if (input.tagIds.length) {
      await tx.productTag.createMany({ data: input.tagIds.map((tagId) => ({ productId: product.id, tagId })) });
    }

    const savedIds = new Map<string, string>();
    for (const v of input.variants) {
      const existing = v.id
        ? await tx.variant.findUnique({ where: { id: v.id } })
        : await tx.variant.findUnique({ where: { sku: v.sku } });
      if (existing && existing.productId !== product.id) throw new CatalogError(`SKU ${v.sku} đã thuộc sản phẩm khác`);
      const price = v.priceMmk ?? existing?.priceMmk ?? 0;
      const commission = v.affiliateCommissionMmk !== undefined ? v.affiliateCommissionMmk : existing?.affiliateCommissionMmk ?? null;
      if (commission != null && price > 0 && commission > price) {
        throw new CatalogError(`Hoa hồng CTV của ${v.sku} lớn hơn giá bán`);
      }
      // Loại mới chưa có giá thêm vào SP đang bán → tạo ở trạng thái tắt (đặt giá ở bước 3 rồi bật), không chặn lưu.
      const parkNew = !existing && price <= 0 && !!current?.published;
      const vData = {
        sku: v.sku,
        label: v.label,
        priceMmk: price,
        weightGrams: v.weightGrams ?? null,
        ...(v.affiliateCommissionMmk !== undefined && { affiliateCommissionMmk: v.affiliateCommissionMmk }),
        lowStockAt: v.lowStockAt,
        leadTimeDays: v.leadTimeDays,
        safetyStock: v.safetyStock,
        active: parkNew ? false : v.active,
        isBundle: v.isBundle,
      };
      const saved = existing
        ? await tx.variant.update({ where: { id: existing.id }, data: vData })
        : await tx.variant.create({ data: { ...vData, productId: product.id } });
      if (existing && existing.priceMmk !== price) {
        await tx.priceHistory.create({
          data: {
            variantId: saved.id,
            oldPriceMmk: existing.priceMmk,
            newPriceMmk: price,
            reason: opts.priceReason ?? "manual",
            userId,
          },
        });
      }
      savedIds.set(v.sku, saved.id);
    }

    for (const v of input.variants) {
      const bundleId = savedIds.get(v.sku)!;
      await tx.bundleItem.deleteMany({ where: { bundleId } });
      if (!v.isBundle) continue;
      if (v.components.length === 0) throw new CatalogError(`Combo ${v.sku} cần ít nhất 1 thành phần`);
      for (const c of v.components) {
        const comp = await tx.variant.findUnique({ where: { id: c.componentId }, include: { product: { select: { stockLocationId: true } } } });
        if (!comp || comp.isBundle || comp.id === bundleId) throw new CatalogError(`Thành phần combo ${v.sku} không hợp lệ`);
        // Combo trừ kho từng thành phần ở kho của combo → thành phần phải cùng kho (P24).
        if (comp.product.stockLocationId !== product.stockLocationId) throw new CatalogError(`Thành phần ${comp.sku} của combo ${v.sku} thuộc kho khác`);
      }
      await tx.bundleItem.createMany({ data: v.components.map((c) => ({ bundleId, componentId: c.componentId, qty: c.qty })) });
    }

    if (source?.images.length) {
      await tx.productImage.createMany({ data: source.images.map((image) => ({ ...image, productId: product.id })) });
    }

    // D2: bật hiển thị phải hết lỗi mở bán; SP đang hiển thị chỉ bị chặn giá ≤ 0 / không còn biến thể.
    if (input.published) {
      const readiness = (await loadReadiness(tx, [product.id])).get(product.id)!;
      const blocking = blockingErrors(readiness, !!current?.published);
      if (blocking.length) throw new ReadinessError(blocking);
    }

    await tx.auditLog.create({
      data: {
        userId, action: input.id ? "product.update" : "product.create", entity: "Product", entityId: product.id,
        ...(input.copyFromId && { data: { copyFromId: input.copyFromId } }),
      },
    });
    // Đổi sang thương hiệu khác → thương hiệu cũ không còn SP nào thì tự xoá.
    if (current && current.brandId !== brandId) await pruneEmptyBrands(tx, [current.brandId]);
    return product;
  };
  // QT2: SP đã duyệt mà nội dung/giá/ảnh đổi → huỷ duyệt.
  const run = (tx: Tx) => guardApproval(tx, parsed.id ? [parsed.id] : [], userId, () => body(tx));
  return transaction ? run(transaction) : prisma.$transaction(run);
}

const bulkPublishSchema = z.object({
  ids: z.array(rawId).min(1, "Chưa chọn sản phẩm nào").max(500),
  published: z.boolean(),
});

export type BlockedProduct = { id: string; name: string; issues: Issue[] };

/**
 * Bật/tắt "Hiển thị trên web" cho nhiều SP một lần; chỉ ghi SP thực sự đổi trạng thái (audit từng SP).
 * D2: khi bật, SP còn lỗi mở bán bị giữ ẩn và trả về `blocked` (kèm lý do); SP hợp lệ vẫn được bật.
 */
export async function setProductsPublished(raw: unknown, userId: string): Promise<{ changed: number; blocked: BlockedProduct[] }> {
  const { ids, published } = bulkPublishSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    const candidates = await tx.product.findMany({
      // SP ngừng kinh doanh không bật hiển thị được (khôi phục trước).
      where: { id: { in: [...new Set(ids)] }, published: !published, ...(published && { archivedAt: null }) },
      select: { id: true, slug: true, translations: { select: { locale: true, name: true } } },
    });
    const blocked: BlockedProduct[] = [];
    let changed = candidates;
    if (published) {
      const readiness = await loadReadiness(tx, candidates.map((p) => p.id));
      changed = candidates.filter((p) => {
        const errors = readiness.get(p.id)?.errors ?? [];
        if (errors.length) blocked.push({ id: p.id, name: productName(p.translations, p.slug), issues: errors });
        return errors.length === 0;
      });
    }
    const changedIds = changed.map((p) => p.id);
    if (changedIds.length === 0) return { changed: 0, blocked };
    await tx.product.updateMany({ where: { id: { in: changedIds } }, data: { published } });
    await tx.auditLog.createMany({
      data: changedIds.map((entityId) => ({
        userId, action: published ? "product.publish" : "product.unpublish", entity: "Product", entityId, data: { bulk: true },
      })),
    });
    return { changed: changedIds.length, blocked };
  });
}

export async function createCategory(raw: unknown) {
  const input = z
    .object({
      slug: slugSchema(60),
      nameMy: z.string().trim().min(1).max(80),
      nameEn: z.string().trim().min(1).max(80),
      parentId: z.string().trim().max(40).optional().transform((v) => v || null),
    })
    .parse(raw);
  if (input.parentId && !(await prisma.category.findUnique({ where: { id: input.parentId } }))) {
    throw new CatalogError("Danh mục cha không tồn tại");
  }
  return prisma.category.create({
    data: {
      slug: input.slug,
      parentId: input.parentId,
      translations: {
        create: [
          { locale: "my", name: toUnicode(input.nameMy) },
          { locale: "en", name: input.nameEn },
        ],
      },
    },
  });
}
