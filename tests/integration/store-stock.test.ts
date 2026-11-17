import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
// Kiểm quy tắc hạn dùng → chạy với cờ hạn dùng BẬT (production đang tắt, 17/11/2026; hành vi tắt: expiry-off.test.ts).
vi.mock("@/lib/features", async (orig) => (await import("../support/expiry-on")).expiryOn(orig));
import { prisma } from "@/lib/db";
import { listStoreProducts, loadCardRows, loadProductContent, withProductStock, withStock } from "@/server/catalog/store-queries";
import { storeSlugExists } from "@/server/catalog/store-slugs";
import { createDocument, postDocument } from "@/server/inventory/documents";
import { createOrder } from "@/server/orders/orders";
import { makeFixture, orderInput, saleFixture, unpublishTestProducts } from "./fixtures";

// CI chạy integration trên DB trống (trước seed) → tự tạo SP đã đăng, có tồn.
beforeAll(async () => {
  await saleFixture([{ lot: "A", expiryInDays: 400, qty: 5 }]);
  await saleFixture([{ lot: "B", expiryInDays: 400, qty: 3 }]);
  await saleFixture([{ lot: "C", expiryInDays: 400, qty: 1 }]);
});
afterAll(unpublishTestProducts);

describe("Thẻ SP: nội dung tách khỏi tồn (P20)", () => {
  it("withStock gộp nhiều nhóm cho kết quả giống tính từng nhóm, giữ thứ tự và bỏ variantIds", async () => {
    const rows = await loadCardRows({ locale: "en", take: 20 });
    expect(rows.length).toBeGreaterThan(1);
    const half = Math.ceil(rows.length / 2);
    const groups = [rows.slice(0, half), rows.slice(half), []];

    const together = await withStock(groups);
    const separately = await Promise.all(groups.map(async (g) => (await withStock([g]))[0]));
    expect(together).toEqual(separately);
    expect(together[0].map((c) => c.slug)).toEqual(groups[0].map((r) => r.slug));
    expect(together[0][0]).not.toHaveProperty("variantIds");
  });

  it("listStoreProducts = nội dung + tồn + sắp theo giá", async () => {
    const [cards] = await withStock([await loadCardRows({ locale: "en", take: 20, sort: "price_asc" })]);
    const asc = await listStoreProducts({ locale: "en", take: 20, sort: "price_asc" });
    expect(new Set(asc.map((p) => p.slug))).toEqual(new Set(cards.map((p) => p.slug)));
    expect(asc.map((c) => c.priceMmk)).toEqual([...asc.map((c) => c.priceMmk)].sort((a, b) => a - b));
  });
});

describe("D9 — SP ngừng KD và lô khách sẽ nhận", () => {
  it("SP đã ngừng KD (dù còn cờ đăng) không hiện trên trang SP, không tra được slug, không đặt được", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 2 }]);
    const slug = `it-arch-${f.tag.toLowerCase()}`;
    await prisma.product.update({ where: { id: f.productId }, data: { slug } });
    expect(await loadProductContent(slug, "en")).not.toBeNull();
    // Ép dữ liệu bất thường (không đường ghi nào tạo ra) để kiểm lớp phòng thủ.
    await prisma.product.update({ where: { id: f.productId }, data: { archivedAt: new Date() } });
    expect(await loadProductContent(slug, "en")).toBeNull();
    expect(await storeSlugExists("p", `${slug}-x`)).toBe(false);
    await prisma.product.update({ where: { id: f.productId }, data: { slug: `${slug}-x` } });
    expect(await storeSlugExists("p", `${slug}-x`)).toBe(false);
    await expect(createOrder(orderInput(f, 1), { userId: f.userId })).rejects.toThrow();
    await prisma.product.update({ where: { id: f.productId }, data: { published: false } });
  });

  it("hạn dùng hiển thị = lô của cái tiếp theo khách đặt (bỏ qua phần đã giữ cho đơn khác)", async () => {
    const f = await saleFixture([
      { lot: "A", expiryInDays: 400, qty: 2 },
      { lot: "B", expiryInDays: 700, qty: 5 },
    ]);
    const slug = (await prisma.product.findUniqueOrThrow({ where: { id: f.productId } })).slug;
    const expiryOf = async () => (await withProductStock((await loadProductContent(slug, "en"))!)).variants[0].expiry;
    const [a, b] = await Promise.all(["A", "B"].map((lotNo) => prisma.batch.findFirstOrThrow({ where: { variantId: f.variantId, lotNo } })));
    expect(await expiryOf()).toEqual({ kind: "DATED", date: a.expiryDate });
    await createOrder(orderInput(f, 2), { userId: f.userId }); // giữ hết lô A
    expect(await expiryOf()).toEqual({ kind: "DATED", date: b.expiryDate });
  });

  it("SP không áp dụng hạn dùng → 'không hạn' thay vì để trống", async () => {
    const f = await makeFixture();
    await prisma.product.update({ where: { id: f.productId }, data: { requiresExpiry: false, published: true, approvedAt: new Date() } });
    const doc = await createDocument({ type: "RECEIVE", toId: f.mm.id, lines: [{ variantId: f.variantId, lotNo: "N", expiryStatus: "NONE", unitCostVnd: 100_000, qty: 3 }] }, f.userId);
    await postDocument(doc.id, f.userId);
    const slug = (await prisma.product.findUniqueOrThrow({ where: { id: f.productId } })).slug;
    const v = (await withProductStock((await loadProductContent(slug, "en"))!)).variants[0];
    expect(v).toMatchObject({ available: 3, expiry: { kind: "NONE" }, expiryDate: null });
  });
});
