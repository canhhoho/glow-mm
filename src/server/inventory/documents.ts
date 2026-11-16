import "server-only";
import { z } from "zod";
import { rawId } from "@/lib/schemas";
import { prisma } from "@/lib/db";
import { Prisma, type DocType, type StockType } from "@/generated/prisma/client";
import { newCode } from "@/server/codes";
import { getNumberSetting } from "@/server/settings";
import { pickFefo, sellableBatchWhere } from "./fefo";
import { baseAvailability } from "@/server/orders/availability";
import { lockVariants } from "@/server/orders/reservations";
import { applyMoves, type StockMove, type Tx } from "./ledger";
import { lotCost, lotCostMmk, type ReceiptCostLine } from "./lot-cost";
import { guardApproval } from "@/server/catalog/approval";
import { shippingMmk } from "@/server/pricing/formula";
import { latestRate } from "@/server/pricing/latest-rate";

/**
 * Phiếu kho: tạo NHÁP → GHI SỔ (POSTED, sinh ledger) hoặc HUỶ (chỉ khi còn nháp).
 * Đây là cách DUY NHẤT để thay đổi tồn kho từ giao diện.
 */

const PREFIX: Record<DocType, string> = { RECEIVE: "RC", TRANSFER: "TF", ISSUE: "IS", ADJUST: "AJ", RETURN: "RT" };

const id = rawId;
const qty = z.coerce.number().int().positive();
const stockType = z.enum(["SELLABLE", "TESTER"]).default("SELLABLE");
const day = z.preprocess((v) => v === "" || v == null ? undefined : v, z.coerce.date().optional());
const optionalMoney = z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().int().min(0).max(2_147_483_647).optional());

export const receiveSchema = z.object({
  type: z.literal("RECEIVE"),
  toId: id,
  shipmentId: id.optional(),
  estimatedShipMmkPerKg: optionalMoney,
  reason: z.string().max(500).optional(),
  lines: z
    .array(
      z
        .object({
          variantId: id,
          lotNo: z.string().trim().min(1).max(50),
          expiryDate: day,
          expiryStatus: z.enum(["DATED", "NONE", "UNKNOWN"]).optional(),
          mfgDate: day,
          /** P24: giá mua VND (kho hàng nhập VN) hoặc MMK (kho mua tại Myanmar) — đúng một. */
          unitCostVnd: optionalMoney,
          unitCostMmk: optionalMoney,
          landedCostVnd: optionalMoney,
          qty,
          stockType,
        })
        .refine((l) => (l.unitCostVnd === undefined) !== (l.unitCostMmk === undefined), { message: "Nhập giá mua bằng VND hoặc MMK", path: ["unitCostVnd"] })
        .refine((l) => l.landedCostVnd === undefined || (l.unitCostVnd !== undefined && l.landedCostVnd >= l.unitCostVnd), {
          message: "Giá vốn về kho không thể thấp hơn giá mua",
          path: ["landedCostVnd"],
        }),
    )
    .min(1)
    .max(500),
  /** QT1b (bước 2): khối lượng đo khi nhận hàng — chỉ ghi lên biến thể chưa có khối lượng. */
  weights: z.array(z.object({ variantId: id, weightGrams: z.coerce.number().int().positive().max(100_000) })).max(500).optional(),
});

export const transferSchema = z.object({
  type: z.literal("TRANSFER"),
  fromId: id,
  toId: id,
  reason: z.string().max(500).optional(),
  lines: z.array(z.object({ variantId: id, batchId: id.optional(), qty, stockType })).min(1),
});

export const issueSchema = z.object({
  type: z.literal("ISSUE"),
  fromId: id,
  reason: z.string().trim().min(1).max(500),
  lines: z.array(z.object({ variantId: id, batchId: id.optional(), qty, stockType })).min(1),
});

export const adjustSchema = z.object({
  type: z.literal("ADJUST"),
  toId: id,
  reason: z.string().trim().min(1).max(500),
  lines: z
    .array(
      z.object({
        variantId: id,
        batchId: id,
        qty: z.coerce.number().int().refine((n) => n !== 0, "Số lượng điều chỉnh khác 0"),
        stockType,
      }),
    )
    .min(1),
});

export const returnSchema = z.object({
  type: z.literal("RETURN"),
  toId: id,
  orderId: id.optional(),
  reason: z.string().trim().min(1).max(500),
  lines: z.array(z.object({ variantId: id, batchId: id, qty, stockType })).min(1),
});

export const documentSchema = z.discriminatedUnion("type", [
  receiveSchema,
  transferSchema,
  issueSchema,
  adjustSchema,
  returnSchema,
]);

export class DocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentError";
  }
}

async function assertLocation(tx: Tx, locationId: string) {
  const loc = await tx.location.findUnique({ where: { id: locationId } });
  if (!loc) throw new DocumentError("Vị trí kho không tồn tại");
  return loc;
}

async function assertBatch(tx: Tx, batchId: string, variantId: string) {
  const b = await tx.batch.findUnique({ where: { id: batchId } });
  if (!b || b.variantId !== variantId) throw new DocumentError("Lô không thuộc biến thể đã chọn");
}

/**
 * Điều chỉnh chỉ áp cho lô ĐÃ có sổ kho (đã ghi nhận nhập thật). Lô chỉ thuộc phiếu nhập nháp chưa có sổ: điều chỉnh vào
 * đó sẽ để lại lô mang giá nháp, huỷ phiếu nháp không xoá được lô, và số điều chỉnh không vào bình quân giá vốn (#4).
 */
async function assertAdjustableBatches(tx: Tx, batchIds: string[]) {
  const ids = [...new Set(batchIds)];
  if (ids.length === 0) return;
  const bad = await tx.batch.findFirst({ where: { id: { in: ids }, ledger: { none: {} } }, select: { lotNo: true, variant: { select: { sku: true } } } });
  if (bad) throw new DocumentError(`Lô ${bad.lotNo} (${bad.variant.sku}) chưa ghi nhận nhập kho — ghi sổ phiếu nhập trước khi điều chỉnh`);
}

/**
 * QT1b: ghi khối lượng nhập ở phiếu nhập lên biến thể **đang trống** (không ghi đè số đã có), audit `variant.weight`.
 * Ghi lúc lập phiếu (phiếu nháp chưa có chỗ lưu khối lượng; khối lượng là thuộc tính SP, không phụ thuộc phiếu được ghi sổ).
 */
async function fillWeights(tx: Tx, weights: { variantId: string; weightGrams: number }[], inDocument: Set<string>, documentId: string, userId: string) {
  // QT2: khối lượng thuộc dấu vân tay duyệt → SP đã duyệt được điền khối lượng thì cần duyệt lại.
  const productIds = (await tx.variant.findMany({ where: { id: { in: weights.map((w) => w.variantId) } }, select: { productId: true } })).map((v) => v.productId);
  await guardApproval(tx, productIds, userId, async () => {
    for (const w of weights) {
    if (!inDocument.has(w.variantId)) throw new DocumentError("Khối lượng chỉ nhập cho SKU có trong phiếu");
    const res = await tx.variant.updateMany({ where: { id: w.variantId, OR: [{ weightGrams: null }, { weightGrams: 0 }] }, data: { weightGrams: w.weightGrams } });
    if (res.count === 1) {
      await tx.auditLog.create({ data: { userId, action: "variant.weight", entity: "Variant", entityId: w.variantId, data: { weightGrams: w.weightGrams, documentId } } });
    }
    }
  });
}

type DocumentInput = z.infer<typeof documentSchema>;
type ReceiveInput = z.infer<typeof receiveSchema>;
type DraftLine = {
  variantId: string;
  batchId: string | null;
  stockType: StockType;
  qty: number;
  /** P1-C: giá mua / giá vốn về kho của chính lần nhập này (dòng NHẬP). */
  unitCostVnd?: number | null;
  unitCostMmk?: number | null;
  landedCostVnd?: number | null;
  /** Tỷ giá đã chốt của dòng (giữ khi sửa phiếu nháp không đổi giá — A3). */
  rateId?: string | null;
};

/**
 * Kiểm vị trí đi/đến của phiếu (kho đang dùng, đúng kho của SP với hàng vào kho bán…).
 * `assignWarehouse` (lúc ghi sổ): SP chưa có kho (chưa nhập hàng) nhận kho bán của phiếu nhập/chuyển này — khoá dòng SP
 * trước khi kiểm để hai phiếu nháp khác kho không cùng gán.
 */
async function checkLocations(tx: Tx, input: DocumentInput, opts: { assignWarehouse?: boolean } = {}) {
  const fromId = "fromId" in input ? input.fromId : undefined;
  const toId = "toId" in input ? input.toId : undefined;
  if (fromId) await assertLocation(tx, fromId); // xuất/chuyển từ kho đã ngừng dùng vẫn được (dọn tồn cũ)
  const to = toId ? await assertLocation(tx, toId) : null;
  if (to && !to.active) throw new DocumentError(`Kho ${to.name} đã ngừng dùng`);
  if (input.type === "RETURN" && to?.type !== "QUARANTINE") {
    throw new DocumentError("Hàng trả phải nhập vào vị trí Chờ kiểm tra");
  }
  if (fromId && toId && fromId === toId) throw new DocumentError("Vị trí đi và đến phải khác nhau");
  // P24: hàng vào kho bán (nhập, chuyển) phải đúng kho của SP; điều chỉnh lô đã có ở kho thì không chặn.
  // SP chưa có kho (chưa nhập hàng) nhập vào kho bán nào cũng được — kho được gán khi ghi sổ.
  if (to?.sellable && (input.type === "RECEIVE" || input.type === "TRANSFER")) {
    const variantIds = input.lines.map((l) => l.variantId);
    if (opts.assignWarehouse) {
      const productIds = [...new Set((await tx.variant.findMany({ where: { id: { in: variantIds } }, select: { productId: true } })).map((v) => v.productId))].sort();
      if (productIds.length) await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" IN (${Prisma.join(productIds)}) ORDER BY "id" FOR UPDATE`;
    }
    const wrong = await tx.variant.findFirst({
      where: { id: { in: variantIds }, product: { stockLocationId: { not: null }, NOT: { stockLocationId: to.id } } },
      select: { sku: true, product: { select: { stockLocation: { select: { name: true } } } } },
    });
    if (wrong) throw new DocumentError(`SKU ${wrong.sku}: sản phẩm thuộc ${wrong.product.stockLocation?.name ?? "kho khác"}, không nhập vào ${to.name}`);
    if (opts.assignWarehouse) {
      await tx.product.updateMany({ where: { variants: { some: { id: { in: variantIds } } }, stockLocationId: null }, data: { stockLocationId: to.id } });
    }
  }
  return { fromId, toId };
}

/** Dòng phiếu NHẬP: tạo (hoặc dùng lại) lô theo (biến thể, số lô), kiểm hạn dùng / loại tiền / chuyến hàng. */
async function buildReceiveLines(tx: Tx, input: ReceiveInput): Promise<DraftLine[]> {
  const lines: DraftLine[] = [];
  // Tải trước biến thể + lô đã có một lần (phiếu nhiều dòng không tốn 2–3 truy vấn mỗi dòng).
  const variantIds = [...new Set(input.lines.map((l) => l.variantId))];
  const variants = new Map(
    (
      await tx.variant.findMany({
        where: { id: { in: variantIds } },
        include: { product: { include: { stockLocation: { select: { pricingMode: true, name: true } } } } },
      })
    ).map((v) => [v.id, v]),
  );
  // SP chưa có kho: loại tiền theo kho nhận của phiếu (kho đó sẽ thành kho bán của SP khi ghi sổ).
  const target = await tx.location.findUnique({ where: { id: input.toId }, select: { pricingMode: true, name: true } });
  const lotKey = (variantId: string, lotNo: string) => `${variantId}\u0000${lotNo}`;
  const wanted = new Set(input.lines.map((l) => lotKey(l.variantId, l.lotNo)));
  const batches = new Map(
    (await tx.batch.findMany({ where: { variantId: { in: variantIds }, lotNo: { in: [...new Set(input.lines.map((l) => l.lotNo))] } } }))
      .filter((b) => wanted.has(lotKey(b.variantId, b.lotNo)))
      .map((b) => [lotKey(b.variantId, b.lotNo), b]),
  );
  for (const l of input.lines) {
    const variant = variants.get(l.variantId);
    if (!variant) throw new DocumentError("Biến thể không tồn tại");
    const fail = (msg: string): never => {
      throw new DocumentError(`SKU ${variant.sku}: ${msg}`);
    };
    if (variant.isBundle) fail("Không nhập kho trực tiếp cho combo — nhập từng thành phần");
    const existing = batches.get(lotKey(l.variantId, l.lotNo));
    // 16/11/2026: hạn dùng chọn theo từng lô (Có ngày / Chưa biết hạn / Không có hạn), không theo cờ của SP.
    const expiryStatus = l.expiryStatus ?? (variant.product.requiresExpiry ? "DATED" : "NONE");
    if (expiryStatus === "DATED" && !l.expiryDate) fail("Cần nhập hạn sử dụng hoặc chọn Chưa biết hạn");
    if (expiryStatus !== "DATED" && l.expiryDate) fail("Chỉ nhập ngày khi đã biết hạn sử dụng");
    if (l.mfgDate && l.expiryDate && l.mfgDate > l.expiryDate) fail("Ngày sản xuất phải trước hạn sử dụng");
    // P24: loại tiền theo kho của SP — kho mua tại Myanmar (LOCAL_MMK) nhập giá MMK, kho hàng nhập VN nhập VND.
    const loc = variant.product.stockLocation ?? target;
    const mmk = loc?.pricingMode === "LOCAL_MMK";
    if (mmk && l.unitCostMmk === undefined) fail(`${loc?.name} nhập giá mua bằng MMK`);
    if (!mmk && l.unitCostVnd === undefined) fail(`${loc?.name ?? "Kho"} nhập giá mua bằng VND`);
    if (mmk && input.shipmentId) fail("Lô giá MMK không gắn chuyến hàng VN → MM");
    if (existing && (existing.shipmentId ?? null) !== (input.shipmentId ?? null)) fail(`Lô ${l.lotNo} có chuyến hàng khác. Chọn đúng chuyến hoặc dùng thao tác gắn lô trước khi lập phiếu.`);
    const unitCostVnd = l.unitCostVnd ?? null;
    const unitCostMmk = l.unitCostMmk ?? null;
    // P1-C (D11): nhập lại cùng lô được phép với GIÁ khác (giá vốn lô = bình quân theo SL đã nhập, tính lại khi ghi sổ);
    // hạn dùng phải giữ nguyên (FEFO theo lô) và một lô chỉ có một loại tiền.
    if (existing && (existing.unitCostVnd == null) !== (unitCostVnd == null)) fail(`Lô ${l.lotNo} đã có giá mua bằng loại tiền khác (VND / MMK)`);
    if (existing && (existing.expiryDate?.getTime() !== l.expiryDate?.getTime() || existing.expiryStatus !== expiryStatus)) {
      fail(`Lô ${l.lotNo} đã có với hạn dùng khác`);
    }
    const batch =
      existing ??
      (await tx.batch.create({
        data: {
          variantId: l.variantId,
          lotNo: l.lotNo,
          expiryDate: l.expiryDate,
          expiryStatus,
          landedCostVnd: l.landedCostVnd,
          mfgDate: l.mfgDate,
          unitCostVnd,
          unitCostMmk,
          // Lô MMK: giá vốn MMK có ngay (không tỷ giá, không phân bổ chuyến) → báo cáo lãi, giá vốn đơn chạy sẵn.
          landedCostMmk: unitCostMmk,
          shipmentId: input.shipmentId,
        },
      }));
    batches.set(lotKey(l.variantId, l.lotNo), batch); // dòng sau cùng (SKU, lô) dùng lại lô này
    lines.push({
      variantId: l.variantId,
      batchId: batch.id,
      stockType: l.stockType,
      qty: l.qty,
      unitCostVnd,
      unitCostMmk,
      landedCostVnd: input.shipmentId ? null : (l.landedCostVnd ?? null),
    });
  }
  return lines;
}

const idempotencyKeySchema = z.string().trim().min(8).max(100).optional();
const idempotencyKeyOf = (raw: unknown) =>
  idempotencyKeySchema.parse(raw && typeof raw === "object" ? (raw as { idempotencyKey?: unknown }).idempotencyKey : undefined);

/**
 * Tạo phiếu NHÁP. RECEIVE tạo (hoặc dùng lại) lô theo (biến thể, số lô).
 * `idempotencyKey` (mỗi lần mở form một khoá): gửi lại cùng form (bấm 2 lần, mạng chậm) → trả phiếu đã tạo, không tạo thêm.
 */
export async function createDocument(raw: unknown, userId: string, transaction?: Tx) {
  const input = documentSchema.parse(raw);
  const idempotencyKey = idempotencyKeyOf(raw);
  const db = transaction ?? prisma;
  if (idempotencyKey) {
    const existing = await db.stockDocument.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;
  }

  const run = async (tx: Tx) => {
    const { fromId, toId } = await checkLocations(tx, input);
    const lines: DraftLine[] = [];
    if (input.type === "RECEIVE") lines.push(...(await buildReceiveLines(tx, input)));
    else {
      for (const l of input.lines) {
        if (l.batchId) await assertBatch(tx, l.batchId, l.variantId);
        lines.push({ variantId: l.variantId, batchId: l.batchId ?? null, stockType: l.stockType, qty: l.qty });
      }
      if (input.type === "ADJUST") await assertAdjustableBatches(tx, lines.flatMap((l) => (l.batchId ? [l.batchId] : [])));
    }

    const doc = await tx.stockDocument.create({
      data: {
        code: newCode(PREFIX[input.type]),
        type: input.type,
        status: "DRAFT",
        fromId,
        toId,
        shipmentId: input.type === "RECEIVE" ? input.shipmentId : undefined,
        orderId: input.type === "RETURN" ? input.orderId : undefined,
        reason: input.reason,
        estimatedShipMmkPerKg: input.type === "RECEIVE" ? input.estimatedShipMmkPerKg : undefined,
        idempotencyKey,
        createdById: userId,
        lines: { create: lines },
      },
    });
    if (input.type === "RECEIVE" && input.weights?.length) await fillWeights(tx, input.weights, new Set(lines.map((l) => l.variantId)), doc.id, userId);
    return doc;
  };
  try {
    return await (transaction ? run(transaction) : prisma.$transaction(run));
  } catch (e) {
    // Hai request cùng khoá chạy song song: request thua trả về phiếu đã tạo.
    if (idempotencyKey && !transaction && e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const existing = await prisma.stockDocument.findUnique({ where: { idempotencyKey } });
      if (existing) return existing;
    }
    throw e;
  }
}

/**
 * Bỏ lô khỏi các dòng của phiếu nháp và xoá lô nào chỉ phiếu này dùng (chưa có sổ kho / tồn / dòng phiếu khác /
 * phân bổ đơn / phiếu soạn / dòng tính giá). Dùng khi huỷ hoặc sửa phiếu nháp — lô nháp không chặn nhập lại cùng số lô.
 */
export async function releaseDraftBatches(tx: Tx, documentId: string) {
  const lines = await tx.stockDocumentLine.findMany({ where: { documentId, batchId: { not: null } }, select: { batchId: true } });
  const batchIds = [...new Set(lines.map((l) => l.batchId!))];
  if (batchIds.length === 0) return 0;
  await tx.stockDocumentLine.updateMany({ where: { documentId }, data: { batchId: null } });
  const orphan = await tx.batch.findMany({
    where: {
      id: { in: batchIds },
      ledger: { none: {} },
      balances: { none: {} },
      documentLines: { none: {} },
      allocations: { none: {} },
      pickLines: { none: {} },
      priceRunLines: { none: {} },
    },
    select: { id: true },
  });
  if (orphan.length) await tx.batch.deleteMany({ where: { id: { in: orphan.map((b) => b.id) } } });
  return orphan.length;
}

/**
 * Sửa phiếu NHẬP đang nháp: thay toàn bộ dòng (lô cũ chỉ phiếu này dùng bị xoá), kho / chuyến / lý do / cước tạm.
 * Khối lượng điền như lúc tạo (chỉ biến thể đang trống).
 */
export async function updateReceiveDraft(documentId: string, raw: unknown, userId: string) {
  const input = receiveSchema.parse(raw);
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "StockDocument" WHERE "id" = ${documentId} FOR UPDATE`;
      const doc = await tx.stockDocument.findUnique({ where: { id: documentId }, select: { id: true, type: true, status: true } });
      if (!doc) throw new DocumentError("Không tìm thấy phiếu");
      if (doc.type !== "RECEIVE" || doc.status !== "DRAFT") throw new DocumentError("Chỉ sửa được phiếu nhập đang nháp");
      const { toId } = await checkLocations(tx, input);
      // A3 16/11: dòng không đổi (cùng biến thể, lô, loại tồn, giá mua) giữ tỷ giá đã chốt (vd nhập Excel); dòng đổi giá
      // thì chốt lại lúc ghi sổ. Giá mua + phí về kho lấy từ form (trang sửa điền giá của chính dòng).
      const before = await tx.stockDocumentLine.findMany({ where: { documentId: doc.id }, select: { variantId: true, stockType: true, unitCostVnd: true, rateId: true, batch: { select: { lotNo: true } } } });
      const lockedRate = new Map(before.flatMap((l) => (l.rateId && l.unitCostVnd != null && l.batch ? [[`${l.variantId}|${l.batch.lotNo}|${l.stockType}|${l.unitCostVnd}`, l.rateId] as const] : [])));
      await releaseDraftBatches(tx, doc.id);
      await tx.stockDocumentLine.deleteMany({ where: { documentId: doc.id } });
      const lines = (await buildReceiveLines(tx, input)).map((l, i) => {
        const src = input.lines[i];
        const rateId = src.unitCostVnd != null ? lockedRate.get(`${src.variantId}|${src.lotNo}|${src.stockType}|${src.unitCostVnd}`) : undefined;
        return rateId ? { ...l, rateId } : l;
      });
      const updated = await tx.stockDocument.update({
        where: { id: doc.id },
        data: {
          toId,
          shipmentId: input.shipmentId ?? null,
          reason: input.reason ?? null,
          estimatedShipMmkPerKg: input.estimatedShipMmkPerKg ?? null,
          lines: { create: lines },
        },
      });
      if (input.weights?.length) await fillWeights(tx, input.weights, new Set(lines.map((l) => l.variantId)), doc.id, userId);
      await tx.auditLog.create({ data: { userId, action: "stock.update", entity: "StockDocument", entityId: doc.id, data: { lines: lines.length } } });
      return updated;
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
}

/** Tồn khả dụng theo lô của một biến thể tại một vị trí (dùng cho FEFO). */
export async function candidatesAt(tx: Tx, variantId: string, locationId: string, stockType: StockType) {
  const balances = await tx.stockBalance.findMany({
    where: { locationId, stockType, qty: { gt: 0 }, batch: { variantId } },
    include: { batch: true },
  });
  return balances.map((b) => ({
    batchId: b.batchId,
    expiryDate: b.batch.expiryDate,
    expiryStatus: b.batch.expiryStatus,
    receivedAt: b.batch.createdAt,
    available: b.qty,
  }));
}

/**
 * P0-C1 (D2): phiếu làm giảm tồn **bán được** (SELLABLE, lô đủ hạn bán, tại kho bán của SP) chỉ được lấy phần
 * chưa giữ cho đơn: khả dụng sau phiếu (= tồn bán được − giữ hàng ACTIVE) không được âm. Không có vượt chặn —
 * muốn xuất phần đang giữ (vd. hàng hỏng) thì xử lý đơn trước. Lô hết hạn / chưa biết hạn không nằm trong
 * khả dụng nên vẫn xuất được. Khoá Variant trước (cùng thứ tự `assertAvailable`), `applyMoves` khoá tồn sau.
 */
async function assertKeepsReservations(tx: Tx, moves: StockMove[], now: Date) {
  const sellable = moves.filter((m) => m.stockType === "SELLABLE");
  if (!sellable.some((m) => m.qtyDelta < 0)) return;
  const blockDays = await salesBlockDays();
  const batchIds = [...new Set(sellable.map((m) => m.batchId))];
  // Tuần tự (không Promise.all) — cùng một kết nối của interactive transaction.
  const batches = await tx.batch.findMany({ where: { id: { in: batchIds } }, select: { id: true, variantId: true, variant: { select: { sku: true, product: { select: { stockLocationId: true } } } } } });
  const eligible = await tx.batch.findMany({ where: { id: { in: batchIds }, ...sellableBatchWhere(now, blockDays) }, select: { id: true } });
  const saleLocations = await tx.location.findMany({ where: { id: { in: [...new Set(sellable.map((m) => m.locationId))] }, sellable: true }, select: { id: true } });
  const batchById = new Map(batches.map((b) => [b.id, b]));
  const eligibleIds = new Set(eligible.map((b) => b.id));
  const sellableLoc = new Set(saleLocations.map((l) => l.id));
  // Thay đổi ròng của tồn bán được theo biến thể (phiếu điều chỉnh có thể vừa cộng vừa trừ).
  const net = new Map<string, number>();
  const sku = new Map<string, string>();
  for (const m of sellable) {
    const b = batchById.get(m.batchId);
    if (!b || !eligibleIds.has(m.batchId) || !sellableLoc.has(m.locationId) || m.locationId !== b.variant.product.stockLocationId) continue;
    net.set(b.variantId, (net.get(b.variantId) ?? 0) + m.qtyDelta);
    sku.set(b.variantId, b.variant.sku);
  }
  const reducing = [...net].filter(([, d]) => d < 0).map(([id]) => id);
  if (reducing.length === 0) return;
  await lockVariants(tx, reducing);
  const before = await baseAvailability(tx, reducing, { now, blockDays });
  const short = reducing.filter((id) => (before.get(id) ?? 0) + net.get(id)! < 0);
  if (short.length === 0) return;
  const holds = await tx.reservation.findMany({
    where: { variantId: { in: short }, status: "ACTIVE", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    select: { variantId: true, order: { select: { code: true } } },
    orderBy: { createdAt: "asc" },
  });
  const parts = short.map((id) => {
    const codes = [...new Set(holds.filter((h) => h.variantId === id).map((h) => h.order.code))];
    const shown = codes.slice(0, 5).join(", ") + (codes.length > 5 ? ` (+${codes.length - 5})` : "");
    return `${sku.get(id)}: chỉ xuất được ${Math.max(0, before.get(id) ?? 0)}, còn lại đang giữ cho đơn ${shown}`;
  });
  throw new DocumentError(`Không thể lấy hàng đang giữ cho đơn — ${parts.join("; ")}. Xử lý các đơn này trước (huỷ hoặc chờ hàng) rồi lập lại phiếu.`);
}

/** GHI SỔ: chọn lô FEFO cho dòng chưa có lô, sinh ledger, khoá phiếu. */
export async function postDocument(documentId: string, userId: string) {
  return prisma.$transaction((tx) => postDocumentTx(tx, documentId, userId), { maxWait: 10_000, timeout: 30_000 });
}

/**
 * Ghi sổ trong transaction có sẵn (đóng gói đơn: đổi trạng thái đơn + trừ kho cùng một transaction).
 * `blockDays`: ngưỡng hạn dùng khi tự chọn lô — xuất nội bộ 0, bán hàng dùng `salesBlockDays()`.
 */
/**
 * P1-C (D11) — sau khi ghi sổ phiếu NHẬP: giá vốn mỗi lô chạm tới = bình quân theo SL đã nhập của MỌI dòng NHẬP đã ghi sổ
 * của lô (`lot-cost.ts`). Một lần nhập → giữ đúng giá dòng như trước. Lô thuộc chuyến hàng: giá vốn về kho do phân bổ chuyến
 * quyết định (phân bổ báo "cũ" khi SL đổi) nên không đụng ở đây. Giá vốn tạm tính được tính lại theo giá bình quân mới.
 */
async function refreshReceivedLots(tx: Tx, doc: { id: string; estimatedShipMmkPerKg: number | null }, batchIds: string[]) {
  const ids = [...new Set(batchIds)].sort();
  if (ids.length === 0) return;
  const rate = await latestRate(tx);
  // Tỷ giá riêng của lần nhập này (Excel đã ghim tỷ giá người dùng xem thì giữ nguyên).
  if (rate) await tx.stockDocumentLine.updateMany({ where: { documentId: doc.id, rateId: null, unitCostVnd: { not: null } }, data: { rateId: rate.id } });
  await tx.$queryRaw`SELECT "id" FROM "Batch" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`;
  const batches = await tx.batch.findMany({ where: { id: { in: ids } }, include: { rate: true, variant: { select: { weightGrams: true } } } });
  const posted = await tx.stockDocumentLine.findMany({
    where: { batchId: { in: ids }, qty: { gt: 0 }, document: { type: "RECEIVE", status: "POSTED" } },
    include: { rate: true },
    orderBy: [{ document: { postedAt: "asc" } }, { id: "asc" }],
  });
  for (const b of batches) {
    const lines: ReceiptCostLine[] = posted
      .filter((l) => l.batchId === b.id && (l.unitCostVnd != null || l.unitCostMmk != null))
      .map((l) => ({ qty: l.qty, unitCostVnd: l.unitCostVnd, unitCostMmk: l.unitCostMmk, landedCostVnd: l.landedCostVnd, rateId: l.rateId, rate: l.rate }));
    if (lines.length === 0) continue;
    const cost = lotCost(lines);
    const data: Prisma.BatchUncheckedUpdateInput = {};
    if (cost.unitCostVnd != null) data.unitCostVnd = cost.unitCostVnd;
    if (cost.unitCostMmk != null) {
      data.unitCostMmk = cost.unitCostMmk;
      data.landedCostMmk = cost.unitCostMmk; // lô mua tại Myanmar: giá vốn MMK = giá mua
    }
    const batchRateId = b.rateId ?? lines.find((l) => l.rateId)?.rateId ?? null;
    if (batchRateId && b.rateId == null && cost.unitCostVnd != null) data.rateId = batchRateId;
    const fallbackRate = b.rate ?? rate;
    let landedVnd = b.landedCostVnd;
    let landedMmk = b.landedCostMmk;
    if (cost.unitCostVnd != null && b.shipmentId == null) {
      if (cost.landedCostVnd != null) {
        // Giá vốn về kho nhập tay (Excel `inbound_unit_vnd`): bình quân theo SL, đổi sang MMK theo tỷ giá từng lần nhập.
        landedVnd = cost.landedCostVnd;
        landedMmk = lotCostMmk(lines.map((l) => ({ ...l, unitCostVnd: l.landedCostVnd })), cost.landedCostVnd, fallbackRate);
        data.landedCostVnd = landedVnd;
        if (landedMmk != null) data.landedCostMmk = landedMmk;
      } else if (b.landedCostVnd != null) {
        // Có lần nhập sau không kèm giá vốn về kho → chưa đủ dữ liệu, bỏ giá vốn cũ (sẽ dùng giá tạm tính).
        landedVnd = null;
        landedMmk = null;
        data.landedCostVnd = null;
        data.landedCostMmk = null;
      }
    }
    // Giá vốn tạm tính (chỉ khi chưa có giá vốn thực tế): tính lại theo giá bình quân mới.
    const shipPerKg = doc.estimatedShipMmkPerKg ?? b.estimatedShipMmkPerKg;
    const weight = b.variant.weightGrams ?? b.estimatedWeightGrams;
    if (cost.unitCostVnd != null && landedVnd == null && landedMmk == null && shipPerKg != null && weight != null && weight > 0 && (doc.estimatedShipMmkPerKg != null || b.estimatedCostMmk != null)) {
      const mmk = lotCostMmk(lines, cost.unitCostVnd, fallbackRate);
      if (mmk != null) {
        const estimate = mmk + shippingMmk(shipPerKg, weight);
        if (!Number.isSafeInteger(estimate) || estimate > 2_147_483_647) throw new DocumentError(`Lô ${b.lotNo}: giá vốn tạm tính vượt giới hạn`);
        data.estimatedCostMmk = estimate;
        data.estimatedShipMmkPerKg = shipPerKg;
        data.estimatedWeightGrams = weight;
      }
    }
    if (Object.keys(data).length) await tx.batch.update({ where: { id: b.id }, data });
  }
}

export async function postDocumentTx(tx: Tx, documentId: string, userId: string, opts: { blockDays?: number } = {}) {
  // Chuyển trạng thái nguyên tử: chỉ một request ghi sổ được.
  const claimed = await tx.stockDocument.updateMany({
    where: { id: documentId, status: "DRAFT" },
    data: { status: "POSTED", postedById: userId, postedAt: new Date() },
  });
  if (claimed.count !== 1) throw new DocumentError("Phiếu không ở trạng thái nháp");

  const doc = await tx.stockDocument.findUniqueOrThrow({ where: { id: documentId }, include: { lines: true } });
  if (doc.type === "RECEIVE" && doc.shipmentId) await tx.$queryRaw`SELECT id FROM "InboundShipment" WHERE id = ${doc.shipmentId} FOR UPDATE`;
  // P1-B (M3): phiếu thủ công có thể nằm nháp lâu — kiểm lại kho (đã ngừng dùng?) và kho của SP lúc ghi sổ.
  if (!doc.orderId) {
    await checkLocations(tx, {
      type: doc.type,
      ...(doc.fromId && { fromId: doc.fromId }),
      ...(doc.toId && { toId: doc.toId }),
      lines: doc.lines.map((l) => ({ variantId: l.variantId })),
    } as unknown as DocumentInput, { assignWarehouse: true });
  }
  const today = new Date();

  // Dòng chưa chọn lô (chuyển/xuất) → FEFO tại vị trí đi. Xuất nội bộ mặc định dùng cả lô cận hạn (blockDays = 0).
  const resolved: { variantId: string; batchId: string; stockType: StockType; qty: number }[] = [];
  for (const line of doc.lines) {
    if (line.batchId) {
      resolved.push({ ...line, batchId: line.batchId });
      continue;
    }
    if (!doc.fromId) throw new DocumentError("Thiếu vị trí xuất");
    const picks = pickFefo(await candidatesAt(tx, line.variantId, doc.fromId, line.stockType), line.qty, {
      today,
      blockDays: opts.blockDays ?? 0,
    });
    await tx.stockDocumentLine.delete({ where: { id: line.id } });
    for (const p of picks) {
      await tx.stockDocumentLine.create({
        data: { documentId, variantId: line.variantId, batchId: p.batchId, stockType: line.stockType, qty: p.qty },
      });
      resolved.push({ variantId: line.variantId, batchId: p.batchId, stockType: line.stockType, qty: p.qty });
    }
  }

  // Kiểm lại lúc ghi sổ: phiếu điều chỉnh nháp tạo trước khi có chặn vẫn không được ghi vào lô chưa có sổ kho.
  if (doc.type === "ADJUST") await assertAdjustableBatches(tx, resolved.map((r) => r.batchId));

  const moves: StockMove[] = [];
  for (const l of resolved) {
    const base = { batchId: l.batchId, stockType: l.stockType };
    switch (doc.type) {
      case "RECEIVE":
      case "RETURN":
        moves.push({ ...base, locationId: doc.toId!, qtyDelta: l.qty });
        break;
      case "TRANSFER":
        moves.push({ ...base, locationId: doc.fromId!, qtyDelta: -l.qty });
        moves.push({ ...base, locationId: doc.toId!, qtyDelta: l.qty });
        break;
      case "ISSUE":
        moves.push({ ...base, locationId: doc.fromId!, qtyDelta: -l.qty });
        break;
      case "ADJUST":
        moves.push({ ...base, locationId: doc.toId!, qtyDelta: l.qty });
        break;
    }
  }
  // P1-B (M3): không chuyển lô hết hạn / chưa biết hạn VÀO kho bán (chọn lô tay bỏ qua FEFO). Xuất huỷ hoặc chuyển
  // sang khu chờ kiểm tra vẫn được.
  if (doc.type === "TRANSFER" && doc.toId) {
    const to = await tx.location.findUnique({ where: { id: doc.toId }, select: { sellable: true, name: true } });
    if (to?.sellable) {
      const bad = await tx.batch.findFirst({
        where: { id: { in: resolved.map((r) => r.batchId) }, OR: [{ expiryStatus: "UNKNOWN" }, { expiryStatus: "DATED", expiryDate: { lt: today } }] },
        select: { lotNo: true, variant: { select: { sku: true } } },
      });
      if (bad) throw new DocumentError(`Lô ${bad.lotNo} (${bad.variant.sku}) hết hạn hoặc chưa biết hạn — không chuyển vào kho bán ${to.name}`);
    }
  }
  // P0-C1: phiếu thủ công (không gắn đơn) không được lấy phần hàng đang giữ cho đơn. Phiếu xuất của đơn
  // (`orderId`) tiêu thụ chính phần giữ của đơn đó nên không kiểm ở đây.
  if (!doc.orderId) await assertKeepsReservations(tx, moves, today);
  await applyMoves(tx, documentId, userId, moves);

  // Nhận hàng: ghim tỷ giá vào dòng và tính lại giá vốn lô = bình quân theo SL đã nhập (P1-C, D11).
  if (doc.type === "RECEIVE") await refreshReceivedLots(tx, doc, resolved.map((r) => r.batchId));

  await tx.auditLog.create({
    data: { userId, action: "stock.post", entity: "StockDocument", entityId: documentId, data: { code: doc.code } },
  });
  return doc.code;
}

/**
 * Phiếu kho do HỆ THỐNG lập theo đơn (R6): xuất khi bàn giao (ISSUE, `orders/transitions.ts`) và nhập hàng trả
 * (RETURN, `orders/returns.ts`). Lô đã chọn sẵn (FEFO / phiếu soạn / đúng lô đã xuất); tạo nháp rồi ghi sổ ngay qua
 * `postDocumentTx` trong transaction của đơn. Cố ý KHÔNG qua `createDocument`/`documentSchema`: form không được gắn
 * `orderId` vào phiếu xuất (phiếu của đơn tiêu thụ chính phần giữ hàng của đơn nên bỏ qua `assertKeepsReservations`).
 * Người gọi tự kiểm vị trí (kho bán / khu chờ kiểm tra) và quyền.
 */
export async function postOrderDocumentTx(
  tx: Tx,
  input: { type: "ISSUE" | "RETURN"; orderId: string; locationId: string; reason: string; lines: { variantId: string; batchId: string; qty: number }[] },
  userId: string,
  opts: { now?: Date } = {},
) {
  if (input.lines.length === 0) throw new DocumentError("Phiếu không có dòng");
  if (input.lines.some((l) => !Number.isInteger(l.qty) || l.qty <= 0)) throw new DocumentError("Số lượng phải lớn hơn 0");
  const doc = await tx.stockDocument.create({
    data: {
      code: newCode(PREFIX[input.type], opts.now),
      type: input.type,
      status: "DRAFT",
      ...(input.type === "ISSUE" ? { fromId: input.locationId } : { toId: input.locationId }),
      orderId: input.orderId,
      reason: input.reason,
      createdById: userId,
      lines: { create: input.lines.map((l) => ({ ...l, stockType: "SELLABLE" as const })) },
    },
  });
  await postDocumentTx(tx, doc.id, userId);
  return doc;
}

/**
 * Huỷ phiếu nháp: giữ phiếu "Đã huỷ" để tra cứu, xoá lô chỉ phiếu này tạo ra (nhập lại cùng số lô được)
 * và trả lại khối lượng phiếu này đã điền (nếu chưa ai sửa khác đi).
 */
export async function cancelDocument(documentId: string, userId: string) {
  await prisma.$transaction((tx) => cancelDocumentTx(tx, documentId, userId));
}

export async function cancelDocumentTx(tx: Tx, documentId: string, userId: string, extra: Record<string, unknown> = {}) {
  const res = await tx.stockDocument.updateMany({ where: { id: documentId, status: "DRAFT" }, data: { status: "CANCELLED" } });
  if (res.count !== 1) throw new DocumentError("Chỉ huỷ được phiếu nháp");
  const batches = await releaseDraftBatches(tx, documentId);
  const weights = await revertDraftWeights(tx, documentId, userId);
  await tx.auditLog.create({
    data: { userId, action: "stock.cancel", entity: "StockDocument", entityId: documentId, data: { batchesRemoved: batches, weightsReverted: weights, ...extra } },
  });
}

/**
 * "Huỷ và tạo lại" phiếu NHÁP Xuất / Chuyển / Điều chỉnh (#5): các phiếu này không có trang sửa. Tạo phiếu mới bằng
 * `createDocument` (cùng kiểm tra như lúc tạo) rồi huỷ phiếu cũ — MỘT transaction, lỗi ở đâu cũng không mất phiếu cũ.
 * Phiếu cũ phải còn nháp và cùng loại với phiếu mới; phiếu Nhập sửa trực tiếp (`updateReceiveDraft`) nên không dùng đường này.
 * Gửi lại cùng `idempotencyKey` (mạng chậm) → trả phiếu mới đã tạo, không huỷ lần hai.
 */
export async function replaceDraftDocument(oldId: string, raw: unknown, userId: string) {
  const key = idempotencyKeyOf(raw);
  return prisma.$transaction(
    async (tx) => {
      if (key) {
        const done = await tx.stockDocument.findUnique({ where: { idempotencyKey: key } });
        if (done) return done;
      }
      const old = await tx.stockDocument.findUnique({ where: { id: oldId }, select: { code: true, type: true, status: true } });
      if (!old) throw new DocumentError("Không tìm thấy phiếu cần thay");
      if (old.type === "RECEIVE") throw new DocumentError("Phiếu nhập nháp sửa trực tiếp, không dùng huỷ và tạo lại");
      if (old.status !== "DRAFT") throw new DocumentError("Chỉ thay được phiếu nháp");
      const created = await createDocument(raw, userId, tx);
      if (created.type !== old.type) throw new DocumentError("Phiếu mới phải cùng loại với phiếu bị thay");
      await cancelDocumentTx(tx, oldId, userId, { replacedBy: created.code });
      return created;
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
}

/** Khối lượng do phiếu (nháp) điền (`variant.weight` + documentId) mà vẫn còn nguyên giá trị đó → đặt lại trống. */
async function revertDraftWeights(tx: Tx, documentId: string, userId: string) {
  const logs = await tx.auditLog.findMany({
    where: { action: "variant.weight", entity: "Variant", data: { path: ["documentId"], equals: documentId } },
    select: { entityId: true, data: true },
  });
  const filled = logs.flatMap((l) => {
    const grams = (l.data as { weightGrams?: unknown } | null)?.weightGrams;
    return l.entityId && typeof grams === "number" ? [{ variantId: l.entityId, grams }] : [];
  });
  if (filled.length === 0) return 0;
  const productIds = (await tx.variant.findMany({ where: { id: { in: filled.map((f) => f.variantId) } }, select: { productId: true } })).map((v) => v.productId);
  let reverted = 0;
  await guardApproval(tx, productIds, userId, async () => {
    for (const f of filled) {
      const res = await tx.variant.updateMany({ where: { id: f.variantId, weightGrams: f.grams }, data: { weightGrams: null } });
      if (res.count === 1) {
        reverted++;
        await tx.auditLog.create({ data: { userId, action: "variant.weight.revert", entity: "Variant", entityId: f.variantId, data: { weightGrams: f.grams, documentId } } });
      }
    }
  });
  return reverted;
}

/** Ngưỡng hạn dùng cho bán hàng (dùng ở P2). */
export async function salesBlockDays() {
  return getNumberSetting("expiry.blockDays");
}

/** Resolve an unknown date after checking packaging; posted stock ledger stays intact. */
export async function resolveBatchExpiry(raw: unknown, userId: string) {
  const input = z.object({ batchId: rawId, expiryDate: z.iso.date() }).parse(raw);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Batch" WHERE "id" = ${input.batchId} FOR UPDATE`;
    const batch = await tx.batch.findUniqueOrThrow({ where: { id: input.batchId } });
    if (batch.expiryStatus !== "UNKNOWN") throw new DocumentError("Chỉ cập nhật hạn cho lô đang Chưa biết hạn");
    const expiryDate = new Date(input.expiryDate);
    if (batch.mfgDate && batch.mfgDate > expiryDate) throw new DocumentError("Hạn sử dụng phải sau ngày sản xuất");
    await tx.batch.update({ where: { id: batch.id }, data: { expiryDate, expiryStatus: "DATED" } });
    await tx.auditLog.create({ data: { userId, action: "batch.resolve-expiry", entity: "Batch", entityId: batch.id, data: { expiryDate: input.expiryDate } } });
  });
}
