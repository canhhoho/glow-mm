import "server-only";
import { z } from "zod";
import { rawId } from "@/lib/schemas";
import { prisma } from "@/lib/db";
import { suggestProductSlug, suggestVariantSku } from "@/lib/product-identifiers";
import { PRODUCT_EDIT_INCLUDE, toProductEditData } from "./admin-queries";
import { productCopyDraft } from "./product-copy";
import { CatalogError, saveProduct } from "./products";
import { brandSlug } from "./brands";
import { moveProductsToWarehouseTx } from "./product-delete";
import { currencyOfMode, setPurchasePrices } from "@/server/pricing/purchase-price";

/**
 * Bước 1 "Tạo sản phẩm" (kế hoạch quy trình 5 bước, G1): chỉ tên, thương hiệu, danh mục, kho bán, phân loại.
 * Slug/SKU tự sinh; giá = 0 (đặt ở bước 3); luôn ẩn (đăng ở bước 5). Dùng lại `saveProduct` (khoá cấp mã, tạo thương hiệu mới,
 * kiểm tra kho/combo) để không có hai đường ghi SP.
 * `copyFromId`: chép nội dung + ảnh + thiết lập của SP nguồn, KHÔNG chép giá / hoa hồng CTV / lãi cố định.
 * 21/11/2026 (audit #4): tuỳ chọn Kho bán + Giá mua + SL dự kiến nhập như file Excel — cùng đường ghi với nhập Excel
 * (`moveProductsToWarehouseTx`, `setPurchasePrices`, `plannedReceiveQty`), cùng transaction với tạo SP. Combo không có
 * (lấy kho của thành phần; giá mua combo = tổng thành phần).
 */
const optionalAmount = z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().min(0).max(2_000_000_000).nullable());
const optionalId = z.preprocess((v) => (v === "" || v == null ? undefined : v), rawId.optional());

export const createProductSchema = z
  .object({
    kind: z.enum(["product", "combo"]).default("product"),
    nameMy: z.string().trim().max(200).default(""),
    nameEn: z.string().trim().max(200).default(""),
    brandId: optionalId,
    brandName: z.string().trim().max(80).optional(),
    categoryId: rawId,
    /** Phân loại (màu/dung tích); rỗng = một loại chuẩn với nhãn `defaultLabel`. */
    labels: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
    defaultLabel: z.string().trim().min(1).max(60),
    components: z.array(z.object({ componentId: rawId, qty: z.coerce.number().int().positive().max(1000) })).max(30).default([]),
    copyFromId: optionalId,
    warehouseId: optionalId,
    /** Cùng thứ tự với phân loại sẽ tạo (`labels`, hoặc một loại chuẩn): giá mua (tiền theo kho) và SL dự kiến nhập; null = bỏ trống. */
    stock: z.array(z.object({ purchase: optionalAmount.default(null), planned: optionalAmount.default(null) })).max(30).default([]),
  })
  .superRefine((d, ctx) => {
    if (!d.nameMy && !d.nameEn) ctx.addIssue({ code: "custom", message: "Cần nhập tên sản phẩm", path: ["nameEn"] });
    if (!d.brandId && !d.brandName) ctx.addIssue({ code: "custom", message: "Cần chọn hoặc nhập tên thương hiệu", path: ["brandId"] });
    if (d.kind === "combo" && d.components.length === 0) ctx.addIssue({ code: "custom", message: "Combo cần ít nhất 1 thành phần", path: ["components"] });
    const stockFilled = d.stock.some((s) => s.purchase != null || s.planned != null);
    if (d.kind === "combo" && (d.warehouseId || stockFilled)) ctx.addIssue({ code: "custom", message: "Combo lấy kho bán của thành phần — không nhập kho / giá mua ở đây", path: ["warehouseId"] });
    if (!d.warehouseId && stockFilled) ctx.addIssue({ code: "custom", message: "Chọn Kho bán để biết giá mua theo VND hay MMK và hàng sẽ nhập vào kho nào", path: ["warehouseId"] });
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

  // Tên chỉ có chữ Myanmar → mã SP theo thương hiệu (giống nhập Excel) thay vì "product".
  const brandName = input.brandName || (input.brandId ? (await prisma.brand.findUnique({ where: { id: input.brandId }, select: { name: true } }))?.name : "") || "";
  const slug = suggestProductSlug(input.nameEn, input.nameMy, brandSlug(brandName) || "product");
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

  const payload = {
    // Nội dung chép từ SP nguồn (mô tả, cách dùng, thành phần, bảo quản, tag, hạn dùng); trống nếu tạo mới.
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
    fixedProfitMmk: null,
    copyFromId: input.copyFromId,
    variants,
  };
  if (input.kind === "combo" || !input.warehouseId) return saveProduct(payload, userId);
  const warehouseId = input.warehouseId;
  return prisma.$transaction(async (tx) => {
    const saved = await saveProduct(payload, userId, tx);
    await moveProductsToWarehouseTx(tx, [saved.id], warehouseId, userId);
    const loc = await tx.location.findUnique({ where: { id: warehouseId }, select: { pricingMode: true } });
    const idOf = new Map((await tx.variant.findMany({ where: { productId: saved.id }, select: { id: true, label: true } })).map((v) => [v.label, v.id]));
    const rows = labels.map((label, i) => ({ variantId: idOf.get(label), ...input.stock[i] })).filter((r): r is { variantId: string; purchase: number | null; planned: number | null } => !!r.variantId);
    await setPurchasePrices(tx, rows.flatMap((r) => (r.purchase != null ? [{ variantId: r.variantId, currency: currencyOfMode(loc?.pricingMode), amount: r.purchase }] : [])), { userId, source: "manual" });
    // SL dự kiến nhập: không phải tồn kho — phiếu nhập gợi ý số này (như cột Số lượng của Excel).
    for (const r of rows) if (r.planned) await tx.variant.update({ where: { id: r.variantId }, data: { plannedReceiveQty: r.planned } });
    return saved;
  }, { maxWait: 10_000, timeout: 30_000 });
}
