import "server-only";
import { z } from "zod";
import { rawId } from "@/lib/schemas";
import { prisma } from "@/lib/db";
import type { DocType, StockType } from "@/generated/prisma/client";
import { newCode } from "@/server/codes";
import { getNumberSetting } from "@/server/settings";
import { pickFefo } from "./fefo";
import { applyMoves, type StockMove, type Tx } from "./ledger";
import { vndToMmk } from "./landed-cost";
import { guardApproval } from "@/server/catalog/approval";
import { shippingMmk } from "@/server/pricing/formula";

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

/** Tạo phiếu NHÁP. RECEIVE tạo (hoặc dùng lại) lô theo (biến thể, số lô). */
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

export async function createDocument(raw: unknown, userId: string, transaction?: Tx) {
  const input = documentSchema.parse(raw);

  const run = async (tx: Tx) => {
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
    if (to?.sellable && (input.type === "RECEIVE" || input.type === "TRANSFER")) {
      const wrong = await tx.variant.findFirst({
        where: { id: { in: input.lines.map((l) => l.variantId) }, product: { stockLocationId: { not: to.id } } },
        select: { sku: true, product: { select: { stockLocation: { select: { name: true } } } } },
      });
      if (wrong) throw new DocumentError(`SKU ${wrong.sku}: sản phẩm thuộc ${wrong.product.stockLocation.name}, không nhập vào ${to.name}`);
    }

    const lines: { variantId: string; batchId: string | null; stockType: StockType; qty: number }[] = [];

    if (input.type === "RECEIVE") {
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
        const expiryStatus = l.expiryStatus ?? (variant.product.requiresExpiry ? "DATED" : "NONE");
        if (expiryStatus === "NONE" && variant.product.requiresExpiry) fail("Sản phẩm này yêu cầu quản lý hạn sử dụng");
        if (expiryStatus !== "NONE" && !variant.product.requiresExpiry) fail("Sản phẩm này không áp dụng hạn sử dụng; chọn NONE");
        if (expiryStatus === "DATED" && !l.expiryDate) fail("Cần nhập hạn sử dụng hoặc chọn Chưa biết hạn");
        if (expiryStatus !== "DATED" && l.expiryDate) fail("Chỉ nhập ngày khi đã biết hạn sử dụng");
        if (l.mfgDate && l.expiryDate && l.mfgDate > l.expiryDate) fail("Ngày sản xuất phải trước hạn sử dụng");
        // P24: loại tiền theo kho của SP — kho mua tại Myanmar (LOCAL_MMK) nhập giá MMK, kho hàng nhập VN nhập VND.
        const mmk = variant.product.stockLocation.pricingMode === "LOCAL_MMK";
        if (mmk && l.unitCostMmk === undefined) fail(`${variant.product.stockLocation.name} nhập giá mua bằng MMK`);
        if (!mmk && l.unitCostVnd === undefined) fail(`${variant.product.stockLocation.name} nhập giá mua bằng VND`);
        if (mmk && input.shipmentId) fail("Lô giá MMK không gắn chuyến hàng VN → MM");
        if (existing && (existing.shipmentId ?? null) !== (input.shipmentId ?? null)) fail(`Lô ${l.lotNo} có chuyến hàng khác. Chọn đúng chuyến hoặc dùng thao tác gắn lô trước khi lập phiếu.`);
        const unitCostVnd = l.unitCostVnd ?? null;
        const unitCostMmk = l.unitCostMmk ?? null;
        if (
          existing &&
          (existing.expiryDate?.getTime() !== l.expiryDate?.getTime() ||
            existing.expiryStatus !== expiryStatus ||
            existing.unitCostVnd !== unitCostVnd ||
            existing.unitCostMmk !== unitCostMmk ||
            (l.landedCostVnd !== undefined && existing.landedCostVnd !== l.landedCostVnd))
        ) {
          fail(`Lô ${l.lotNo} đã có với hạn dùng khác hoặc giá vốn khác`);
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
        lines.push({ variantId: l.variantId, batchId: batch.id, stockType: l.stockType, qty: l.qty });
      }
    } else {
      for (const l of input.lines) {
        if (l.batchId) await assertBatch(tx, l.batchId, l.variantId);
        lines.push({ variantId: l.variantId, batchId: l.batchId ?? null, stockType: l.stockType, qty: l.qty });
      }
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
        createdById: userId,
        lines: { create: lines },
      },
    });
    if (input.type === "RECEIVE" && input.weights?.length) await fillWeights(tx, input.weights, new Set(lines.map((l) => l.variantId)), doc.id, userId);
    return doc;
  };
  return transaction ? run(transaction) : prisma.$transaction(run);
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

/** GHI SỔ: chọn lô FEFO cho dòng chưa có lô, sinh ledger, khoá phiếu. */
export async function postDocument(documentId: string, userId: string) {
  return prisma.$transaction((tx) => postDocumentTx(tx, documentId, userId), { maxWait: 10_000, timeout: 30_000 });
}

/**
 * Ghi sổ trong transaction có sẵn (đóng gói đơn: đổi trạng thái đơn + trừ kho cùng một transaction).
 * `blockDays`: ngưỡng hạn dùng khi tự chọn lô — xuất nội bộ 0, bán hàng dùng `salesBlockDays()`.
 */
export async function postDocumentTx(tx: Tx, documentId: string, userId: string, opts: { blockDays?: number } = {}) {
  // Chuyển trạng thái nguyên tử: chỉ một request ghi sổ được.
  const claimed = await tx.stockDocument.updateMany({
    where: { id: documentId, status: "DRAFT" },
    data: { status: "POSTED", postedById: userId, postedAt: new Date() },
  });
  if (claimed.count !== 1) throw new DocumentError("Phiếu không ở trạng thái nháp");

  const doc = await tx.stockDocument.findUniqueOrThrow({ where: { id: documentId }, include: { lines: true } });
  if (doc.type === "RECEIVE" && doc.shipmentId) await tx.$queryRaw`SELECT id FROM "InboundShipment" WHERE id = ${doc.shipmentId} FOR UPDATE`;
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
  await applyMoves(tx, documentId, userId, moves);

  // Nhận hàng: gắn tỷ giá hiện hành vào lô (dùng tính giá vốn MMK).
  if (doc.type === "RECEIVE") {
    const rate = await tx.exchangeRate.findFirst({ orderBy: { effectiveAt: "desc" } });
    if (rate) {
      await tx.batch.updateMany({
        // Chỉ lô giá VND cần tỷ giá; lô MMK đã có giá vốn MMK từ lúc tạo (P24).
        where: { id: { in: resolved.map((r) => r.batchId) }, rateId: null, unitCostVnd: { not: null } },
        data: { rateId: rate.id },
      });
      // Opening stock with explicit landed cost can be valued without an inbound shipment.
      const batches = await tx.batch.findMany({ where: { id: { in: resolved.map((r) => r.batchId) }, shipmentId: null, landedCostVnd: { not: null } }, include: { rate: true } });
      for (const b of batches) {
        await tx.batch.update({ where: { id: b.id }, data: { landedCostMmk: vndToMmk(b.landedCostVnd!, b.rate ?? rate) } });
      }
      if (doc.estimatedShipMmkPerKg != null) {
        const unvalued = await tx.batch.findMany({
          where: { id: { in: resolved.map((r) => r.batchId) }, unitCostVnd: { not: null }, landedCostVnd: null, landedCostMmk: null, estimatedCostMmk: null },
          include: { rate: true, variant: { select: { weightGrams: true } } },
        });
        for (const b of unvalued) {
          const weight = b.variant.weightGrams;
          if (weight == null || weight <= 0) continue;
          const estimate = vndToMmk(b.unitCostVnd!, b.rate ?? rate) + shippingMmk(doc.estimatedShipMmkPerKg, weight);
          if (!Number.isSafeInteger(estimate) || estimate > 2_147_483_647) throw new DocumentError(`Lô ${b.lotNo}: giá vốn tạm tính vượt giới hạn`);
          await tx.batch.update({ where: { id: b.id }, data: {
            estimatedCostMmk: estimate,
            estimatedShipMmkPerKg: doc.estimatedShipMmkPerKg,
            estimatedWeightGrams: weight,
          } });
        }
      }
    }
  }

  await tx.auditLog.create({
    data: { userId, action: "stock.post", entity: "StockDocument", entityId: documentId, data: { code: doc.code } },
  });
  return doc.code;
}

export async function cancelDocument(documentId: string, userId: string) {
  const res = await prisma.stockDocument.updateMany({
    where: { id: documentId, status: "DRAFT" },
    data: { status: "CANCELLED" },
  });
  if (res.count !== 1) throw new DocumentError("Chỉ huỷ được phiếu nháp");
  await prisma.auditLog.create({
    data: { userId, action: "stock.cancel", entity: "StockDocument", entityId: documentId },
  });
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
