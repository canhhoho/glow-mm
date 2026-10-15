import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseCsvObjects } from "@/lib/csv";
import { normalizeForSearch, toUnicode } from "@/lib/myanmar";
import { slugify } from "@/lib/slug";
import { createDocument } from "@/server/inventory/documents";

/** Quản lý sản phẩm (admin). Giá đổi → ghi PriceHistory. Chữ Myanmar → Unicode trước khi lưu. */

const text = (max: number) => z.string().trim().max(max).optional().default("");

const translation = z.object({
  name: z.string().trim().min(1).max(200),
  description: text(5000),
  usage: text(3000),
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
  components: z.array(z.object({ componentId: z.string().min(1), qty: z.coerce.number().int().positive() })).default([]),
});

export const productSchema = z.object({
  id: z.string().optional(),
  slug: z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/, "Slug chỉ gồm a-z, 0-9 và -"),
  brandId: z.string().min(1),
  categoryId: z.string().min(1),
  published: z.boolean().default(false),
  storageNote: text(500),
  ingredientsText: text(5000),
  my: translation,
  en: translation,
  tagIds: z.array(z.string()).default([]),
  variants: z.array(variantSchema).min(1),
});
export type ProductInput = z.infer<typeof productSchema>;

export class CatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogError";
  }
}

export async function saveProduct(raw: unknown, userId: string) {
  const input = productSchema.parse(raw);
  const my = {
    name: toUnicode(input.my.name),
    description: toUnicode(input.my.description),
    usage: toUnicode(input.my.usage),
  };
  const brand = await prisma.brand.findUnique({ where: { id: input.brandId } });
  const brandName = brand?.name ?? "";

  return prisma.$transaction(async (tx) => {
    const data = {
      slug: input.slug,
      brandId: input.brandId,
      categoryId: input.categoryId,
      published: input.published,
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

    await tx.auditLog.create({
      data: { userId, action: input.id ? "product.update" : "product.create", entity: "Product", entityId: product.id },
    });
    return product;
  });
}

export async function createBrand(name: string) {
  const clean = z.string().trim().min(1).max(80).parse(name);
  return prisma.brand.create({ data: { name: clean, slug: slugify(clean, `brand-${Date.now()}`) } });
}

export async function createCategory(raw: unknown) {
  const input = z
    .object({
      slug: z.string().trim().min(1).max(60).regex(/^[a-z0-9-]+$/),
      nameMy: z.string().trim().min(1).max(80),
      nameEn: z.string().trim().min(1).max(80),
    })
    .parse(raw);
  return prisma.category.create({
    data: {
      slug: input.slug,
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
] as const;

export type ImportResult = { ok: number; errors: string[]; documents?: { id: string; code: string }[] };

function missingColumns(rows: Record<string, string>[], cols: readonly string[]) {
  if (rows.length === 0) return ["(file trống)"];
  return cols.filter((c) => !(c in rows[0]));
}

/** Import sản phẩm: mỗi dòng = 1 biến thể; các dòng cùng product_slug gộp thành 1 sản phẩm. */
export async function importProductsCsv(csv: string, userId: string): Promise<ImportResult> {
  const rows = parseCsvObjects(csv);
  const required = PRODUCT_CSV_COLUMNS.filter((c) => !c.startsWith("description") && !c.startsWith("usage") && c !== "ingredients" && c !== "storage_note" && c !== "weight_g");
  const missing = missingColumns(rows, required);
  if (missing.length) return { ok: 0, errors: [`Thiếu cột: ${missing.join(", ")}`] };

  const groups = new Map<string, { line: number; row: Record<string, string> }[]>();
  rows.forEach((row, i) => {
    const key = row.product_slug;
    groups.set(key, [...(groups.get(key) ?? []), { line: i + 2, row }]);
  });

  const errors: string[] = [];
  let ok = 0;
  for (const [slug, items] of groups) {
    const first = items[0].row;
    try {
      const brand =
        (await prisma.brand.findFirst({ where: { name: { equals: first.brand, mode: "insensitive" } } })) ??
        (await createBrand(first.brand));
      const category = await prisma.category.findUnique({ where: { slug: first.category } });
      if (!category) throw new CatalogError(`Danh mục "${first.category}" chưa có (tạo trước trong trang Sản phẩm)`);
      const existing = await prisma.product.findUnique({
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
export async function importOpeningStockCsv(csv: string, userId: string): Promise<ImportResult> {
  const rows = parseCsvObjects(csv);
  const missing = missingColumns(rows, STOCK_CSV_COLUMNS.filter((c) => c !== "mfg_date" && c !== "stock_type"));
  if (missing.length) return { ok: 0, errors: [`Thiếu cột: ${missing.join(", ")}`] };

  const errors: string[] = [];
  const byLocation = new Map<string, { variantId: string; lotNo: string; expiryDate: string; mfgDate?: string; unitCostVnd: string; qty: string; stockType: string }[]>();
  const locations = new Map((await prisma.location.findMany()).map((l) => [l.code, l.id]));
  const variants = new Map((await prisma.variant.findMany({ select: { id: true, sku: true } })).map((v) => [v.sku, v.id]));

  rows.forEach((r, i) => {
    const line = i + 2;
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
      const doc = await createDocument({ type: "RECEIVE", toId, reason: "Tồn đầu kỳ (import CSV)", lines }, userId);
      documents.push({ id: doc.id, code: doc.code });
    } catch (e) {
      errors.push(e instanceof z.ZodError ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : (e as Error).message);
    }
  }
  return { ok: rows.length, errors, documents };
}
