/**
 * Dữ liệu mẫu cho dev/test (có nội dung tiếng Myanmar). Chạy: `npm run db:seed`.
 * Chạy lại an toàn: từng phần (catalog / tồn kho / vùng giao hàng) chỉ chạy nếu chưa có.
 * Reset toàn bộ: `npm run db:reset`.
 * Tồn đầu kỳ được tạo qua phiếu RECEIVE đã POSTED + ledger + balance (đúng quy tắc kho).
 */
import "dotenv/config";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";
import { PrismaClient, type StockType } from "../src/generated/prisma/client";
import { normalizeForSearch } from "../src/lib/myanmar";

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

/** Nhân viên, cài đặt, kho, tỷ giá, danh mục, sản phẩm, chuyến hàng mẫu. */
async function seedCatalog() {
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
  // upsert không ghi đè: giữ giá trị đã có (đã sửa ở /admin/settings hoặc do test ghi trước).
  for (const [key, value] of Object.entries(settings)) {
    await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value: value as never } });
  }

  // ── Kho & vị trí ──
  const vn = await prisma.warehouse.create({ data: { code: "VN-HCM", name: "Kho TP.HCM", country: "VN" } });
  const mm = await prisma.warehouse.create({ data: { code: "MM-YGN", name: "Yangon Warehouse", country: "MM" } });
  await prisma.location.create({ data: { code: "VN-STOCK", name: "Kho VN", type: "VN_STOCK", warehouseId: vn.id } });
  await prisma.location.create({ data: { code: "IN-TRANSIT", name: "Đang vận chuyển", type: "IN_TRANSIT" } });
  await prisma.location.create({ data: { code: "CUSTOMS", name: "Hải quan", type: "CUSTOMS" } });
  await prisma.location.create({
    data: { code: "MM-STOCK", name: "Kho Yangon", type: "MM_STOCK", warehouseId: mm.id, sellable: true },
  });
  await prisma.location.create({ data: { code: "MM-QC", name: "Chờ kiểm tra", type: "QUARANTINE", warehouseId: mm.id } });

  // ── Tỷ giá mẫu (KHÔNG phải tỷ giá thật) ──
  await prisma.exchangeRate.create({
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
            searchText: normalizeForSearch(`${p[locale].name} ${p.ingredientsText}`),
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

  await product({
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

  await product({
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
  await prisma.inboundShipment.create({
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
}

/** Lô + tồn đầu kỳ qua phiếu RECEIVE đã POSTED (một transaction). */
async function seedStock() {
  const adminId = STAFF[0].id;
  // Đúng tỷ giá mẫu của seed (DB test có thể đã có tỷ giá khác do test tạo trước).
  const rate = await prisma.exchangeRate.findFirstOrThrow({
    where: { note: "Tỷ giá mẫu cho dev" },
    orderBy: { createdAt: "asc" },
  });
  const loc = { mm: await prisma.location.findUniqueOrThrow({ where: { code: "MM-STOCK" } }) };
  const shipment = await prisma.inboundShipment.findUniqueOrThrow({ where: { code: "SH-2026-001" } });
  const allVariants = await prisma.variant.findMany();

  const costOf: Record<string, number> = {
    "SV-SUN-50": 95000,
    "SV-SUN-100": 160000,
    "ML-TON-150": 70000,
    "SV-VC-30": 120000,
    "ML-LIP-01": 55000,
    "ML-LIP-02": 55000,
  };
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
  }, { maxWait: 30_000, timeout: 120_000 }); // DB ở xa (Neon Singapore) → cho thêm thời gian
}

async function seedZones() {
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
}

/** Phân bổ chi phí chuyến hàng mẫu vào giá vốn lô (để báo cáo lợi nhuận có số). Dùng đúng hàm nghiệp vụ. */
async function seedLandedCost() {
  const shipment = await prisma.inboundShipment.findUniqueOrThrow({ where: { code: "SH-2026-001" } });
  const { allocateShipment } = await import("../src/server/inventory/shipments");
  await allocateShipment(shipment.id, STAFF[0].id);
}

/**
 * Đơn mẫu cho dashboard/báo cáo — đi qua ĐÚNG luồng nghiệp vụ (tạo đơn → xác nhận → đóng gói FEFO
 * → giao → hoàn tất, trả hàng, huỷ), không ghi DB trực tiếp. Ngày trạng thái lùi vài ngày để biểu đồ có dữ liệu.
 * Không dùng ML-LIP-02 (E2E cần tồn thấp cố định của mã này).
 */
async function seedDemoOrders() {
  const { createOrder } = await import("../src/server/orders/orders");
  const { transitionOrder } = await import("../src/server/orders/transitions");
  const { returnItems } = await import("../src/server/orders/returns");
  type Step = Parameters<typeof transitionOrder>[1];

  const DAY = 86_400_000;
  const ago = (days: number) => new Date(Date.now() - days * DAY);
  const admin = { userId: STAFF[0].id, role: "ADMIN" as const };
  const zone = await prisma.shippingZone.findUniqueOrThrow({ where: { code: "YGN-KMY" } });
  const mm = await prisma.location.findUniqueOrThrow({ where: { code: "MM-STOCK" } });
  const qc = await prisma.location.findUniqueOrThrow({ where: { code: "MM-QC" } });
  const id = async (sku: string) => (await prisma.variant.findUniqueOrThrow({ where: { sku } })).id;

  const demo = async (
    key: string,
    o: { method: "COD" | "BANK_TRANSFER"; name: string; phone: string; items: [string, number][]; createdDaysAgo: number },
    steps: [Step, number][],
  ) => {
    const order = await createOrder(
      {
        idempotencyKey: key,
        channel: "FACEBOOK",
        paymentMethod: o.method,
        name: o.name,
        phone: o.phone,
        zoneId: zone.id,
        addressLine: "အမှတ် ၁၂၊ ဗိုလ်အောင်ကျော်လမ်း",
        locale: "my",
        items: await Promise.all(o.items.map(async ([sku, qty]) => ({ variantId: await id(sku), qty }))),
      },
      { userId: STAFF[2].id, now: ago(o.createdDaysAgo) },
    );
    for (const [step, days] of steps) {
      const extra = step === "pack" ? { fromLocationId: mm.id } : step === "ship" ? { carrier: "Royal Express" } : {};
      await transitionOrder(order.id, step, admin, extra, ago(days));
    }
    return order;
  };

  await demo("seed-demo-1", { method: "COD", name: "Ma Hla", phone: "09 7812 0001", items: [["SV-SUN-50", 2], ["ML-TON-150", 1]], createdDaysAgo: 6 }, [
    ["confirmCod", 6],
    ["pack", 5],
    ["ship", 5],
    ["complete", 4],
  ]);
  await demo("seed-demo-2", { method: "BANK_TRANSFER", name: "Ko Zaw", phone: "09 7812 0002", items: [["SV-VC-30", 1]], createdDaysAgo: 4 }, [
    ["confirmPayment", 4],
    ["pack", 3],
    ["ship", 3],
    ["complete", 2],
  ]);
  const withReturn = await demo(
    "seed-demo-3",
    { method: "COD", name: "Daw Mya", phone: "09 7812 0003", items: [["SV-SUN-100", 1], ["COMBO-SUN-TON", 1]], createdDaysAgo: 3 },
    [
      ["confirmCod", 3],
      ["pack", 2],
      ["ship", 2],
      ["complete", 1],
    ],
  );
  const sun100 = await prisma.orderItem.findFirstOrThrow({ where: { orderId: withReturn.id, sku: "SV-SUN-100" } });
  await returnItems(withReturn.id, { toLocationId: qc.id, lines: [{ orderItemId: sun100.id, qty: 1 }], reason: "Vỏ hộp móp (mẫu)" }, admin);
  await demo("seed-demo-4", { method: "COD", name: "Ko Min", phone: "09 7812 0004", items: [["ML-LIP-01", 2]], createdDaysAgo: 2 }, [["cancel", 2]]);
  await demo("seed-demo-5", { method: "COD", name: "Ma Su", phone: "09 7812 0005", items: [["SV-SUN-50", 1]], createdDaysAgo: 0 }, []);
}

/** CTV mẫu (P10): ctv@glow.local, mã MAUNG, 10%; mật khẩu = SEED_STAFF_PASSWORD. */
const AFFILIATE = { id: "seed-affiliate", email: "ctv@glow.local", name: "Ko Maung (CTV)", code: "MAUNG" } as const;

async function seedAffiliate() {
  const password = process.env.SEED_STAFF_PASSWORD;
  if (!password) throw new Error("Thiếu SEED_STAFF_PASSWORD trong .env");
  await prisma.user.create({
    data: {
      id: AFFILIATE.id,
      email: AFFILIATE.email,
      name: AFFILIATE.name,
      role: "AFFILIATE",
      locale: "my",
      emailVerified: true,
      accounts: {
        create: { id: `${AFFILIATE.id}-cred`, accountId: AFFILIATE.id, providerId: "credential", password: await hashPassword(password) },
      },
      affiliate: { create: { code: AFFILIATE.code, phone: "0978100000", commissionRateBp: 1000, payoutInfo: "KBZPay 09 7810 0000" } },
    },
  });
}

/** CTV cấp dưới mẫu (P11): ctv2@glow.local, mã LINN, nằm dưới MAUNG (MAUNG hưởng % tầng trên). */
const AFFILIATE_2 = { id: "seed-affiliate-2", email: "ctv2@glow.local", name: "Ko Lin (CTV cấp dưới)", code: "LINN" } as const;

async function seedSubAffiliate() {
  const password = process.env.SEED_STAFF_PASSWORD;
  if (!password) throw new Error("Thiếu SEED_STAFF_PASSWORD trong .env");
  const parent = await prisma.affiliate.findUniqueOrThrow({ where: { code: AFFILIATE.code } });
  await prisma.user.create({
    data: {
      id: AFFILIATE_2.id,
      email: AFFILIATE_2.email,
      name: AFFILIATE_2.name,
      role: "AFFILIATE",
      locale: "my",
      emailVerified: true,
      accounts: {
        create: { id: `${AFFILIATE_2.id}-cred`, accountId: AFFILIATE_2.id, providerId: "credential", password: await hashPassword(password) },
      },
      affiliate: { create: { code: AFFILIATE_2.code, phone: "0978200000", commissionRateBp: 1000, parentId: parent.id } },
    },
  });
}

/** Đơn mẫu của CTV: 1 đơn khách đặt qua link đã hoàn tất 10 ngày trước (đến hạn trả), 1 đơn CTV tự lên đang chờ. */
const ago = (days: number) => new Date(Date.now() - days * 86_400_000);

/** Đi hết luồng đơn (xác nhận COD → đóng gói → giao → hoàn tất) bằng hàm nghiệp vụ, hoàn tất `days` ngày trước. */
async function completeDemo(orderId: string, days: number) {
  const { transitionOrder } = await import("../src/server/orders/transitions");
  const admin = { userId: STAFF[0].id, role: "ADMIN" as const };
  const mm = await prisma.location.findUniqueOrThrow({ where: { code: "MM-STOCK" } });
  for (const [step, back] of [["confirmCod", 2], ["pack", 1], ["ship", 1], ["complete", 0]] as const) {
    const extra = step === "pack" ? { fromLocationId: mm.id } : step === "ship" ? { carrier: "Royal Express" } : {};
    await transitionOrder(orderId, step, admin, extra, ago(days + back));
  }
}

async function demoOrderInput(key: string, name: string, phone: string, sku: string) {
  const zone = await prisma.shippingZone.findUniqueOrThrow({ where: { code: "YGN-KMY" } });
  const variant = await prisma.variant.findUniqueOrThrow({ where: { sku } });
  return {
    idempotencyKey: key,
    paymentMethod: "COD" as const,
    name,
    phone,
    zoneId: zone.id,
    addressLine: "အမှတ် ၅၊ ပန်းဆိုးတန်းလမ်း",
    locale: "my" as const,
    items: [{ variantId: variant.id, qty: 1 }],
  };
}

/** Đơn mẫu của CTV cấp dưới LINN: khách đặt qua link, hoàn tất 9 ngày trước → MAUNG có hoa hồng tầng trên đến hạn. */
async function seedSubAffiliateOrders() {
  const { createOrder } = await import("../src/server/orders/orders");
  const order = await createOrder(await demoOrderInput("seed-ctv-3", "Ma Thin", "09 7812 0013", "SV-SUN-50"), {
    userId: null,
    now: ago(11),
    affiliate: { source: "LINK", code: AFFILIATE_2.code },
  });
  await completeDemo(order.id, 9);
}

async function seedAffiliateOrders() {
  const { createOrder } = await import("../src/server/orders/orders");
  const affiliate = await prisma.affiliate.findUniqueOrThrow({ where: { code: AFFILIATE.code } });
  const linked = await createOrder(await demoOrderInput("seed-ctv-1", "Ma Nwe", "09 7812 0011", "ML-TON-150"), {
    userId: null,
    now: ago(12),
    affiliate: { source: "LINK", code: AFFILIATE.code },
  });
  await completeDemo(linked.id, 10);
  await createOrder(
    { ...(await demoOrderInput("seed-ctv-2", "Ko Thet", "09 7812 0012", "SV-VC-30")), channel: "FACEBOOK" },
    { userId: AFFILIATE.id, now: ago(1), affiliate: { source: "AFFILIATE", id: affiliate.id } },
  );
}

async function main() {
  if (await prisma.user.findUnique({ where: { email: STAFF[0].email } })) {
    console.log("• Nhân viên + catalog: đã có → bỏ qua");
  } else {
    await seedCatalog();
    console.log("• Nhân viên + catalog: xong");
  }
  if (await prisma.stockDocument.findUnique({ where: { code: "RC-SEED-0001" } })) {
    console.log("• Tồn đầu kỳ: đã có → bỏ qua");
  } else {
    await seedStock();
    console.log("• Tồn đầu kỳ: xong");
  }
  // Kiểm tra theo mã vùng mẫu (không đếm tổng): DB test có thể đã có vùng do integration test tạo.
  if (await prisma.shippingZone.findUnique({ where: { code: "YGN-KMY" } })) {
    console.log("• Vùng giao hàng: đã có → bỏ qua");
  } else {
    await seedZones();
    console.log("• Vùng giao hàng: xong");
  }
  if (await prisma.user.findUnique({ where: { email: AFFILIATE.email } })) {
    console.log("• CTV mẫu: đã có → bỏ qua");
  } else {
    await seedAffiliate();
    console.log("• CTV mẫu: xong (ctv@glow.local, mã MAUNG)");
  }
  if (await prisma.user.findUnique({ where: { email: AFFILIATE_2.email } })) {
    console.log("• CTV cấp dưới mẫu: đã có → bỏ qua");
  } else {
    await seedSubAffiliate();
    console.log("• CTV cấp dưới mẫu: xong (ctv2@glow.local, mã LINN, dưới MAUNG)");
  }
  // Các bước dưới gọi hàm nghiệp vụ (src/server, kết nối qua DATABASE_URL) → bỏ qua khi seed qua WebSocket.
  if (process.env.SEED_VIA_WEBSOCKET === "1") {
    console.log("• Landed cost + đơn mẫu: bỏ qua (SEED_VIA_WEBSOCKET)");
  } else {
    if (await prisma.batch.count({ where: { shipment: { code: "SH-2026-001" }, landedCostVnd: null } })) {
      await seedLandedCost();
      console.log("• Landed cost chuyến mẫu: xong");
    } else {
      console.log("• Landed cost chuyến mẫu: đã có → bỏ qua");
    }
    if (await prisma.order.findUnique({ where: { idempotencyKey: "seed-demo-1" } })) {
      console.log("• Đơn mẫu: đã có → bỏ qua");
    } else {
      await seedDemoOrders();
      console.log("• Đơn mẫu: xong (5 đơn: 3 hoàn tất — 1 có trả hàng, 1 huỷ, 1 chờ xác nhận)");
    }
    if (await prisma.order.findUnique({ where: { idempotencyKey: "seed-ctv-1" } })) {
      console.log("• Đơn mẫu CTV: đã có → bỏ qua");
    } else {
      await seedAffiliateOrders();
      console.log("• Đơn mẫu CTV: xong (1 hoàn tất qua link, 1 CTV tự lên)");
    }
    if (await prisma.order.findUnique({ where: { idempotencyKey: "seed-ctv-3" } })) {
      console.log("• Đơn mẫu CTV cấp dưới: đã có → bỏ qua");
    } else {
      await seedSubAffiliateOrders();
      console.log("• Đơn mẫu CTV cấp dưới: xong (LINN bán, MAUNG hưởng tầng trên)");
    }
  }
  console.log("Seed xong: 3 nhân viên, 2 CTV (2 tầng), 6 sản phẩm (1 combo), 8 lô, 4 vùng giao hàng, đơn mẫu.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
