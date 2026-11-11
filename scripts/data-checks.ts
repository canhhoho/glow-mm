/**
 * D8 — Kiểm dữ liệu CHỈ ĐỌC trước các migration ràng buộc (P4) và chuyển đổi quy trình duyệt (P1-A).
 *
 * An toàn:
 * - Chỉ chạy khi có `--yes` và biến riêng `DATA_CHECKS_DATABASE_URL` (không đọc DATABASE_URL — tránh trỏ nhầm DB).
 * - Một transaction `READ ONLY`; chỉ SELECT; in số đếm + tối đa 20 mã/id mỗi mục (không in thông tin khách).
 * - Chạy trên BẢN SAO production khôi phục ở máy local (DEPLOY.md, mục restore-test), KHÔNG chạy thẳng production.
 *
 *   DATA_CHECKS_DATABASE_URL=postgres://glow:x@localhost:15432/glow_restore npx tsx scripts/data-checks.ts --yes
 *   (thêm `--json` để in JSON)
 */
import { Client } from "pg";

type Check = { group: string; key: string; title: string; sql: string };

const SAMPLE = 20;

/** Ngưỡng hạn bán lấy từ Setting `expiry.blockDays` (mặc định 90) — dùng trong các truy vấn khả dụng (xấp xỉ theo ngày). */
const ELIGIBLE_LOT = `(b."expiryStatus" = 'NONE' OR (b."expiryStatus" = 'DATED' AND b."expiryDate" >= current_date + (SELECT block_days FROM cfg)))`;
const CFG = `cfg AS (SELECT COALESCE((SELECT (value #>> '{}')::int FROM "Setting" WHERE key = 'expiry.blockDays'), 90) AS block_days)`;

const CHECKS: Check[] = [
  // ── Kho (P4: CHECK qty ≥ 0, trigger ledger chỉ ghi thêm) ──
  { group: "Kho", key: "negative_balance", title: "Dòng tồn âm (StockBalance.qty < 0)", sql: `SELECT "batchId" || '@' || "locationId" || ':' || "stockType" AS ref FROM "StockBalance" WHERE qty < 0` },
  {
    group: "Kho", key: "ledger_balance_mismatch", title: "Tổng sổ kho ≠ tồn (theo lô × kho × loại)",
    sql: `WITH l AS (SELECT "batchId", "locationId", "stockType", SUM("qtyDelta")::int AS q FROM "StockLedger" GROUP BY 1, 2, 3)
          SELECT COALESCE(l."batchId", s."batchId") || '@' || COALESCE(l."locationId", s."locationId") AS ref
          FROM l FULL JOIN "StockBalance" s USING ("batchId", "locationId", "stockType")
          WHERE COALESCE(l.q, 0) <> COALESCE(s.qty, 0)`,
  },
  { group: "Kho", key: "ledger_unposted_document", title: "Sổ kho gắn phiếu chưa ghi sổ", sql: `SELECT DISTINCT d.code AS ref FROM "StockLedger" l JOIN "StockDocument" d ON d.id = l."documentId" WHERE d.status <> 'POSTED'` },
  {
    group: "Kho", key: "reserved_exceeds_sellable", title: "Biến thể có hàng giữ vượt tồn bán được (khả dụng âm, xấp xỉ)",
    sql: `WITH ${CFG},
          stock AS (
            SELECT v.id, v.sku, COALESCE(SUM(s.qty) FILTER (WHERE s."locationId" = p."stockLocationId" AND loc.sellable AND ${ELIGIBLE_LOT}), 0) AS q
            FROM "Variant" v JOIN "Product" p ON p.id = v."productId"
            LEFT JOIN "Batch" b ON b."variantId" = v.id
            LEFT JOIN "StockBalance" s ON s."batchId" = b.id AND s."stockType" = 'SELLABLE'
            LEFT JOIN "Location" loc ON loc.id = s."locationId"
            WHERE NOT v."isBundle" GROUP BY v.id, v.sku),
          held AS (SELECT "variantId", SUM(qty) AS q FROM "Reservation" WHERE status = 'ACTIVE' AND ("expiresAt" IS NULL OR "expiresAt" > now()) GROUP BY 1)
          SELECT stock.sku AS ref FROM stock JOIN held ON held."variantId" = stock.id WHERE stock.q - held.q < 0`,
  },

  // ── Biến thể (P4: unique Variant(productId, label)) ──
  {
    group: "Biến thể", key: "duplicate_variant_label", title: "Nhãn biến thể trùng trong cùng SP",
    sql: `SELECT p.slug || ' / ' || lower(v.label) AS ref FROM "Variant" v JOIN "Product" p ON p.id = v."productId" GROUP BY p.slug, v."productId", lower(v.label) HAVING COUNT(*) > 1`,
  },
  {
    group: "Biến thể", key: "product_without_active_variant", title: "SP chưa ngừng KD mà không có biến thể đang bán",
    sql: `SELECT p.slug AS ref FROM "Product" p WHERE p."archivedAt" IS NULL AND NOT EXISTS (SELECT 1 FROM "Variant" v WHERE v."productId" = p.id AND v.active)`,
  },

  // ── Duyệt (P1-A: backfill reviewStatus / firstPublishedAt) ──
  { group: "Duyệt", key: "archived_published", title: "SP ngừng KD mà vẫn đang đăng (phải bằng 0 — D9)", sql: `SELECT slug AS ref FROM "Product" WHERE published AND "archivedAt" IS NOT NULL` },
  { group: "Duyệt", key: "published_unapproved", title: "SP đang đăng mà chưa có dấu duyệt (danh sách cho Q-A)", sql: `SELECT slug AS ref FROM "Product" WHERE published AND "approvedAt" IS NULL` },
  {
    group: "Duyệt", key: "published_without_publish_audit", title: "SP đang đăng không có nhật ký product.publish (firstPublishedAt sẽ là gần đúng)",
    sql: `SELECT p.slug AS ref FROM "Product" p WHERE p.published AND NOT EXISTS (SELECT 1 FROM "AuditLog" a WHERE a.action = 'product.publish' AND a."entityId" = p.id)`,
  },
  {
    group: "Duyệt", key: "backfill_simulation", title: "Mô phỏng backfill reviewStatus (nhóm: số SP)",
    sql: `SELECT grp || ': ' || COUNT(*) AS ref FROM (
            SELECT CASE
              WHEN "approvedAt" IS NOT NULL THEN 'APPROVED'
              WHEN published THEN 'APPROVED (hệ thống, Q-A)'
              WHEN "approvedHash" IS NOT NULL THEN 'DRAFT (từng duyệt, cần duyệt lại)'
              ELSE 'DRAFT' END AS grp
            FROM "Product" WHERE "archivedAt" IS NULL) t GROUP BY grp ORDER BY grp`,
  },

  // ── Giá ──
  {
    group: "Giá", key: "published_price_zero", title: "SKU đang bán có giá ≤ 0",
    sql: `SELECT v.sku AS ref FROM "Variant" v JOIN "Product" p ON p.id = v."productId" WHERE p.published AND v.active AND v."priceMmk" <= 0`,
  },
  {
    group: "Giá", key: "price_older_than_receipt", title: "SKU có phiếu nhập ghi sổ mới hơn lần đổi giá gần nhất",
    sql: `WITH r AS (SELECT l."variantId", MAX(d."postedAt") AS at FROM "StockDocumentLine" l JOIN "StockDocument" d ON d.id = l."documentId" WHERE d.type = 'RECEIVE' AND d.status = 'POSTED' GROUP BY 1),
          h AS (SELECT "variantId", MAX("createdAt") AS at FROM "PriceHistory" GROUP BY 1)
          SELECT v.sku AS ref FROM r JOIN "Variant" v ON v.id = r."variantId" LEFT JOIN h ON h."variantId" = r."variantId" WHERE h.at IS NULL OR r.at > h.at`,
  },

  // ── D11 (nhập lại cùng lô) ──
  {
    group: "D11", key: "lot_multiple_receipts", title: "Lô có nhiều phiếu nhập đã ghi sổ",
    sql: `SELECT b."lotNo" || ' (' || v.sku || ')' AS ref FROM "StockDocumentLine" l JOIN "StockDocument" d ON d.id = l."documentId" JOIN "Batch" b ON b.id = l."batchId" JOIN "Variant" v ON v.id = b."variantId"
          WHERE d.type = 'RECEIVE' AND d.status = 'POSTED' GROUP BY b.id, b."lotNo", v.sku HAVING COUNT(DISTINCT d.id) > 1`,
  },
  { group: "D11", key: "lot_multiple_locations", title: "Lô còn tồn ở nhiều kho", sql: `SELECT "batchId" AS ref FROM "StockBalance" WHERE qty > 0 GROUP BY 1 HAVING COUNT(DISTINCT "locationId") > 1` },
  { group: "D11", key: "lot_with_shipment", title: "Lô gắn chuyến hàng", sql: `SELECT id AS ref FROM "Batch" WHERE "shipmentId" IS NOT NULL` },
];

/** Chỉ chạy khi DB đã có migration P1-A (bảng ProductChangeRequest). */
const AFTER_P1A: Check[] = [
  {
    group: "Sau P1-A", key: "change_request_without_approval", title: "Bản đang sửa của SP chưa có bản đã duyệt / trạng thái APPROVED (sai bất biến)",
    sql: `SELECT p.slug AS ref FROM "ProductChangeRequest" c JOIN "Product" p ON p.id = c."productId" WHERE p."approvedAt" IS NULL OR p."approvalStatus" = 'APPROVED'`,
  },
  { group: "Sau P1-A", key: "open_change_requests", title: "Bản đang sửa đang mở (phải duyệt / huỷ hết trước khi rollback P1-A)", sql: `SELECT p.slug AS ref FROM "ProductChangeRequest" c JOIN "Product" p ON p.id = c."productId"` },
  { group: "Sau P1-A", key: "published_without_first_publish", title: "SP đang đăng thiếu firstPublishedAt", sql: `SELECT slug AS ref FROM "Product" WHERE published AND "firstPublishedAt" IS NULL` },
];

async function main() {
  const args = new Set(process.argv.slice(2));
  const url = process.env.DATA_CHECKS_DATABASE_URL;
  if (!args.has("--yes") || !url) {
    console.error("Cần `--yes` và biến DATA_CHECKS_DATABASE_URL trỏ tới BẢN SAO DB (không dùng DATABASE_URL). Xem đầu file.");
    process.exit(2);
  }
  const target = new URL(url);
  const client = new Client({ connectionString: url });
  await client.connect();
  const results: { group: string; key: string; title: string; count: number; sample: string[] }[] = [];
  let version = "";
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    version = (await client.query<{ version: string }>("SELECT version()")).rows[0].version;
    const hasP1a = (await client.query<{ ok: boolean }>(`SELECT to_regclass('"ProductChangeRequest"') IS NOT NULL AS ok`)).rows[0].ok;
    for (const c of [...CHECKS, ...(hasP1a ? AFTER_P1A : [])]) {
      const rows = (await client.query<{ ref: string }>(`SELECT ref FROM (${c.sql}) q ORDER BY ref`)).rows;
      results.push({ group: c.group, key: c.key, title: c.title, count: rows.length, sample: rows.slice(0, SAMPLE).map((r) => r.ref) });
    }
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.end();
  }

  if (args.has("--json")) {
    console.log(JSON.stringify({ database: `${target.hostname}:${target.port}${target.pathname}`, version, results }, null, 2));
    return;
  }
  console.log(`DB: ${target.hostname}:${target.port}${target.pathname}`);
  console.log(`PostgreSQL: ${version}\n`);
  for (const r of results) {
    console.log(`[${r.group}] ${r.title}: ${r.count}`);
    for (const s of r.sample) console.log(`    - ${s}`);
    if (r.count > r.sample.length) console.log(`    … và ${r.count - r.sample.length} mục khác`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
