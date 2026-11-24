import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseCsv } from "@/lib/csv";
import { computeAlerts } from "@/server/alerts/queries";
import { previewCatalogImport } from "@/server/catalog/catalog-import";
import { sheetRowsToCsv } from "@/server/catalog/catalog-sheet-read";
import { LIST_TABS, listProductsPage } from "@/server/catalog/product-list";
import { loadReadiness } from "@/server/catalog/readiness";
import { productReadinessView } from "@/server/catalog/review";
import { salesBlockDays } from "@/server/inventory/documents";
import { stockByVariant, stockFilterSchema } from "@/server/inventory/overview";
import { availableToSell } from "@/server/orders/availability";
import type { AgentScope } from "./config";

/**
 * P25 GĐ 3 — công cụ CHỈ ĐỌC cho trợ lý AI quản trị (docs/ket-noi-tro-ly-ai.md §6).
 * Mỗi công cụ gọi đúng hàm domain mà trang admin đang dùng; không có đường ghi mới. Đầu ra gọn, chỉ trường agent cần.
 */
export class AgentToolError extends Error {}

type Ctx = { userId: string; now: Date };
export type AgentTool = {
  name: string;
  scope: AgentScope;
  description: string;
  input: z.ZodType;
  run: (input: never, ctx: Ctx) => Promise<unknown>;
};

const LOCALES = ["vi", "en", "my"] as const;
const sku = z.string().trim().min(1).max(64);
const skuList = z.array(sku).min(1).max(100);
const pick = <T extends { locale: string }>(rows: T[], locale: string) => rows.find((r) => r.locale === locale) ?? rows.find((r) => r.locale === "en") ?? rows[0];

/** Biến thể theo SKU (không phân biệt hoa thường); SKU không có → báo rõ để agent sửa. */
async function variantsBySku(skus: string[]) {
  const rows = await prisma.variant.findMany({
    where: { OR: skus.map((s) => ({ sku: { equals: s, mode: "insensitive" as const } })) },
    select: {
      id: true,
      sku: true,
      label: true,
      isBundle: true,
      active: true,
      priceMmk: true,
      purchasePriceVnd: true,
      purchasePriceMmk: true,
      purchasePriceAt: true,
      plannedReceiveQty: true,
      productId: true,
      product: { select: { slug: true, archivedAt: true, translations: { select: { locale: true, name: true } }, stockLocation: { select: { code: true, pricingMode: true } } } },
    },
  });
  const found = new Set(rows.map((r) => r.sku.toLowerCase()));
  return { rows, missing: skus.filter((s) => !found.has(s.toLowerCase())) };
}

const catalogSearchInput = z.object({
  q: z.string().trim().max(100).optional().describe("Tìm theo tên, SKU hoặc slug"),
  brand: z.string().trim().max(100).optional().describe("Tên hoặc slug thương hiệu"),
  category: z.string().trim().max(100).optional().describe("Slug hoặc tên danh mục (gồm danh mục con)"),
  warehouse: z.string().trim().max(20).optional().describe("Mã kho bán; 'none' = SP chưa có kho"),
  tab: z.enum(LIST_TABS).default("active").describe("Trạng thái như tab danh sách SP admin"),
  limit: z.number().int().min(1).max(50).default(20),
  page: z.number().int().min(1).default(1),
});

async function catalogSearch(i: z.infer<typeof catalogSearchInput>, { now }: Ctx) {
  const [brand, category, warehouse] = await Promise.all([
    i.brand ? prisma.brand.findFirst({ where: { OR: [{ slug: i.brand.toLowerCase() }, { name: { equals: i.brand, mode: "insensitive" } }] }, select: { id: true } }) : null,
    i.category
      ? prisma.category.findFirst({ where: { OR: [{ slug: i.category.toLowerCase() }, { translations: { some: { name: { equals: i.category, mode: "insensitive" } } } }] }, select: { id: true } })
      : null,
    i.warehouse && i.warehouse !== "none" ? prisma.location.findFirst({ where: { code: { equals: i.warehouse, mode: "insensitive" } }, select: { id: true } }) : null,
  ]);
  if (i.brand && !brand) throw new AgentToolError(`Không có thương hiệu "${i.brand}"`);
  if (i.category && !category) throw new AgentToolError(`Không có danh mục "${i.category}"`);
  if (i.warehouse && i.warehouse !== "none" && !warehouse) throw new AgentToolError(`Không có kho mã "${i.warehouse}"`);
  // Trang admin phân trang 20/50/100 → lấy trang 50 rồi cắt theo limit.
  const start = (i.page - 1) * i.limit;
  const res = await listProductsPage(
    { tab: i.tab, q: i.q, brandId: brand?.id, categoryId: category?.id, warehouseId: i.warehouse === "none" ? "none" : warehouse?.id, page: Math.floor(start / 50) + 1, pageSize: 50 },
    now,
  );
  const offset = start % 50;
  return {
    total: res.total,
    page: i.page,
    rows: res.rows.slice(offset, offset + i.limit).map((r) => ({
      name: r.name,
      brand: r.brand,
      category: r.category,
      warehouse: r.warehouse,
      status: r.label,
      published: r.published,
      archived: r.archived,
      priceMmk: r.price,
      stock: r.stock,
      sell: r.sell,
      variants: r.variants,
    })),
  };
}

const catalogGetInput = z.object({ sku, locale: z.enum(LOCALES).default("vi") });

async function catalogGet(i: z.infer<typeof catalogGetInput>) {
  const v = await prisma.variant.findFirst({ where: { sku: { equals: i.sku, mode: "insensitive" } }, select: { productId: true } });
  if (!v) throw new AgentToolError(`Không có SKU "${i.sku}"`);
  const [p, readiness] = await Promise.all([
    prisma.product.findUniqueOrThrow({
      where: { id: v.productId },
      select: {
        slug: true,
        published: true,
        archivedAt: true,
        approvalStatus: true,
        approvedAt: true,
        paoMonths: true,
        preorderEnabled: true,
        brand: { select: { name: true } },
        category: { select: { slug: true, translations: { select: { locale: true, name: true } } } },
        stockLocation: { select: { code: true, name: true, pricingMode: true } },
        translations: { select: { locale: true, name: true, description: true, usage: true, ingredientsText: true } },
        variants: { orderBy: { sku: "asc" }, select: { sku: true, label: true, active: true, isBundle: true, priceMmk: true, weightGrams: true } },
        changeRequest: { select: { productId: true } },
      },
    }),
    productReadinessView(v.productId),
  ]);
  const t = pick(p.translations, i.locale);
  return {
    name: t?.name ?? p.slug,
    names: Object.fromEntries(p.translations.map((x) => [x.locale, x.name])),
    description: t?.description ?? null,
    usage: t?.usage ?? null,
    ingredients: t?.ingredientsText ?? null,
    brand: p.brand.name,
    category: pick(p.category.translations, i.locale)?.name ?? p.category.slug,
    warehouse: p.stockLocation,
    approvalStatus: p.approvalStatus,
    approved: p.approvedAt !== null,
    pendingChanges: !!p.changeRequest,
    published: p.published,
    archived: p.archivedAt !== null,
    preorderEnabled: p.preorderEnabled,
    paoMonths: p.paoMonths,
    variants: p.variants,
    /** Mã lỗi/cảnh báo mở bán (như ô "Kiểm tra mở bán" của trang SP). */
    readiness: { errors: readiness.errors, warnings: readiness.warnings, notReceivedSkus: readiness.notReceivedSkus },
  };
}

const stockSummaryInput = z.object({
  q: z.string().trim().max(100).optional().describe("SKU, tên SP hoặc số lô"),
  page: z.number().int().min(1).default(1),
});

async function stockSummaryTool(i: z.infer<typeof stockSummaryInput>, { now }: Ctx) {
  const res = await stockByVariant(stockFilterSchema.parse({ tab: "all", q: i.q, page: i.page }), now);
  return {
    total: res.total,
    page: res.page,
    pageCount: res.pageCount,
    rows: res.rows.map((r) => ({
      sku: r.sku,
      name: r.name,
      label: r.label,
      isBundle: r.isBundle,
      archived: r.archived,
      /** Tồn hàng bán được theo mã kho (ngoài khu chờ kiểm tra). */
      byWarehouse: r.cols?.byLocation ?? {},
      tester: r.cols?.tester ?? 0,
      quarantine: r.cols?.quarantine ?? 0,
      reserved: r.reserved,
      available: r.available,
    })),
  };
}

const skusInput = z.object({ skus: skuList });

async function stockAvailable(i: z.infer<typeof skusInput>, { now }: Ctx) {
  const { rows, missing } = await variantsBySku(i.skus);
  const avail = rows.length ? await availableToSell(prisma, rows.map((r) => r.id), { now, blockDays: await salesBlockDays() }) : new Map<string, number>();
  return {
    rows: rows.map((r) => ({ sku: r.sku, isBundle: r.isBundle, active: r.active && !r.product.archivedAt, available: Math.max(0, avail.get(r.id) ?? 0), plannedReceiveQty: r.plannedReceiveQty })),
    missing,
  };
}

async function reorderSuggestions(_: unknown, { now }: Ctx) {
  const a = await computeAlerts(now);
  return {
    settings: { salesWindowDays: a.settings.salesWindowDays, coverDays: a.settings.coverDays, leadTimeDays: a.settings.leadTimeDays, safetyStock: a.settings.safetyStock },
    rows: a.reorder.map((r) => ({ sku: r.sku, name: r.name, available: r.available, otherQty: r.otherQty, soldUnits: r.soldUnits, dailySales: r.dailySales, coverDaysLeft: r.coverDaysLeft, need: r.need, suggestQty: r.suggestQty })),
  };
}

async function pricingGet(i: z.infer<typeof skusInput>) {
  const { rows, missing } = await variantsBySku(i.skus);
  const readiness = await loadReadiness(prisma, [...new Set(rows.map((r) => r.productId))]);
  const stale = new Set(
    [...readiness.values()].flatMap((x) => [...x.errors, ...x.warnings].filter((w) => w.code === "PRICE_STALE").flatMap((w) => w.skus ?? [])),
  );
  return {
    rows: rows.map((r) => {
      const currency = r.product.stockLocation?.pricingMode === "LOCAL_MMK" ? "MMK" : r.product.stockLocation ? "VND" : null;
      return {
        sku: r.sku,
        warehouse: r.product.stockLocation?.code ?? null,
        priceMmk: r.priceMmk,
        /** Giá mua hiện tại theo tiền của kho bán (VND: kho nhập VN, MMK: kho mua tại Myanmar). */
        purchase: { currency, vnd: r.purchasePriceVnd, mmk: r.purchasePriceMmk, changedAt: r.purchasePriceAt },
        /** Giá bán cũ hơn lần đổi giá mua / lần nhập mới nhất → nên tính lại (PRICE_STALE). */
        priceStale: stale.has(r.sku),
      };
    }),
    missing,
  };
}

const importPreviewInput = z.object({
  csv: z.string().min(1).max(2 * 1024 * 1024).describe("Nội dung CSV theo tiêu đề file mẫu Nhập Excel (nhãn vi/en/my)"),
});

async function importPreview(i: z.infer<typeof importPreviewInput>) {
  let sheet: { csv: string; lines: number[] };
  try {
    sheet = sheetRowsToCsv(parseCsv(i.csv));
  } catch (e) {
    throw new AgentToolError(e instanceof Error ? e.message : String(e));
  }
  const p = await previewCatalogImport({ csv: sheet.csv, lines: sheet.lines });
  return {
    /** Hash nội dung đã chuẩn hoá — dùng cho bước xác nhận sau này (GĐ 5, chưa mở). */
    previewHash: createHash("sha256").update(sheet.csv).digest("hex"),
    ok: p.errors.length === 0,
    errors: p.errors,
    warnings: p.warnings,
    general: p.general,
    counts: p.counts,
    rowCounts: p.rowCounts,
    rows: p.rows.map((r) => ({ line: r.line, action: r.action, sku: r.sku, skuAuto: r.skuAuto, name: r.name, brand: r.brand, category: r.category, label: r.label, changes: r.changes, planned: r.planned, purchase: r.purchase, issues: r.issues })),
  };
}

export const AGENT_TOOLS: AgentTool[] = [
  { name: "catalog_search", scope: "catalog:read", description: "Tìm sản phẩm trong admin (tên, SKU, thương hiệu, danh mục, kho bán, trạng thái duyệt/đăng bán, giá bán MMK, tồn bán được).", input: catalogSearchInput, run: catalogSearch as AgentTool["run"] },
  { name: "catalog_get", scope: "catalog:read", description: "Chi tiết một sản phẩm theo SKU: mô tả, cách dùng, thành phần, các phân loại, lỗi/cảnh báo còn thiếu để mở bán.", input: catalogGetInput, run: catalogGet as AgentTool["run"] },
  { name: "stock_summary", scope: "stock:read", description: "Tồn kho theo SKU (25 dòng/trang): tồn theo mã kho, tester, chờ kiểm tra, đang giữ cho đơn, còn bán được.", input: stockSummaryInput, run: stockSummaryTool as AgentTool["run"] },
  { name: "stock_available", scope: "stock:read", description: "Số còn bán được (như web khách) cho tối đa 100 SKU, combo tính theo thành phần; kèm SL dự kiến nhập.", input: skusInput, run: stockAvailable as AgentTool["run"] },
  { name: "reorder_suggestions", scope: "stock:read", description: "Gợi ý đặt hàng như trang Cảnh báo: tốc độ bán, số ngày còn đủ hàng, số nên đặt thêm.", input: z.object({}), run: reorderSuggestions as AgentTool["run"] },
  { name: "pricing_get", scope: "pricing:read", description: "Giá bán MMK, giá mua hiện tại (VND hoặc MMK theo kho), ngày đổi giá mua, cờ giá bán cũ cần tính lại — tối đa 100 SKU.", input: skusInput, run: pricingGet as AgentTool["run"] },
  { name: "import_preview", scope: "import:preview", description: "Kiểm file CSV nhập/cập nhật sản phẩm bằng đúng quy tắc trang Nhập Excel (chỉ xem trước, không ghi gì).", input: importPreviewInput, run: importPreview as AgentTool["run"] },
];

export const agentTool = (name: string) => AGENT_TOOLS.find((t) => t.name === name);
