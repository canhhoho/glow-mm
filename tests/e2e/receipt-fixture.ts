import pg from "pg";

/**
 * Phiếu NHẬP nháp dựng thẳng trong DB test (chỉ nháp — không ghi sổ, không đụng sổ kho / tồn) để kiểm trang chi tiết:
 * nhiều SP, nhiều lô cùng SKU, tester và đủ 3 trạng thái hạn (có ngày / Chưa biết / Không áp dụng — form nhập không tạo
 * được khi `FEATURES.expiry` tắt). Gọi `cleanup()` để xoá phiếu + lô vừa tạo.
 */
export const RECEIPT_SKUS = { a: "SV-SUN-50", b: "ML-TON-150" } as const;

export async function db<T>(fn: (c: pg.Client) => Promise<T>) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

type Line = { sku: string; lot: string; qty: number; stockType: "SELLABLE" | "TESTER"; expiry: string | "NONE" | "UNKNOWN"; vnd: number };

export async function createReceiptDraft(tag: string, lines: Line[]) {
  return db(async (c) => {
    const user = (await c.query(`SELECT id FROM "user" WHERE email = 'admin@glow.local'`)).rows[0].id as string;
    const variants = new Map<string, { id: string; location: string | null }>();
    for (const sku of new Set(lines.map((l) => l.sku))) {
      const r = (await c.query(`SELECT v.id, p."stockLocationId" AS location FROM "Variant" v JOIN "Product" p ON p.id = v."productId" WHERE v.sku = $1`, [sku])).rows[0];
      variants.set(sku, { id: r.id, location: r.location });
    }
    const toId = variants.get(lines[0].sku)!.location;
    if (!toId) throw new Error(`${lines[0].sku} chưa có kho bán`);
    const docId = `e2e-doc-${tag}`;
    const code = `E2E-RCV-${tag}`;
    await c.query(`INSERT INTO "StockDocument" (id, code, type, status, "toId", "createdById") VALUES ($1, $2, 'RECEIVE', 'DRAFT', $3, $4)`, [docId, code, toId, user]);
    const batchIds: string[] = [];
    for (const [i, l] of lines.entries()) {
      const variantId = variants.get(l.sku)!.id;
      const batchId = `e2e-batch-${tag}-${i}`;
      const status = l.expiry === "NONE" || l.expiry === "UNKNOWN" ? l.expiry : "DATED";
      await c.query(
        `INSERT INTO "Batch" (id, "variantId", "lotNo", "expiryDate", "expiryStatus", "unitCostVnd") VALUES ($1, $2, $3, $4, $5, $6)`,
        [batchId, variantId, `${l.lot}-${tag}`, status === "DATED" ? l.expiry : null, status, l.vnd],
      );
      batchIds.push(batchId);
      await c.query(
        `INSERT INTO "StockDocumentLine" (id, "documentId", "variantId", "batchId", "stockType", qty, "unitCostVnd") VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [`e2e-line-${tag}-${i}`, docId, variantId, batchId, l.stockType, l.qty, l.vnd],
      );
    }
    const cleanup = () =>
      db(async (k) => {
        await k.query(`DELETE FROM "StockDocument" WHERE id = $1`, [docId]); // dòng xoá theo cascade
        await k.query(`DELETE FROM "Batch" WHERE id = ANY($1)`, [batchIds]);
      });
    return { id: docId, code, cleanup };
  });
}

/** Ba nhóm: A bán được (2 lô: có ngày + chưa biết), A tester (không áp dụng), B bán được (có ngày). */
export const MIXED_LINES: Line[] = [
  { sku: RECEIPT_SKUS.a, lot: "A1", qty: 3, stockType: "SELLABLE", expiry: "2028-03-31", vnd: 95000 },
  { sku: RECEIPT_SKUS.a, lot: "A2", qty: 4, stockType: "SELLABLE", expiry: "UNKNOWN", vnd: 96000 },
  { sku: RECEIPT_SKUS.a, lot: "AT", qty: 2, stockType: "TESTER", expiry: "NONE", vnd: 0 },
  { sku: RECEIPT_SKUS.b, lot: "B1", qty: 5, stockType: "SELLABLE", expiry: "2027-12-01", vnd: 70000 },
];
