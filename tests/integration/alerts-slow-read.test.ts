import pg from "pg";
import { afterAll, expect, it } from "vitest";
import { loadVariantStock } from "@/server/alerts/queries";
import { saleFixture, unpublishTestProducts } from "./fixtures";

afterAll(unpublishTestProducts);

it("cảnh báo vẫn đọc được khi bảng tồn bận quá 5 giây, không làm dashboard lỗi giao dịch", async () => {
  const f = await saleFixture([{ lot: "SLOW", qty: 3, expiryInDays: 400 }]);
  const blocker = new pg.Client({ connectionString: process.env.DATABASE_URL });
  const observer = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await blocker.connect();
  await observer.connect();
  let read: Promise<{ rows?: Awaited<ReturnType<typeof loadVariantStock>>; error?: unknown }> | undefined;
  try {
    await blocker.query("BEGIN");
    // Chỉ DB test: mô phỏng một thao tác bảo trì giữ khóa đọc, không thay dữ liệu tồn.
    await blocker.query('LOCK TABLE "StockBalance" IN ACCESS EXCLUSIVE MODE');
    read = loadVariantStock(new Date(), { blockDays: 90, salesWindowDays: 30 }).then(rows=>({ rows }), error=>({ error }));
    const deadline = Date.now() + 10000;
    let blocked = false;
    while (Date.now() < deadline) {
      const result = await observer.query("SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%StockBalance%'");
      if (Number(result.rows[0].count) > 0) { blocked = true; break; }
      await new Promise(resolve=>setTimeout(resolve, 50));
    }
    expect(blocked).toBe(true);
    await new Promise(resolve=>setTimeout(resolve, 5500));
    await blocker.query("COMMIT");
    const result = await read;
    expect(result.error).toBeUndefined();
    expect(result.rows?.find(row=>row.variantId===f.variantId)?.available).toBe(3);
  } finally {
    await blocker.query("ROLLBACK").catch(()=>{});
    if (read) await read;
    await blocker.end();
    await observer.end();
  }
}, 30000);
