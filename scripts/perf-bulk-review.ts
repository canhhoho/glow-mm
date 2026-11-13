/**
 * Đo hiệu năng duyệt hàng loạt (kế hoạch admin P2: "1.000 SP, mỗi transaction < 5 s").
 *
 * An toàn: chỉ chạy khi có `--yes` và DATABASE_URL trỏ tới DB có tên kết thúc bằng `_perf` (DB tạm — không phải dev/prod).
 *   createdb glow_perf   (docker exec <db> psql -U glow -d glow -c "CREATE DATABASE glow_perf")
 *   DATABASE_URL=postgresql://…/glow_perf npx prisma migrate deploy
 *   DATABASE_URL=postgresql://…/glow_perf npm run perf:bulk-review -- --yes [--count 1000]
 *
 * Tạo N SP đủ điều kiện mở bán (có giá, khối lượng, đã nhập kho), rồi đo:
 *  - Gửi duyệt và Duyệt: nửa đầu gọi MỘT lần cho 500 SP (cách giao diện gửi hàng loạt), nửa sau gọi từng SP một
 *    (đo thời gian mỗi transaction). Đạt khi mọi SP thành công và mỗi SP < 5 s. Không xoá DB sau khi chạy.
 */
import "dotenv/config";
import { performance } from "node:perf_hooks";
import { prisma } from "../src/lib/db";
import { createDocument, postDocument } from "../src/server/inventory/documents";
import { reviewProducts, submitProducts } from "../src/server/catalog/review";

const LIMIT_MS = 5_000;
const args = process.argv.slice(2);
const count = Math.max(2, Number(args[args.indexOf("--count") + 1]) || 1000);

function guard() {
  const url = process.env.DATABASE_URL ?? "";
  const db = (() => { try { return new URL(url).pathname.replace(/^\//, ""); } catch { return ""; } })();
  if (!args.includes("--yes") || !db.endsWith("_perf")) {
    console.error("Cần `--yes` và DATABASE_URL trỏ tới DB tên kết thúc bằng `_perf` (DB tạm). Xem đầu file.");
    process.exit(2);
  }
  return db;
}

const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))];
const fmt = (n: number) => `${n.toFixed(0)} ms`;

async function setup() {
  const tag = Date.now().toString(36);
  const user = await prisma.user.upsert({ where: { email: "perf-runner@glow.local" }, update: {}, create: { id: "perf-runner", email: "perf-runner@glow.local", name: "Perf", role: "ADMIN" } });
  const [brand, category, loc] = await Promise.all([
    prisma.brand.create({ data: { slug: `perf-${tag}`, name: `Perf ${tag}` } }),
    prisma.category.create({ data: { slug: `perf-${tag}` } }),
    prisma.location.create({ data: { code: `PERF-${tag}`, name: `Perf ${tag}`, type: "MM_STOCK", sellable: true, pricingMode: "VN_IMPORT" } }),
  ]);
  if (!(await prisma.exchangeRate.findFirst())) await prisma.exchangeRate.create({ data: { mmkPerVnd: "0.17", createdById: user.id } });
  const slugs = Array.from({ length: count }, (_, i) => `perf-${tag}-${i}`);
  await prisma.product.createMany({ data: slugs.map((slug) => ({ slug, brandId: brand.id, categoryId: category.id, stockLocationId: loc.id, preorderEnabled: false })) });
  const products = await prisma.product.findMany({ where: { slug: { in: slugs } }, select: { id: true, slug: true } });
  await prisma.productTranslation.createMany({
    data: products.flatMap((p) => ["en", "my"].map((locale) => ({ productId: p.id, locale, name: `Perf product ${p.slug}`, searchText: p.slug }))),
  });
  await prisma.variant.createMany({ data: products.map((p) => ({ productId: p.id, sku: `${p.slug}-A`.toUpperCase(), label: "50ml", priceMmk: 10_000, weightGrams: 100 })) });
  const variants = await prisma.variant.findMany({ where: { productId: { in: products.map((p) => p.id) } }, select: { id: true, productId: true } });
  // Nhập kho đúng luồng nghiệp vụ: phiếu NHẬP (mỗi phiếu ≤ 400 dòng) → ghi sổ.
  for (let i = 0; i < variants.length; i += 400) {
    const doc = await createDocument(
      { type: "RECEIVE", toId: loc.id, lines: variants.slice(i, i + 400).map((v) => ({ variantId: v.id, lotNo: "A", expiryDate: "2030-12-31", unitCostVnd: 100_000, qty: 5 })) },
      user.id,
    );
    await postDocument(doc.id, user.id);
  }
  return { userId: user.id, ids: products.map((p) => p.id).sort() };
}

type Row = { phase: string; mode: string; n: number; failed: number; totalMs: number; perMs: number[] };

async function measure(phase: string, ids: string[], userId: string, call: (batch: string[]) => Promise<{ ok: boolean; error?: string }[]>): Promise<Row[]> {
  const half = Math.min(500, Math.floor(ids.length / 2));
  const bulk = ids.slice(0, half);
  const single = ids.slice(half);
  const rows: Row[] = [];
  let t = performance.now();
  const r1 = await call(bulk);
  rows.push({ phase, mode: `1 lần × ${bulk.length} SP`, n: bulk.length, failed: r1.filter((r) => !r.ok).length, totalMs: performance.now() - t, perMs: [] });
  const per: number[] = [];
  let failed = 0;
  t = performance.now();
  for (const id of single) {
    const s = performance.now();
    const r = await call([id]);
    per.push(performance.now() - s);
    if (!r[0]?.ok) failed++;
  }
  rows.push({ phase, mode: `từng SP × ${single.length}`, n: single.length, failed, totalMs: performance.now() - t, perMs: per });
  void userId;
  return rows;
}

async function main() {
  const db = guard();
  console.log(`DB: ${db} · ${count} SP`);
  const t0 = performance.now();
  const { userId, ids } = await setup();
  console.log(`Chuẩn bị dữ liệu: ${((performance.now() - t0) / 1000).toFixed(1)} s`);

  const rows: Row[] = [];
  rows.push(...(await measure("Gửi duyệt", ids, userId, (b) => submitProducts({ ids: b }, userId))));
  const versions = new Map((await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, approvalVersion: true } })).map((p) => [p.id, p.approvalVersion]));
  rows.push(...(await measure("Duyệt", ids, userId, (b) => reviewProducts({ decision: "approve", items: b.map((id) => ({ id, version: versions.get(id)! })) }, userId))));

  let bad = 0;
  for (const r of rows) {
    const per = r.perMs.length ? ` · mỗi SP p50 ${fmt(pct(r.perMs, 50))} p95 ${fmt(pct(r.perMs, 95))} max ${fmt(Math.max(...r.perMs))}` : ` · trung bình ${fmt(r.totalMs / r.n)}/SP`;
    console.log(`${r.phase.padEnd(10)} ${r.mode.padEnd(20)} tổng ${(r.totalMs / 1000).toFixed(1)} s${per} · lỗi ${r.failed}`);
    bad += r.failed;
    if (r.perMs.length && Math.max(...r.perMs) >= LIMIT_MS) bad++;
  }
  const approved = await prisma.product.count({ where: { id: { in: ids }, approvalStatus: "APPROVED" } });
  console.log(`Đã duyệt: ${approved}/${ids.length}`);
  console.log(bad === 0 && approved === ids.length ? `ĐẠT: mọi SP thành công, mỗi SP < ${LIMIT_MS / 1000} s` : "KHÔNG ĐẠT");
  await prisma.$disconnect();
  process.exit(bad === 0 && approved === ids.length ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.stack : e);
  await prisma.$disconnect();
  process.exit(1);
});
