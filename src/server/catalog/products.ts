import "server-only";
import { z } from "zod";
import { rawId, slugSchema } from "@/lib/schemas";
import { prisma } from "@/lib/db";
import { normalizeForSearch, toUnicode } from "@/lib/myanmar";
import { resolveProductIdentifiers } from "@/lib/product-identifiers";
import type { Tx } from "@/server/inventory/ledger";
import { assertStockLocation } from "@/server/inventory/warehouses";
import { productName } from "@/server/inventory/queries";
import { loadReadiness, ReadinessError } from "./readiness";
import { blockingErrors, publishBlockers, type Issue } from "./readiness-rules";
import { guardApproval } from "./approval";
import { skuPendingElsewhere, stageProductEdit } from "./change-request";
import { findOrCreateBrand, pruneEmptyBrands } from "./brands";
import { writeAudit } from "@/server/audit";
import { commissionOverPrice, recordPriceChange } from "./price-write";

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
  // Kho bán không chọn ở form (16/11/2026): gán khi ghi sổ nhập hàng đầu tiên; combo theo kho thành phần; đổi kho bằng
  // thao tác chuyển kho hàng loạt. `stockLocationId` chỉ còn cho mã gọi trực tiếp (seed/test) khi TẠO SP — SP đã có thì bỏ qua.
  stockLocationId: z.preprocess((v) => (v === "" || v == null ? undefined : v), rawId.optional()),
  // `requiresExpiry` bỏ khỏi form (hạn dùng chọn theo lô) — giữ giá trị cũ khi không gửi.
  requiresExpiry: z.boolean().optional(),
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

export type ProductInput = z.output<typeof productSchema>;
export type SaveProductOpts = {
  /** Lý do ghi vào PriceHistory khi payload có đổi giá (mặc định "manual"; Excel = "import:<mã file>"). */
  priceReason?: string;
  /** "apply": áp bản đang sửa đã được duyệt vào live (không định tuyến lại vào bản đang sửa). */
  mode?: "apply";
};

/** Khoá chung cho mọi lần lưu / nhập / duyệt SP (mã tự sinh + thứ tự khoá: advisory trước, dòng Product sau). */
export async function lockCatalog(tx: Tx) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('catalog.product-identifiers'))`;
}

/**
 * Lưu SP. SP chưa từng duyệt → ghi thẳng (đổi phần cần duyệt thì tự rời hàng đợi). SP đã duyệt → phần cần duyệt
 * vào bản đang sửa (`ProductChangeRequest`), phần không cần duyệt ghi thẳng; khách vẫn thấy bản đã duyệt (P1-A).
 */
export async function saveProduct(raw: unknown, userId: string, transaction?: Tx, opts: SaveProductOpts = {}) {
  const parsed = productSchema.parse(raw);
  if (parsed.copyFromId && parsed.id) throw new CatalogError("Chỉ sao chép khi tạo sản phẩm mới");
  const run = async (tx: Tx) => {
    await lockCatalog(tx);
    if (parsed.id && opts.mode !== "apply") {
      await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = ${parsed.id} FOR UPDATE`;
      const cur = await tx.product.findUnique({ where: { id: parsed.id }, select: { approvedAt: true } });
      if (cur?.approvedAt) return stageProductEdit(tx, parsed, userId, { priceReason: opts.priceReason });
    }
    return guardApproval(tx, parsed.id ? [parsed.id] : [], userId, () => writeProduct(tx, parsed, userId, opts), { applying: opts.mode === "apply" });
  };
  return transaction ? run(transaction) : prisma.$transaction(run);
}

/** Ghi payload đã parse vào dữ liệu live (không định tuyến). Gọi trong transaction đã giữ `lockCatalog`. */
export async function writeProduct(tx: Tx, parsed: ProductInput, userId: string, opts: SaveProductOpts = {}) {
  // Tên nào trống → chép tên còn lại (luôn có hai bản dịch).
  const myName = toUnicode(parsed.my.name) || parsed.en.name;
  const enName = parsed.en.name || toUnicode(parsed.my.name);
  const my = {
    name: myName,
    description: toUnicode(parsed.my.description),
    usage: toUnicode(parsed.my.usage),
  };
  {
    // Serialize catalog code allocation, including manual saves/imports, until commit.
    await lockCatalog(tx);
    const input = await resolveProductIdentifiers(parsed, async (kind, value) => {
      const row = kind === "slug"
        ? await tx.product.findUnique({ where: { slug: value }, select: { id: true } })
        : await tx.variant.findUnique({ where: { sku: value }, select: { id: true } });
      // SKU mới đang nằm trong bản đang sửa của SP khác cũng coi như đã dùng (áp khi duyệt không bị trùng).
      return !!row || (kind === "sku" && (await skuPendingElsewhere(tx, value, parsed.id)));
    });
    // Coordinate with image deletion/reordering so shared image files remain referenced.
    if (input.copyFromId) await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = ${input.copyFromId} FOR UPDATE`;
    const source = input.copyFromId
      ? await tx.product.findUnique({ where: { id: input.copyFromId }, select: { images: { select: { fileId: true, alt: true, sortOrder: true } } } })
      : null;
    if (input.copyFromId && !source) throw new CatalogError("Sản phẩm nguồn không còn tồn tại");
    const current = input.id
      ? await tx.product.findUnique({ where: { id: input.id }, select: { archivedAt: true, stockLocationId: true, published: true, brandId: true, slug: true, firstPublishedAt: true } })
      : null;
    if (input.id && !current) throw new CatalogError("Không tìm thấy sản phẩm");
    // P1-D (Q-D): slug là đường dẫn khách đã dùng — khoá sau lần đăng bán đầu tiên (không có bảng chuyển hướng).
    if (current && current.firstPublishedAt && input.slug !== current.slug) {
      throw new CatalogError(`Đường dẫn (slug) đã khoá sau lần đăng bán đầu tiên — giữ "${current.slug}"`);
    }
    // P1-D (M2): trùng slug / SKU → báo rõ thay vì lỗi ràng buộc DB.
    const slugOwner = await tx.product.findUnique({ where: { slug: input.slug }, select: { id: true } });
    if (slugOwner && slugOwner.id !== input.id) throw new CatalogError(`Đường dẫn (slug) "${input.slug}" đã được sản phẩm khác dùng`);
    // P1-D (M1): nhãn loại không trùng trong cùng SP (không phân biệt hoa thường / khoảng trắng).
    const labels = new Map<string, string>();
    for (const v of input.variants) {
      const key = v.label.trim().toLowerCase().replace(/\s+/g, " ");
      if (labels.has(key)) throw new CatalogError(`Tên loại "${v.label}" bị trùng (SKU ${labels.get(key)} và ${v.sku})`);
      labels.set(key, v.sku);
    }
    const skus = new Set<string>();
    for (const v of input.variants) {
      if (skus.has(v.sku)) throw new CatalogError(`SKU ${v.sku} bị lặp trong sản phẩm`);
      skus.add(v.sku);
      const owner = await tx.variant.findUnique({ where: { sku: v.sku }, select: { id: true, productId: true } });
      if (owner && owner.id !== v.id && (owner.productId !== input.id || v.id)) throw new CatalogError(`SKU ${v.sku} đã được dùng`);
      if (!owner && (await skuPendingElsewhere(tx, v.sku, input.id))) throw new CatalogError(`SKU ${v.sku} đang chờ duyệt ở sản phẩm khác`);
    }
    // Kho bán: giữ kho đang có; SP mới chưa có kho (gán khi ghi sổ nhập hàng đầu tiên); combo lấy kho của thành phần.
    const componentIds = input.variants.flatMap((v) => (v.isBundle ? v.components.map((c) => c.componentId) : []));
    const componentWarehouses = componentIds.length
      ? await tx.variant.findMany({ where: { id: { in: componentIds } }, select: { sku: true, product: { select: { stockLocationId: true } } } })
      : [];
    const unplaced = componentWarehouses.find((c) => c.product.stockLocationId == null);
    if (unplaced) throw new CatalogError(`Thành phần ${unplaced.sku} chưa nhập hàng (chưa có kho bán) — nhập hàng thành phần trước khi tạo combo`);
    const stockLocationId = current ? current.stockLocationId : (input.stockLocationId ?? componentWarehouses[0]?.product.stockLocationId ?? null);
    if (!current && input.stockLocationId) {
      try {
        await assertStockLocation(tx, input.stockLocationId);
      } catch (e) {
        throw new CatalogError(e instanceof Error ? e.message : String(e));
      }
    }
    // Thương hiệu: chọn sẵn (brandId) hoặc gõ tên — tìm theo tên rồi theo slug, chưa có thì tạo
    // trong cùng transaction (lưu lỗi → không để lại thương hiệu thừa).
    const brand = parsed.brandId
      ? await tx.brand.findUnique({ where: { id: parsed.brandId } })
      : await findOrCreateBrand(tx, parsed.brandName!, userId);
    if (!brand) throw new CatalogError("Không tìm thấy thương hiệu");
    const brandId = brand.id;
    const brandName = brand.name;
    const data = {
      slug: input.slug,
      brandId,
      categoryId: input.categoryId,
      stockLocationId,
      ...(input.fixedProfitMmk !== undefined && { fixedProfitMmk: input.fixedProfitMmk }),
      // P0-H1: `published` không ghi ở đây — bật/tắt hiển thị chỉ qua `setProductsPublished` (cổng mở bán + audit).
      ...(input.requiresExpiry !== undefined && { requiresExpiry: input.requiresExpiry }),
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
      if (commissionOverPrice(price, commission)) throw new CatalogError(`Hoa hồng CTV của ${v.sku} lớn hơn giá bán`);
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
      // Ghi cùng các trường khác của biến thể (đã giữ khoá catalog + dòng Product) → chỉ dùng phần ghi lịch sử chung.
      if (existing) {
        await recordPriceChange(tx, {
          variantId: saved.id,
          from: { priceMmk: existing.priceMmk, commission: existing.affiliateCommissionMmk },
          to: { priceMmk: price, commission: saved.affiliateCommissionMmk },
          reason: opts.priceReason ?? "manual",
          userId,
        });
      }
      savedIds.set(v.sku, saved.id);
    }

    for (const v of input.variants) {
      const bundleId = savedIds.get(v.sku)!;
      // Thành phần đang có trước lần lưu này: được giữ dù đã tắt / ngừng KD (không làm vỡ cấu hình combo cũ).
      const before = new Set((await tx.bundleItem.findMany({ where: { bundleId }, select: { componentId: true } })).map((b) => b.componentId));
      await tx.bundleItem.deleteMany({ where: { bundleId } });
      if (!v.isBundle) continue;
      if (v.components.length === 0) throw new CatalogError(`Combo ${v.sku} cần ít nhất 1 thành phần`);
      for (const c of v.components) {
        const comp = await tx.variant.findUnique({ where: { id: c.componentId }, include: { product: { select: { stockLocationId: true, archivedAt: true } } } });
        if (!comp || comp.isBundle || comp.id === bundleId) throw new CatalogError(`Thành phần combo ${v.sku} không hợp lệ`);
        // Combo trừ kho từng thành phần ở kho của combo → thành phần phải cùng kho (P24).
        if (comp.product.stockLocationId !== product.stockLocationId) throw new CatalogError(`Thành phần ${comp.sku} của combo ${v.sku} thuộc kho khác`);
        // #6: thành phần MỚI thêm phải đang dùng; thành phần đã có (before) giữ nguyên dù đã tắt — readiness COMPONENT_INACTIVE chặn mở bán.
        if (!before.has(comp.id) && (!comp.active || comp.product.archivedAt)) {
          throw new CatalogError(`Thành phần ${comp.sku} của combo ${v.sku} đã tắt hoặc ngừng kinh doanh — chọn thành phần đang dùng`);
        }
      }
      await tx.bundleItem.createMany({ data: v.components.map((c) => ({ bundleId, componentId: c.componentId, qty: c.qty })) });
    }

    if (source?.images.length) {
      await tx.productImage.createMany({ data: source.images.map((image) => ({ ...image, productId: product.id })) });
    }

    // D2: SP đang hiển thị không được lưu thành trạng thái không bán được (giá ≤ 0 / không còn biến thể).
    if (current?.published) {
      const readiness = (await loadReadiness(tx, [product.id])).get(product.id)!;
      const blocking = blockingErrors(readiness, true);
      if (blocking.length) throw new ReadinessError(blocking);
    }

    await tx.auditLog.create({
      data: {
        userId, action: input.id ? "product.update" : "product.create", entity: "Product", entityId: product.id,
        ...(input.copyFromId && { data: { copyFromId: input.copyFromId } }),
      },
    });
    // Đổi sang thương hiệu khác → thương hiệu cũ không còn SP nào thì tự xoá.
    if (current && current.brandId !== brandId) await pruneEmptyBrands(tx, [current.brandId], userId);
    return product;
  }
}

/**
 * Combo trừ kho từng thành phần ở kho của combo → combo và thành phần phải cùng kho bán (P24). Kiểm cả hai chiều
 * (SP là combo, hoặc là thành phần của combo khác). Gọi sau khi ghi `stockLocationId`, trong cùng transaction —
 * dùng chung cho form SP (`writeProduct`) và chuyển kho hàng loạt (`moveProductsToWarehouse`).
 */
export async function assertBundleWarehouses(tx: Tx, productIds: string[]) {
  if (productIds.length === 0) return;
  const links = await tx.bundleItem.findMany({
    where: { OR: [{ bundle: { productId: { in: productIds } } }, { component: { productId: { in: productIds } } }] },
    select: {
      bundle: { select: { sku: true, product: { select: { stockLocationId: true } } } },
      component: { select: { sku: true, product: { select: { stockLocationId: true } } } },
    },
  });
  const bad = links.find((l) => l.bundle.product.stockLocationId !== l.component.product.stockLocationId);
  if (bad) throw new CatalogError(`Combo ${bad.bundle.sku} và thành phần ${bad.component.sku} phải cùng kho — đổi kho cả hai cùng lúc`);
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
      select: { id: true, slug: true, approvedAt: true, translations: { select: { locale: true, name: true } } },
    });
    const blocked: BlockedProduct[] = [];
    let changed = candidates;
    if (published) {
      // Cổng đăng bán (P1-A): bản live đủ điều kiện mở bán + đã được duyệt (bản đang sửa không liên quan).
      const readiness = await loadReadiness(tx, candidates.map((p) => p.id));
      changed = candidates.filter((p) => {
        const issues = publishBlockers(readiness.get(p.id) ?? { errors: [], warnings: [] }, { approved: p.approvedAt != null });
        if (issues.length) blocked.push({ id: p.id, name: productName(p.translations, p.slug), issues });
        return issues.length === 0;
      });
    }
    const changedIds = changed.map((p) => p.id);
    if (changedIds.length === 0) return { changed: 0, blocked };
    await tx.product.updateMany({ where: { id: { in: changedIds } }, data: { published } });
    if (published) await tx.product.updateMany({ where: { id: { in: changedIds }, firstPublishedAt: null }, data: { firstPublishedAt: new Date() } });
    await tx.auditLog.createMany({
      data: changedIds.map((entityId) => ({
        userId, action: published ? "product.publish" : "product.unpublish", entity: "Product", entityId, data: { bulk: true },
      })),
    });
    return { changed: changedIds.length, blocked };
  });
}

export async function createCategory(raw: unknown, userId: string | null = null) {
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
  return prisma.$transaction(async (tx) => {
    const category = await tx.category.create({
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
    await writeAudit(tx, { userId, action: "category.create", entity: "Category", entityId: category.id, data: { slug: input.slug } });
    return category;
  });
}
