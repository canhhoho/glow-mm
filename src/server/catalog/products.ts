import "server-only";
import { z } from "zod";
import { rawId, slugSchema } from "@/lib/schemas";
import { prisma } from "@/lib/db";
import { parseCsvObjects } from "@/lib/csv";
import { normalizeForSearch, toUnicode } from "@/lib/myanmar";
import { slugify } from "@/lib/slug";
import { createDocument } from "@/server/inventory/documents";
import type { Tx } from "@/server/inventory/ledger";

/** Quản lý sản phẩm (admin). Giá đổi → ghi PriceHistory. Chữ Myanmar → Unicode trước khi lưu. */

/** Chữ tuỳ chọn (rỗng → ""); toUnicode làm sau khi parse. */
const optionalText = (max: number) => z.string().trim().max(max).optional().default("");

const translation = z.object({
  name: z.string().trim().min(1).max(200),
  description: optionalText(5000),
  usage: optionalText(3000),
});

const variantSchema = z.object({
  id: z.string().optional(),
  sku: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9._-]+$/, "SKU chỉ gồm chữ, số, . _ -"),
  label: z.string().trim().min(1).max(60),
  priceMmk: z.coerce.number().int().min(0),
  weightGrams: z.coerce.number().int().min(0).optional().nullable(),
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
  brandId: rawId,
  categoryId: rawId,
  published: z.boolean().default(false),
  requiresExpiry: z.boolean().default(true),
  paoMonths: z.preprocess((v) => v === "" || v == null ? null : v, z.coerce.number().int().min(1).max(120).nullable()).optional(),
  storageNote: optionalText(500),
  ingredientsText: optionalText(5000),
  my: translation,
  en: translation,
  tagIds: z.array(z.string()).default([]),
  variants: z.array(variantSchema).min(1),
});

export class CatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogError";
  }
}

export async function saveProduct(raw: unknown, userId: string, transaction?: Tx) {
  const input = productSchema.parse(raw);
  if (input.copyFromId && input.id) throw new CatalogError("Chỉ sao chép khi tạo sản phẩm mới");
  const my = {
    name: toUnicode(input.my.name),
    description: toUnicode(input.my.description),
    usage: toUnicode(input.my.usage),
  };
  const brand = await (transaction ?? prisma).brand.findUnique({ where: { id: input.brandId } });
  const brandName = brand?.name ?? "";

  const run = async (tx: Tx) => {
    // Coordinate with image deletion/reordering so shared image files remain referenced.
    if (input.copyFromId) await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = ${input.copyFromId} FOR UPDATE`;
    const source = input.copyFromId
      ? await tx.product.findUnique({ where: { id: input.copyFromId }, select: { images: { select: { fileId: true, alt: true, sortOrder: true } } } })
      : null;
    if (input.copyFromId && !source) throw new CatalogError("Sản phẩm nguồn không còn tồn tại");
    if (input.id && input.published) {
      const current = await tx.product.findUnique({ where: { id: input.id }, select: { archivedAt: true } });
      if (current?.archivedAt) throw new CatalogError("Sản phẩm đã ngừng kinh doanh — khôi phục trước khi hiển thị trên web");
    }
    const data = {
      slug: input.slug,
      brandId: input.brandId,
      categoryId: input.categoryId,
      published: input.published,
      requiresExpiry: input.requiresExpiry,
      paoMonths: input.paoMonths,
      storageNote: input.storageNote || null,
    };
    const product = input.id
      ? await tx.product.update({ where: { id: input.id }, data })
      : await tx.product.create({ data });

    for (const [locale, tr] of [
      ["my", my],
      ["en", input.en],
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
      const vData = {
        sku: v.sku,
        label: v.label,
        priceMmk: v.priceMmk,
        weightGrams: v.weightGrams ?? null,
        lowStockAt: v.lowStockAt,
        leadTimeDays: v.leadTimeDays,
        safetyStock: v.safetyStock,
        active: v.active,
        isBundle: v.isBundle,
      };
      const existing = v.id
        ? await tx.variant.findUnique({ where: { id: v.id } })
        : await tx.variant.findUnique({ where: { sku: v.sku } });
      if (existing && existing.productId !== product.id) throw new CatalogError(`SKU ${v.sku} đã thuộc sản phẩm khác`);
      const saved = existing
        ? await tx.variant.update({ where: { id: existing.id }, data: vData })
        : await tx.variant.create({ data: { ...vData, productId: product.id } });
      if (existing && existing.priceMmk !== v.priceMmk) {
        await tx.priceHistory.create({
          data: {
            variantId: saved.id,
            oldPriceMmk: existing.priceMmk,
            newPriceMmk: v.priceMmk,
            reason: "manual",
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
        const comp = await tx.variant.findUnique({ where: { id: c.componentId } });
        if (!comp || comp.isBundle || comp.id === bundleId) throw new CatalogError(`Thành phần combo ${v.sku} không hợp lệ`);
      }
      await tx.bundleItem.createMany({ data: v.components.map((c) => ({ bundleId, componentId: c.componentId, qty: c.qty })) });
    }

    if (source?.images.length) {
      await tx.productImage.createMany({ data: source.images.map((image) => ({ ...image, productId: product.id })) });
    }

    await tx.auditLog.create({
      data: {
        userId, action: input.id ? "product.update" : "product.create", entity: "Product", entityId: product.id,
        ...(input.copyFromId && { data: { copyFromId: input.copyFromId } }),
      },
    });
    return product;
  };
  return transaction ? run(transaction) : prisma.$transaction(run);
}

const bulkPublishSchema = z.object({
  ids: z.array(rawId).min(1, "Chưa chọn sản phẩm nào").max(500),
  published: z.boolean(),
});

/** Bật/tắt "Hiển thị trên web" cho nhiều SP một lần; chỉ ghi SP thực sự đổi trạng thái (audit từng SP). */
export async function setProductsPublished(raw: unknown, userId: string) {
  const { ids, published } = bulkPublishSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    const changed = await tx.product.findMany({
      // SP ngừng kinh doanh không bật hiển thị được (khôi phục trước).
      where: { id: { in: [...new Set(ids)] }, published: !published, ...(published && { archivedAt: null }) },
      select: { id: true },
    });
    const changedIds = changed.map((p) => p.id);
    if (changedIds.length === 0) return { changed: 0 };
    await tx.product.updateMany({ where: { id: { in: changedIds } }, data: { published } });
    await tx.auditLog.createMany({
      data: changedIds.map((entityId) => ({
        userId, action: published ? "product.publish" : "product.unpublish", entity: "Product", entityId, data: { bulk: true },
      })),
    });
    return { changed: changedIds.length };
  });
}

export async function createBrand(name: string) {
  const clean = z.string().trim().min(1).max(80).parse(name);
  return prisma.brand.create({ data: { name: clean, slug: slugify(clean, `brand-${Date.now()}`) } });
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

// ───────────────────────── Import CSV ─────────────────────────

export const PRODUCT_CSV_COLUMNS = [
  "product_slug",
  "brand",
  "category",
  "name_my",
  "name_en",
  "description_my",
  "description_en",
  "usage_my",
  "usage_en",
  "ingredients",
  "storage_note",
  "sku",
  "variant_label",
  "price_mmk",
  "weight_g",
  "expiry_policy",
  "pao_months",
] as const;

export const STOCK_CSV_COLUMNS = [
  "sku",
  "location_code",
  "lot_no",
  "expiry_date",
  "mfg_date",
  "unit_cost_vnd",
  "qty",
  "stock_type",
  "expiry_status",
  "inbound_unit_vnd",
  "selling_fee_mmk",
] as const;

export type ImportResult = { ok: number; errors: string[]; documents?: { id: string; code: string }[] };

function missingColumns(rows: Record<string, string>[], cols: readonly string[]) {
  if (rows.length === 0) return ["(file trống)"];
  return cols.filter((c) => !(c in rows[0]));
}

/** Import sản phẩm: mỗi dòng = 1 biến thể; các dòng cùng product_slug gộp thành 1 sản phẩm. */
export async function importProductsCsv(csv: string, userId: string, lineNumbers?: number[], transaction?: Tx): Promise<ImportResult> {
  const db = transaction ?? prisma;
  const rows = parseCsvObjects(csv);
  const required = PRODUCT_CSV_COLUMNS.filter((c) => !c.startsWith("description") && !c.startsWith("usage") && c !== "ingredients" && c !== "storage_note" && c !== "weight_g" && c !== "expiry_policy" && c !== "pao_months");
  const missing = missingColumns(rows, required);
  if (missing.length) return { ok: 0, errors: [`Thiếu cột: ${missing.join(", ")}`] };

  const groups = new Map<string, { line: number; row: Record<string, string> }[]>();
  rows.forEach((row, i) => {
    const key = row.product_slug;
    groups.set(key, [...(groups.get(key) ?? []), { line: lineNumbers?.[i] ?? i + 2, row }]);
  });

  const errors: string[] = [];
  let ok = 0;
  for (const [slug, items] of groups) {
    const first = items[0].row;
    try {
      const brand =
        (await db.brand.findFirst({ where: { name: { equals: first.brand, mode: "insensitive" } } })) ??
        (await db.brand.create({ data: { name: z.string().trim().min(1).max(80).parse(first.brand), slug: slugify(first.brand, `brand-${Date.now()}`) } }));
      const category = await db.category.findUnique({ where: { slug: first.category } });
      if (!category) throw new CatalogError(`Danh mục "${first.category}" chưa có (tạo trước trong trang Sản phẩm)`);
      const existing = await db.product.findUnique({
        where: { slug },
        include: { variants: true, tags: true },
      });
      await saveProduct(
        {
          id: existing?.id,
          slug,
          brandId: brand.id,
          categoryId: category.id,
          published: existing?.published ?? false,
          requiresExpiry: first.expiry_policy ? z.enum(["DATED", "NONE"]).parse(first.expiry_policy) === "DATED" : existing?.requiresExpiry ?? true,
          paoMonths: first.pao_months === undefined ? existing?.paoMonths : first.pao_months,
          storageNote: first.storage_note,
          ingredientsText: first.ingredients,
          my: { name: first.name_my, description: first.description_my, usage: first.usage_my },
          en: { name: first.name_en, description: first.description_en, usage: first.usage_en },
          tagIds: existing?.tags.map((t) => t.tagId) ?? [],
          variants: items.map(({ row }) => {
            const ex = existing?.variants.find((v) => v.sku === row.sku);
            return {
              id: ex?.id,
              sku: row.sku,
              label: row.variant_label,
              priceMmk: row.price_mmk,
              weightGrams: row.weight_g || null,
              lowStockAt: ex?.lowStockAt ?? 5,
              leadTimeDays: ex?.leadTimeDays ?? 21,
              safetyStock: ex?.safetyStock ?? 0,
              active: ex?.active ?? true,
              isBundle: false,
            };
          }),
        },
        userId,
        transaction,
      );
      ok += items.length;
    } catch (e) {
      const lines = items.map((x) => x.line).join(", ");
      errors.push(`Dòng ${lines} (${slug}): ${e instanceof z.ZodError ? e.issues.map((i) => i.message).join("; ") : (e as Error).message}`);
    }
  }
  return { ok, errors };
}

/** Import tồn đầu kỳ → tạo phiếu NHẬP NHÁP theo từng vị trí (người dùng kiểm tra rồi ghi sổ). */
export async function importOpeningStockCsv(csv: string, userId: string, lineNumbers?: number[], transaction?: Tx): Promise<ImportResult> {
  const db = transaction ?? prisma;
  const rows = parseCsvObjects(csv);
  const missing = missingColumns(rows, STOCK_CSV_COLUMNS.filter((c) => !["mfg_date", "stock_type", "expiry_date", "expiry_status", "inbound_unit_vnd", "selling_fee_mmk"].includes(c)));
  if (missing.length) return { ok: 0, errors: [`Thiếu cột: ${missing.join(", ")}`] };

  const errors: string[] = [];
  const byLocation = new Map<string, { variantId: string; lotNo: string; expiryDate: string; expiryStatus?: "DATED" | "NONE" | "UNKNOWN"; landedCostVnd?: number; mfgDate?: string; unitCostVnd: string; qty: string; stockType: string }[]>();
  const locations = new Map((await db.location.findMany()).map((l) => [l.code, l.id]));
  const variants = new Map((await db.variant.findMany({ select: { id: true, sku: true } })).map((v) => [v.sku, v.id]));

  rows.forEach((r, i) => {
    const line = lineNumbers?.[i] ?? i + 2;
    const locationId = locations.get(r.location_code);
    const variantId = variants.get(r.sku);
    if (!locationId) return errors.push(`Dòng ${line}: không có vị trí "${r.location_code}"`);
    if (!variantId) return errors.push(`Dòng ${line}: không có SKU "${r.sku}"`);
    const st = (r.stock_type || "SELLABLE").toUpperCase();
    if (st !== "SELLABLE" && st !== "TESTER") return errors.push(`Dòng ${line}: stock_type phải là SELLABLE hoặc TESTER`);
    byLocation.set(locationId, [
      ...(byLocation.get(locationId) ?? []),
      {
        variantId,
        lotNo: r.lot_no,
        expiryDate: r.expiry_date,
        expiryStatus: r.expiry_status ? z.enum(["DATED", "NONE", "UNKNOWN"]).parse(r.expiry_status) : undefined,
        landedCostVnd: r.inbound_unit_vnd ? z.coerce.number().int().min(0).max(2147483647).parse(Number(r.unit_cost_vnd) + z.coerce.number().int().min(0).parse(r.inbound_unit_vnd)) : undefined,
        mfgDate: r.mfg_date || undefined,
        unitCostVnd: r.unit_cost_vnd,
        qty: r.qty,
        stockType: st,
      },
    ]);
  });
  if (errors.length) return { ok: 0, errors };

  const documents: { id: string; code: string }[] = [];
  for (const [toId, lines] of byLocation) {
    try {
      const doc = await createDocument({ type: "RECEIVE", toId, reason: "Tồn đầu kỳ (import)", lines }, userId, transaction);
      documents.push({ id: doc.id, code: doc.code });
    } catch (e) {
      errors.push(e instanceof z.ZodError ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : (e as Error).message);
    }
  }
  return { ok: errors.length ? 0 : rows.length, errors, documents };
}
