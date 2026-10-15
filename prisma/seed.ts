/**
 * Dữ liệu mẫu cho dev/test (có nội dung tiếng Myanmar). Chạy: `npm run db:seed`.
 * Bỏ qua nếu đã seed (có user admin). Reset toàn bộ: `npm run db:reset`.
 * Tồn đầu kỳ được tạo qua phiếu RECEIVE đã POSTED + ledger + balance (đúng quy tắc kho).
 */
import "dotenv/config";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";
import { PrismaClient, type StockType } from "../src/generated/prisma/client";

// SEED_VIA_WEBSOCKET=1: kết nối Neon qua WebSocket cổng 443 — dùng khi mạng chặn cổng 5432.
// Chỉ áp dụng cho công cụ seed; app luôn dùng Postgres chuẩn (adapter-pg).
function createAdapter() {
  const connectionString = process.env.DATABASE_URL;
  if (process.env.SEED_VIA_WEBSOCKET === "1") {
    neonConfig.webSocketConstructor = WebSocket;
    return new PrismaNeon({ connectionString });
  }
  return new PrismaPg({ connectionString });
}

const prisma = new PrismaClient({ adapter: createAdapter() });

const STAFF = [
  { id: "seed-admin", email: "admin@glow.local", name: "Admin", role: "ADMIN", locale: "vi" },
  { id: "seed-warehouse", email: "kho@glow.local", name: "Ko Aung (Kho)", role: "WAREHOUSE_MANAGER", locale: "my" },
  { id: "seed-orders", email: "donhang@glow.local", name: "Ma Thida (Đơn hàng)", role: "ORDER_STAFF", locale: "my" },
] as const;

const t = (my: string, en: string) => [
  { locale: "my", name: my },
  { locale: "en", name: en },
];

async function main() {
  if (await prisma.user.findUnique({ where: { email: STAFF[0].email } })) {
    console.log("Đã có dữ liệu seed → bỏ qua. Dùng `npm run db:reset` để làm lại.");
    return;
  }
  const password = process.env.SEED_STAFF_PASSWORD;
  if (!password) throw new Error("Thiếu SEED_STAFF_PASSWORD trong .env");
  const hash = await hashPassword(password);

  // ── Nhân viên ──
  for (const s of STAFF) {
    await prisma.user.create({
      data: {
        ...s,
        emailVerified: true,
        accounts: { create: { id: `${s.id}-cred`, accountId: s.id, providerId: "credential", password: hash } },
      },
    });
  }
  const adminId = STAFF[0].id;

  // ── Cài đặt mặc định (PLAN.md: quyết định đã chốt) ──
  const settings: Record<string, unknown> = {
    "expiry.blockDays": 90,
    "expiry.warnDays": 180,
    "reservation.transferHours": 24,
    "cod.confirmHours": 24,
    "pricing.roundTo": 100,
    "payment.bankInstructions": "KBZ Bank · 999-000-0000 · Glow VN (mẫu)",
  };
  for (const [key, value] of Object.entries(settings)) {
    await prisma.setting.create({ data: { key, value: value as never } });
  }

  // ── Kho & vị trí ──
  const vn = await prisma.warehouse.create({ data: { code: "VN-HCM", name: "Kho TP.HCM", country: "VN" } });
  const mm = await prisma.warehouse.create({ data: { code: "MM-YGN", name: "Yangon Warehouse", country: "MM" } });
  const loc = {
    vn: await prisma.location.create({ data: { code: "VN-STOCK", name: "Kho VN", type: "VN_STOCK", warehouseId: vn.id } }),
    transit: await prisma.location.create({ data: { code: "IN-TRANSIT", name: "Đang vận chuyển", type: "IN_TRANSIT" } }),
    customs: await prisma.location.create({ data: { code: "CUSTOMS", name: "Hải quan", type: "CUSTOMS" } }),
    mm: await prisma.location.create({
      data: { code: "MM-STOCK", name: "Kho Yangon", type: "MM_STOCK", warehouseId: mm.id, sellable: true },
    }),
    quarantine: await prisma.location.create({
      data: { code: "MM-QC", name: "Chờ kiểm tra", type: "QUARANTINE", warehouseId: mm.id },
    }),
  };

  // ── Tỷ giá mẫu (KHÔNG phải tỷ giá thật) ──
  const rate = await prisma.exchangeRate.create({
    data: { mmkPerVnd: "0.170000", note: "Tỷ giá mẫu cho dev", createdById: adminId },
  });

  // ── Danh mục ──
  const cat = async (slug: string, sortOrder: number, my: string, en: string) =>
    prisma.category.create({ data: { slug, sortOrder, translations: { create: t(my, en) } } });
  const skincare = await cat("skincare", 1, "အသားအရေ ထိန်းသိမ်းမှု", "Skincare");
  const makeup = await cat("makeup", 2, "မိတ်ကပ်", "Makeup");
  const hair = await cat("hair", 3, "ဆံပင်", "Hair care");
  await cat("body", 4, "ခန္ဓာကိုယ်", "Body care");

  // ── Tag lọc ──
  const tag = async (kind: "SKIN_TYPE" | "CONCERN" | "INGREDIENT", slug: string, my: string, en: string) =>
    prisma.tag.create({ data: { kind, slug, translations: { create: t(my, en) } } });
  const oily = await tag("SKIN_TYPE", "oily", "အဆီပြန်သော အသားအရေ", "Oily skin");
  const dry = await tag("SKIN_TYPE", "dry", "ခြောက်သွေ့သော အသားအရေ", "Dry skin");
  const sensitive = await tag("SKIN_TYPE", "sensitive", "ထိခိုက်လွယ်သော အသားအရေ", "Sensitive skin");
  const acne = await tag("CONCERN", "acne", "ဝက်ခြံ", "Acne");
  const bright = await tag("CONCERN", "brightening", "အသားအရေ ကြည်လင်စေခြင်း", "Brightening");
  const niacin = await tag("INGREDIENT", "niacinamide", "နိုင်ယာစီနာမိုက်", "Niacinamide");
  const vitc = await tag("INGREDIENT", "vitamin-c", "ဗီတာမင် စီ", "Vitamin C");
  const hyal = await tag("INGREDIENT", "hyaluronic-acid", "ဟိုင်ယာလူရောနစ် အက်ဆစ်", "Hyaluronic acid");

  // ── Thương hiệu (tên giả lập) ──
  const senviet = await prisma.brand.create({ data: { slug: "sen-viet", name: "Sen Việt", origin: "VN" } });
  const moclan = await prisma.brand.create({ data: { slug: "moc-lan", name: "Mộc Lan", origin: "VN" } });

  // ── Sản phẩm ──
  type V = { sku: string; label: string; priceMmk: number; costVnd: number; weightGrams: number };
  const product = async (p: {
    slug: string;
    brandId: string;
    categoryId: string;
    storageNote?: string;
    my: { name: string; description: string; usage: string };
    en: { name: string; description: string; usage: string };
    ingredientsText: string;
    tags: string[];
    variants: V[];
  }) =>
    prisma.product.create({
      data: {
        slug: p.slug,
        brandId: p.brandId,
        categoryId: p.categoryId,
        storageNote: p.storageNote,
        published: true,
        translations: {
          create: (["my", "en"] as const).map((locale) => ({
            locale,
            ...p[locale],
            ingredientsText: p.ingredientsText,
            searchText: `${p[locale].name} ${p.ingredientsText}`.toLowerCase(),
          })),
        },
        tags: { create: p.tags.map((tagId) => ({ tagId })) },
        variants: {
          create: p.variants.map((v) => ({ sku: v.sku, label: v.label, priceMmk: v.priceMmk, weightGrams: v.weightGrams })),
        },
      },
      include: { variants: true },
    });

  const sunscreen = await product({
    slug: "sen-viet-sunscreen-spf50",
    brandId: senviet.id,
    categoryId: skincare.id,
    storageNote: "Bảo quản dưới 30°C, tránh ánh nắng trực tiếp.",
    my: {
      name: "နေကာခရင်မ် SPF50 PA++++",
      description: "ပေါ့ပါးပြီး အဆီမပြန်သော နေကာခရင်မ်။ နေ့စဉ် အသုံးပြုနိုင်သည်။",
      usage: "နေထဲမထွက်မီ ၁၅ မိနစ်အလိုတွင် မျက်နှာနှင့် လည်ပင်းတွင် လိမ်းပါ။",
    },
    en: {
      name: "Sunscreen SPF50 PA++++",
      description: "Lightweight, non-greasy daily sunscreen.",
      usage: "Apply to face and neck 15 minutes before sun exposure.",
    },
    ingredientsText: "Aqua, Zinc Oxide, Niacinamide, Glycerin",
    tags: [oily.id, sensitive.id, niacin.id],
    variants: [
      { sku: "SV-SUN-50", label: "50ml", priceMmk: 25000, costVnd: 95000, weightGrams: 80 },
      { sku: "SV-SUN-100", label: "100ml", priceMmk: 42000, costVnd: 160000, weightGrams: 140 },
    ],
  });

  const toner = await product({
    slug: "moc-lan-rose-toner",
    brandId: moclan.id,
    categoryId: skincare.id,
    my: {
      name: "နှင်းဆီ တိုနာ ၁၅၀ မီလီ",
      description: "အသားအရေကို စိုပြေစေပြီး ချောမွေ့စေသော တိုနာ။",
      usage: "မျက်နှာသစ်ပြီးနောက် ဝါဂွမ်းဖြင့် သုတ်လိမ်းပါ။",
    },
    en: {
      name: "Rose Toner 150ml",
      description: "Hydrating and soothing rose toner.",
      usage: "After cleansing, apply with a cotton pad.",
    },
    ingredientsText: "Rosa Damascena Flower Water, Hyaluronic Acid, Glycerin",
    tags: [dry.id, sensitive.id, hyal.id],
    variants: [{ sku: "ML-TON-150", label: "150ml", priceMmk: 18500, costVnd: 70000, weightGrams: 200 }],
  });

  const serum = await product({
    slug: "sen-viet-vitamin-c-serum",
    brandId: senviet.id,
    categoryId: skincare.id,
    storageNote: "Đậy kín nắp, để nơi khô mát.",
    my: {
      name: "ဗီတာမင်စီ ဆီရမ်",
      description: "အသားအရေ ကြည်လင်တောက်ပစေရန် ဗီတာမင်စီ ဆီရမ်။",
      usage: "ညနေတိုင်း ၂-၃ စက်ကို မျက်နှာတွင် လိမ်းပါ။",
    },
    en: {
      name: "Vitamin C Serum",
      description: "Brightening vitamin C serum.",
      usage: "Apply 2–3 drops to the face every evening.",
    },
    ingredientsText: "Aqua, Ascorbic Acid, Niacinamide",
    tags: [oily.id, bright.id, acne.id, vitc.id, niacin.id],
    variants: [{ sku: "SV-VC-30", label: "30ml", priceMmk: 32000, costVnd: 120000, weightGrams: 90 }],
  });

  const lipstick = await product({
    slug: "moc-lan-matte-lipstick",
    brandId: moclan.id,
    categoryId: makeup.id,
    my: {
      name: "မက်တ် နှုတ်ခမ်းနီ",
      description: "ကြာရှည်ခံသော မက်တ် နှုတ်ခမ်းနီ။",
      usage: "နှုတ်ခမ်းပေါ်တွင် တိုက်ရိုက် လိမ်းပါ။",
    },
    en: { name: "Matte Lipstick", description: "Long-lasting matte lipstick.", usage: "Apply directly to lips." },
    ingredientsText: "Ricinus Communis Seed Oil, Cera Alba, CI 15850",
    tags: [],
    variants: [
      { sku: "ML-LIP-01", label: "#01 Rose", priceMmk: 15000, costVnd: 55000, weightGrams: 30 },
      { sku: "ML-LIP-02", label: "#02 Coral", priceMmk: 15000, costVnd: 55000, weightGrams: 30 },
    ],
  });

  await product({
    slug: "sen-viet-herbal-shampoo",
    brandId: senviet.id,
    categoryId: hair.id,
    my: {
      name: "ဆေးဖက်ဝင် ခေါင်းလျှော်ရည်",
      description: "ဆံပင်ကျွတ်ခြင်းကို လျော့ချပေးသော ခေါင်းလျှော်ရည်။",
      usage: "ဆံပင်စိုစွတ်နေစဉ် လိမ်းပြီး သန့်စင်အောင် ဆေးပါ။",
    },
    en: { name: "Herbal Shampoo", description: "Anti hair-fall herbal shampoo.", usage: "Massage into wet hair, rinse." },
    ingredientsText: "Aqua, Grapefruit Peel Oil, Panthenol",
    tags: [],
    variants: [{ sku: "SV-SHA-300", label: "300ml", priceMmk: 22000, costVnd: 85000, weightGrams: 350 }],
  });

  // ── Combo: kem chống nắng 50ml + toner ──
  const comboProduct = await product({
    slug: "combo-sun-toner",
    brandId: senviet.id,
    categoryId: skincare.id,
    my: {
      name: "ကွန်ဘို: နေကာခရင်မ် + တိုနာ",
      description: "နေ့စဉ် အသားအရေ ထိန်းသိမ်းမှု အစုံ။",
      usage: "ပစ္စည်းတစ်ခုချင်းစီ၏ အသုံးပြုနည်းအတိုင်း။",
    },
    en: { name: "Combo: Sunscreen + Toner", description: "Daily skincare set.", usage: "See each item." },
    ingredientsText: "",
    tags: [],
    variants: [{ sku: "COMBO-SUN-TON", label: "Set", priceMmk: 40000, costVnd: 0, weightGrams: 280 }],
  });
  const comboVariant = comboProduct.variants[0];
  await prisma.variant.update({ where: { id: comboVariant.id }, data: { isBundle: true } });
  await prisma.bundleItem.createMany({
    data: [
      { bundleId: comboVariant.id, componentId: sunscreen.variants.find((v) => v.sku === "SV-SUN-50")!.id, qty: 1 },
      { bundleId: comboVariant.id, componentId: toner.variants[0].id, qty: 1 },
    ],
  });

  // ── Chuyến hàng + lô + tồn đầu kỳ (qua phiếu RECEIVE đã POSTED) ──
  const shipment = await prisma.inboundShipment.create({
    data: {
      code: "SH-2026-001",
      departedAt: new Date("2026-09-01T00:00:00Z"),
      arrivedAt: new Date("2026-09-20T00:00:00Z"),
      costs: {
        create: [
          { type: "SHIPPING", amountVnd: 3_000_000 },
          { type: "TAX", amountVnd: 1_500_000 },
          { type: "FEE", amountVnd: 500_000 },
        ],
      },
    },
  });

  const costOf: Record<string, number> = {
    "SV-SUN-50": 95000,
    "SV-SUN-100": 160000,
    "ML-TON-150": 70000,
    "SV-VC-30": 120000,
    "ML-LIP-01": 55000,
    "ML-LIP-02": 55000,
  };
  const allVariants = [...sunscreen.variants, ...toner.variants, ...serum.variants, ...lipstick.variants];
  const plan: { sku: string; lot: string; expiry: string; qty: number; tester?: number }[] = [
    { sku: "SV-SUN-50", lot: "L2601", expiry: "2027-01-15", qty: 20 }, // cận hạn → FEFO xuất trước
    { sku: "SV-SUN-50", lot: "L2608", expiry: "2028-03-31", qty: 60, tester: 3 },
    { sku: "SV-SUN-100", lot: "L2608", expiry: "2028-03-31", qty: 30 },
    { sku: "ML-TON-150", lot: "T2605", expiry: "2028-05-31", qty: 40, tester: 2 },
    { sku: "SV-VC-30", lot: "C2602", expiry: "2026-12-31", qty: 10 }, // dưới 90 ngày → không bán
    { sku: "SV-VC-30", lot: "C2607", expiry: "2027-12-31", qty: 25 },
    { sku: "ML-LIP-01", lot: "P2606", expiry: "2029-06-30", qty: 50 },
    { sku: "ML-LIP-02", lot: "P2606", expiry: "2029-06-30", qty: 4 }, // tồn thấp
  ];

  await prisma.$transaction(async (tx) => {
    const doc = await tx.stockDocument.create({
      data: {
        code: "RC-SEED-0001",
        type: "RECEIVE",
        status: "POSTED",
        toId: loc.mm.id,
        shipmentId: shipment.id,
        reason: "Tồn đầu kỳ (seed)",
        createdById: adminId,
        postedById: adminId,
        postedAt: new Date(),
      },
    });
    for (const row of plan) {
      const variant = allVariants.find((v) => v.sku === row.sku)!;
      const batch = await tx.batch.create({
        data: {
          variantId: variant.id,
          lotNo: row.lot,
          expiryDate: new Date(`${row.expiry}T00:00:00Z`),
          unitCostVnd: costOf[row.sku],
          rateId: rate.id,
          shipmentId: shipment.id,
        },
      });
      const lines: { stockType: StockType; qty: number }[] = [{ stockType: "SELLABLE", qty: row.qty }];
      if (row.tester) lines.push({ stockType: "TESTER", qty: row.tester });
      for (const l of lines) {
        await tx.stockDocumentLine.create({
          data: { documentId: doc.id, variantId: variant.id, batchId: batch.id, stockType: l.stockType, qty: l.qty },
        });
        await tx.stockLedger.create({
          data: {
            documentId: doc.id,
            batchId: batch.id,
            locationId: loc.mm.id,
            stockType: l.stockType,
            qtyDelta: l.qty,
            userId: adminId,
          },
        });
        await tx.stockBalance.create({
          data: { batchId: batch.id, locationId: loc.mm.id, stockType: l.stockType, qty: l.qty },
        });
      }
    }
  });

  // ── Vùng giao hàng ──
  const zones = [
    { code: "YGN-KMY", region: "Yangon", township: "Kamayut", nameMy: "ကမာရွတ်", nameEn: "Kamayut", fee: 2500 },
    { code: "YGN-BHN", region: "Yangon", township: "Bahan", nameMy: "ဗဟန်း", nameEn: "Bahan", fee: 2500 },
    { code: "YGN-HLG", region: "Yangon", township: "Hlaing", nameMy: "လှိုင်", nameEn: "Hlaing", fee: 3000 },
    { code: "MDY-CAT", region: "Mandalay", township: "Chanayethazan", nameMy: "ချမ်းအေးသာစံ", nameEn: "Chanayethazan", fee: 5000 },
  ];
  for (const z of zones) {
    const { fee, ...zone } = z;
    await prisma.shippingZone.create({
      data: { ...zone, rates: { create: { feeMmk: fee, freeFromMmk: 100000, etaDays: z.region === "Yangon" ? 2 : 4 } } },
    });
  }

  console.log("Seed xong: 3 nhân viên, 6 sản phẩm (1 combo), 8 lô, 4 vùng giao hàng.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
