/**
 * Dữ liệu DEMO (~40 SP thật từ lengocanh.vn) để test giao diện storefront — P5.
 * Chạy SAU `npm run db:seed` (cần nhân viên, kho, tỷ giá mẫu):
 *
 *   npm run db:seed:demo -- [--dry-run] [--no-images] [--allow-blob]
 *
 * - Chỉ dùng cho DB dev (hoặc preview khi được cho phép). KHÔNG chạy trên production, KHÔNG chạy trên glow_test
 *   (E2E dựa vào seed gốc).
 * - Chạy lại an toàn: tạo theo slug/mã nếu chưa có; ảnh chỉ tải cho SP chưa có ảnh; tồn kho chỉ nhập một lần (SH-DEMO-001).
 * - Ảnh mẫu thuộc bản quyền shop/thương hiệu → chỉ để test local: mặc định từ chối khi STORAGE_DRIVER=vercel-blob.
 * - Tồn kho đi đúng luồng nghiệp vụ: chuyến hàng → phiếu RECEIVE → ghi sổ (ledger) → đánh dấu đến → phân bổ chi phí.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/db";
import { normalizeForSearch } from "../src/lib/myanmar";
import { suggestPrice } from "../src/server/pricing/formula";

type Text = { name: string; description: string; usage: string };
type DemoProduct = {
  slug: string;
  brand: string;
  category: string;
  en: Text;
  my: Text;
  tags: string[];
  variants: { sku: string; label: string; priceVnd: number; weightGrams: number }[];
  stock: { qty: number; expiry: string } | null;
  images: string[];
};
type DemoCombo = {
  slug: string;
  brand: string;
  category: string;
  en: Text;
  my: Text;
  sku: string;
  label: string;
  discountPct: number;
  items: { sku: string; qty: number }[];
};
type Catalog = {
  pricing: { costRatio: number; marginPct: number };
  tags: { kind: "SKIN_TYPE" | "CONCERN" | "INGREDIENT"; slug: string; my: string; en: string }[];
  categories: { slug: string; parent?: string; sortOrder: number; my: string; en: string }[];
  brands: { slug: string; name: string; origin: string }[];
  products: DemoProduct[];
  combos: DemoCombo[];
};

const args = new Set(process.argv.slice(2));
const DRY = args.has("--dry-run");
const NO_IMAGES = args.has("--no-images");
const SHIPMENT_CODE = "SH-DEMO-001";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

const catalog = JSON.parse(readFileSync(path.join(import.meta.dirname, "../prisma/demo/catalog.json"), "utf8")) as Catalog;
const tr = (my: string, en: string) => [
  { locale: "my", name: my },
  { locale: "en", name: en },
];
const log = (msg: string) => console.log(msg);

async function main() {
  if (process.env.STORAGE_DRIVER === "vercel-blob" && !args.has("--allow-blob") && !NO_IMAGES) {
    throw new Error("STORAGE_DRIVER=vercel-blob: ảnh demo chỉ để test local. Dùng --no-images, hoặc --allow-blob nếu chắc chắn.");
  }
  const admin = await prisma.user.findUnique({ where: { email: "admin@glow.local" } });
  const mm = await prisma.location.findUnique({ where: { code: "THAM" } }); // P24: SP demo thuộc Kho Thắm
  const rate = await prisma.exchangeRate.findFirst({ orderBy: { effectiveAt: "desc" } });
  if (!admin || !mm || !rate) throw new Error("Chưa có dữ liệu nền — chạy `npm run db:seed` trước.");
  const roundTo = Number((await prisma.setting.findUnique({ where: { key: "pricing.roundTo" } }))?.value ?? 100);
  const { costRatio, marginPct } = catalog.pricing;
  const costOf = (priceVnd: number) => Math.round((priceVnd * costRatio) / 1000) * 1000;
  const mmkOf = (priceVnd: number) =>
    suggestPrice({ ...rate, costVnd: costOf(priceVnd), marginPct, roundTo });

  log(`${DRY ? "[dry-run] " : ""}Demo: ${catalog.products.length} SP + ${catalog.combos.length} combo · tỷ giá ${rate.mmkPerVnd} · lãi ${marginPct}%`);

  // ── Tag, danh mục, thương hiệu ──
  const tagId = new Map<string, string>();
  for (const t of await prisma.tag.findMany()) tagId.set(t.slug, t.id);
  let newTags = 0;
  for (const t of catalog.tags) {
    if (tagId.has(t.slug)) continue;
    newTags++;
    if (DRY) continue;
    const row = await prisma.tag.create({ data: { kind: t.kind, slug: t.slug, translations: { create: tr(t.my, t.en) } } });
    tagId.set(t.slug, row.id);
  }

  const catId = new Map<string, string>();
  for (const c of await prisma.category.findMany()) catId.set(c.slug, c.id);
  let newCats = 0;
  for (const c of catalog.categories) {
    if (catId.has(c.slug)) continue;
    newCats++;
    if (DRY) continue;
    const parentId = c.parent ? catId.get(c.parent) : undefined;
    if (c.parent && !parentId) throw new Error(`Thiếu danh mục cha ${c.parent} cho ${c.slug}`);
    const row = await prisma.category.create({
      data: { slug: c.slug, parentId, sortOrder: c.sortOrder, translations: { create: tr(c.my, c.en) } },
    });
    catId.set(c.slug, row.id);
  }

  const brandId = new Map<string, string>();
  for (const b of await prisma.brand.findMany()) brandId.set(b.slug, b.id);
  let newBrands = 0;
  for (const b of catalog.brands) {
    if (brandId.has(b.slug)) continue;
    newBrands++;
    if (DRY) continue;
    brandId.set(b.slug, (await prisma.brand.create({ data: b })).id);
  }
  log(`• Mới: ${newCats} danh mục · ${newBrands} thương hiệu · ${newTags} tag`);

  // ── Sản phẩm ──
  const brandName = new Map(catalog.brands.map((b) => [b.slug, b.name]));
  const createProduct = async (p: { slug: string; brand: string; category: string; en: Text; my: Text; tags: string[] }) =>
    prisma.product.create({
      data: {
        slug: p.slug,
        brandId: brandId.get(p.brand)!,
        categoryId: catId.get(p.category)!,
        stockLocationId: mm.id,
        published: true,
        approvedAt: new Date(), // QT2: dữ liệu mẫu đang hiển thị = đã duyệt (người duyệt = hệ thống)
        translations: {
          create: (["my", "en"] as const).map((locale) => ({
            locale,
            ...p[locale],
            searchText: normalizeForSearch(`${p[locale].name} ${brandName.get(p.brand) ?? ""}`),
          })),
        },
        tags: { create: p.tags.map((slug) => ({ tagId: tagId.get(slug)! })) },
      },
    });

  let newProducts = 0;
  for (const p of catalog.products) {
    if (await prisma.product.findUnique({ where: { slug: p.slug } })) continue;
    newProducts++;
    if (DRY) continue;
    const product = await createProduct(p);
    for (const v of p.variants) {
      await prisma.variant.create({
        data: { productId: product.id, sku: v.sku, label: v.label, priceMmk: mmkOf(v.priceVnd), weightGrams: v.weightGrams },
      });
    }
  }
  for (const c of catalog.combos) {
    if (await prisma.product.findUnique({ where: { slug: c.slug } })) continue;
    newProducts++;
    if (DRY) continue;
    const components = await Promise.all(
      c.items.map(async (i) => ({ ...i, variant: await prisma.variant.findUniqueOrThrow({ where: { sku: i.sku } }) })),
    );
    const full = components.reduce((s, i) => s + i.variant.priceMmk * i.qty, 0);
    const priceMmk = Math.ceil((full * (100 - c.discountPct)) / 100 / roundTo) * roundTo;
    const product = await createProduct({ ...c, tags: [] });
    const weight = components.reduce((s, i) => s + (i.variant.weightGrams ?? 0) * i.qty, 0);
    await prisma.variant.create({
      data: {
        productId: product.id,
        sku: c.sku,
        label: c.label,
        priceMmk,
        weightGrams: weight,
        isBundle: true,
        bundleItems: { create: components.map((i) => ({ componentId: i.variant.id, qty: i.qty })) },
      },
    });
  }
  log(`• Sản phẩm mới: ${newProducts}`);

  // ── Tồn kho: chuyến hàng demo → phiếu nhập → ghi sổ → đến nơi → phân bổ chi phí ──
  if (await prisma.inboundShipment.findUnique({ where: { code: SHIPMENT_CODE } })) {
    log(`• Tồn kho demo: đã có (${SHIPMENT_CODE}) → bỏ qua`);
  } else if (DRY) {
    log(`• Tồn kho demo: sẽ nhập ${catalog.products.filter((p) => p.stock).length} lô qua ${SHIPMENT_CODE}`);
  } else {
    const { createShipment, addShipmentCost, markShipmentArrived, allocateShipment } = await import(
      "../src/server/inventory/shipments"
    );
    const { createDocument, postDocument } = await import("../src/server/inventory/documents");
    const shipment = await createShipment({ code: SHIPMENT_CODE, departedAt: new Date(Date.now() - 20 * 86_400_000) });
    await addShipmentCost({ shipmentId: shipment.id, type: "SHIPPING", amountVnd: 6_000_000 });
    await addShipmentCost({ shipmentId: shipment.id, type: "TAX", amountVnd: 3_000_000 });
    const lines = [];
    for (const p of catalog.products) {
      if (!p.stock) continue;
      const v = p.variants[0];
      const variant = await prisma.variant.findUniqueOrThrow({ where: { sku: v.sku } });
      lines.push({
        variantId: variant.id,
        lotNo: `DM${p.stock.expiry.slice(2, 4)}${p.stock.expiry.slice(5, 7)}`,
        expiryDate: p.stock.expiry,
        unitCostVnd: costOf(v.priceVnd),
        qty: p.stock.qty,
      });
    }
    const doc = await createDocument(
      { type: "RECEIVE", toId: mm.id, shipmentId: shipment.id, reason: "Tồn demo (P5)", lines },
      admin.id,
    );
    await postDocument(doc.id, admin.id);
    await markShipmentArrived(shipment.id, admin.id);
    await allocateShipment(shipment.id, admin.id);
    log(`• Tồn kho demo: ${lines.length} lô (${doc.code})`);
  }

  // ── Ảnh (chỉ SP chưa có ảnh) ──
  if (NO_IMAGES) return log("• Ảnh: bỏ qua (--no-images)");
  const pending: { productId: string | null; slug: string; urls: string[] }[] = [];
  for (const p of catalog.products) {
    const product = await prisma.product.findUnique({ where: { slug: p.slug }, include: { _count: { select: { images: true } } } });
    if (product && product._count.images > 0) continue;
    pending.push({ productId: product?.id ?? null, slug: p.slug, urls: p.images });
  }
  const total = pending.reduce((s, p) => s + p.urls.length, 0);
  if (DRY) return log(`• Ảnh: sẽ tải ${total} ảnh cho ${pending.length} SP`);

  const { storage } = await import("../src/server/adapters/storage");
  const store = await storage();
  let saved = 0;
  const failed: string[] = [];
  for (const p of pending) {
    let sortOrder = 0;
    for (const url of p.urls) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim();
        if (!EXT[mime]) throw new Error(`định dạng ${mime || "?"}`);
        const data = Buffer.from(await res.arrayBuffer());
        if (data.length > MAX_IMAGE_BYTES) throw new Error(`${data.length} B > 5MB`);
        const key = `products/${p.slug}/demo-${sortOrder + 1}.${EXT[mime]}`;
        const file = await store.put(key, data, mime);
        const fo = await prisma.fileObject.upsert({
          where: { key },
          update: { url: file.url, mime, size: data.length, driver: file.driver },
          create: { key, url: file.url, mime, size: data.length, driver: file.driver },
        });
        await prisma.productImage.create({ data: { productId: p.productId!, fileId: fo.id, sortOrder, alt: p.slug } });
        sortOrder++;
        saved++;
      } catch (e) {
        failed.push(`${p.slug}: ${url} (${e instanceof Error ? e.message : e})`);
      }
      await new Promise((r) => setTimeout(r, 200)); // tải chậm, lịch sự với CDN nguồn
    }
  }
  log(`• Ảnh: ${saved}/${total} đã lưu${failed.length ? `, ${failed.length} lỗi → chạy lại:\n  ${failed.join("\n  ")}` : ""}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
