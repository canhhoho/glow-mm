import "server-only";
import { z } from "zod";
import { rawId } from "@/lib/schemas";
import { prisma } from "@/lib/db";
import { suggestProductSlug, suggestVariantSku } from "@/lib/product-identifiers";
import { PRODUCT_EDIT_INCLUDE, toProductEditData } from "./admin-queries";
import { productCopyDraft } from "./product-copy";
import { CatalogError, saveProduct } from "./products";

/**
 * Bước 1 "Tạo sản phẩm" (kế hoạch quy trình 5 bước, G1): chỉ tên, thương hiệu, danh mục, kho bán, phân loại.
 * Slug/SKU tự sinh; giá = 0 (đặt ở bước 3); luôn ẩn (đăng ở bước 5). Dùng lại `saveProduct` (khoá cấp mã, tạo thương hiệu mới,
 * kiểm tra kho/combo) để không có hai đường ghi SP.
 * `copyFromId`: chép nội dung + ảnh + thiết lập của SP nguồn, KHÔNG chép giá / hoa hồng CTV / lãi cố định.
 */
const optionalId = z.preprocess((v) => (v === "" || v == null ? undefined : v), rawId.optional());

export const createProductSchema = z
  .object({
    kind: z.enum(["product", "combo"]).default("product"),
    nameMy: z.string().trim().max(200).default(""),
    nameEn: z.string().trim().max(200).default(""),
    brandId: optionalId,
    brandName: z.string().trim().max(80).optional(),
    categoryId: rawId,
    stockLocationId: optionalId,
    /** Phân loại (màu/dung tích); rỗng = một loại chuẩn với nhãn `defaultLabel`. */
    labels: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
    defaultLabel: z.string().trim().min(1).max(60),
    components: z.array(z.object({ componentId: rawId, qty: z.coerce.number().int().positive().max(1000) })).max(30).default([]),
    copyFromId: optionalId,
  })
  .superRefine((d, ctx) => {
    if (!d.nameMy && !d.nameEn) ctx.addIssue({ code: "custom", message: "Cần nhập tên sản phẩm", path: ["nameEn"] });
    if (!d.brandId && !d.brandName) ctx.addIssue({ code: "custom", message: "Cần chọn hoặc nhập tên thương hiệu", path: ["brandId"] });
    if (d.kind === "combo" && d.components.length === 0) ctx.addIssue({ code: "custom", message: "Combo cần ít nhất 1 thành phần", path: ["components"] });
    if (new Set(d.labels.map((l) => l.toLowerCase())).size !== d.labels.length) {
      ctx.addIssue({ code: "custom", message: "Phân loại bị trùng tên", path: ["labels"] });
    }
  });

export type CreateProductInput = z.input<typeof createProductSchema>;

export async function createProduct(raw: unknown, userId: string) {
  const input = createProductSchema.parse(raw);
  const source = input.copyFromId
    ? await prisma.product.findUnique({ where: { id: input.copyFromId }, include: PRODUCT_EDIT_INCLUDE })
    : null;
  if (input.copyFromId && !source) throw new CatalogError("Sản phẩm nguồn không còn tồn tại");
  const draft = source ? productCopyDraft(toProductEditData(source)) : null;

  const slug = suggestProductSlug(input.nameEn, input.nameMy);
  const labels = input.kind === "combo" ? [input.defaultLabel] : input.labels.length ? input.labels : [input.defaultLabel];
  const variants = labels.map((label, index) => {
    // Sao chép: giữ khối lượng / ngưỡng tồn của biến thể nguồn cùng vị trí; giá và hoa hồng để bước 3.
    const from = draft?.variants[index];
    return {
      sku: suggestVariantSku(slug, index),
      autoSku: true,
      label,
      priceMmk: 0,
      weightGrams: from?.weightGrams ?? null,
      affiliateCommissionMmk: null,
      ...(from && { lowStockAt: from.lowStockAt, leadTimeDays: from.leadTimeDays, safetyStock: from.safetyStock }),
      isBundle: input.kind === "combo",
      components: input.kind === "combo" ? input.components : [],
    };
  });

  return saveProduct(
    {
      // Nội dung chép từ SP nguồn (mô tả, cách dùng, thành phần, bảo quản, tag, hạn dùng); trống nếu tạo mới.
      requiresExpiry: draft?.requiresExpiry ?? true,
      paoMonths: draft?.paoMonths ?? null,
      storageNote: draft?.storageNote ?? "",
      ingredientsText: draft?.ingredientsText ?? "",
      tagIds: draft?.tagIds ?? [],
      my: { ...(draft?.my ?? { description: "", usage: "" }), name: input.nameMy },
      en: { ...(draft?.en ?? { description: "", usage: "" }), name: input.nameEn },
      slug,
      autoSlug: true,
      brandId: input.brandId,
      brandName: input.brandId ? undefined : input.brandName,
      categoryId: input.categoryId,
      stockLocationId: input.stockLocationId,
      fixedProfitMmk: null,
      copyFromId: input.copyFromId,
      variants,
    },
    userId,
  );
}
