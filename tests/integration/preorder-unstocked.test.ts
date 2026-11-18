import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { loadReadiness } from "@/server/catalog/readiness";
import { moveProductsToWarehouse } from "@/server/catalog/product-delete";
import { saveProduct, setProductsPublished } from "@/server/catalog/products";
import { createDocument, postDocument } from "@/server/inventory/documents";
import { createOrder } from "@/server/orders/orders";
import { preorderCapacity, preorderQueue } from "@/server/orders/preorder";
import { isoDay, makeFixture, markApproved, unpublishTestProducts } from "./fixtures";

afterAll(unpublishTestProducts);

// 18/11/2026 — kiểm tra case "SP chưa từng nhập hàng (không số lượng) → đăng bán dạng đặt trước" bằng đúng các hàm
// domain mà admin dùng (giá tự động tắt, khối lượng không chặn). Kết quả: làm được, cần gán kho trước (Đổi kho).
describe("SP chưa nhập hàng → đăng bán đặt trước", () => {
  it("tạo SP không kho → chặn NO_WAREHOUSE; gán kho + giá → đăng được; khách đặt → chờ hàng; hàng về → đủ hàng", async () => {
    const f = await makeFixture();
    const slug = `it-pre-${f.tag.toLowerCase()}`;
    const base = {
      slug,
      brandId: f.brandId,
      categoryId: f.categoryId,
      my: { name: "SP", description: "d", usage: "u" },
      en: { name: "SP", description: "d", usage: "u" },
    };
    const p = await saveProduct({ ...base, variants: [{ label: "x", sku: `PU-${f.tag}`, priceMmk: 0 }] }, f.userId);
    const v = await prisma.variant.findFirstOrThrow({ where: { productId: p.id } });
    const codes = async () => (await loadReadiness(prisma, [p.id])).get(p.id)!.errors.map((e) => e.code);

    // 1) Chưa nhập hàng = chưa có kho bán → lỗi chặn mở bán (cùng giá 0).
    expect(await codes()).toEqual(["NO_WAREHOUSE", "PRICE_ZERO"]);

    // 2) Gán kho bán trước (Danh sách SP → tick → chọn kho → Đổi kho) — không cần phiếu nhập.
    expect(await moveProductsToWarehouse([p.id], f.mm.id, f.userId)).toBe(1);
    // 3) Đặt giá bán; không khối lượng (giá tự động tắt → chỉ cảnh báo).
    await saveProduct({ ...base, id: p.id, variants: [{ id: v.id, label: "x", sku: v.sku, priceMmk: 25_000 }] }, f.userId);
    expect(await codes()).toEqual([]);

    // 4) Duyệt + bật hiển thị.
    await markApproved(p.id);
    expect(await setProductsPublished({ ids: [p.id], published: true }, f.userId)).toMatchObject({ changed: 1, blocked: [] });
    expect((await preorderCapacity(prisma, [v.id])).get(v.id)).toBeGreaterThan(0); // web hiện "Pre-order"

    // 5) Khách đặt trên web → đơn chờ hàng về, không giữ hàng.
    const order = await createOrder(
      { paymentMethod: "COD", name: "Ma Hla", phone: "+95 9 7812 3456", townshipId: "tw-YGN-WYG-KMY", addressLine: "No. 12, Bo Aung Kyaw St", items: [{ variantId: v.id, qty: 2 }] },
      { userId: null },
    );
    expect(order).toMatchObject({ status: "AWAITING_STOCK", preorder: true });

    // 6) Hàng về: phiếu nhập ghi sổ → danh sách chờ báo đủ hàng (admin bấm chuyển xử lý như đơn đặt trước thường).
    const doc = await createDocument({ type: "RECEIVE", toId: f.mm.id, lines: [{ variantId: v.id, lotNo: `L${f.tag}`, expiryDate: isoDay(400), unitCostVnd: 100_000, qty: 5 }] }, f.userId);
    await postDocument(doc.id, f.userId);
    const queue = await preorderQueue(prisma, { now: new Date(), blockDays: 90 });
    expect(queue.find((q) => q.id === order.id)).toMatchObject({ enough: true });
  });
});
