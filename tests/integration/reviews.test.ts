import { afterAll, describe, expect, it } from "vitest";
import Rabbit from "rabbit-node";
import { prisma } from "@/lib/db";
import { createOrder } from "@/server/orders/orders";
import { transitionOrder } from "@/server/orders/transitions";
import { moderateReview, productReviews, publicName, reviewablesForOrder, submitReview } from "@/server/reviews/reviews";
import { admin, orderInput, saleFixture, unpublishTestProducts } from "./fixtures";

afterAll(unpublishTestProducts);

describe("Đánh giá sản phẩm", () => {
  it("chỉ đơn hoàn tất + đúng SĐT; 1 lần/SP/đơn; duyệt mới hiện, điểm trung bình", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 10 }]);
    const order = await createOrder(orderInput(f, 1, { name: "Ma Hla Hla" }), { userId: null });
    const access = { code: order.code, phone: "09 7812 3456" };

    await expect(submitReview({ productId: f.productId, rating: 5 }, access)).rejects.toMatchObject({
      code: "invalid_transition",
    });
    for (const step of ["confirmCod", "pack", "ship", "complete"] as const) {
      await transitionOrder(order.id, step, admin(f), step === "pack" ? { fromLocationId: f.mm.id } : { carrier: "T" });
    }

    await expect(submitReview({ productId: f.productId, rating: 5 }, { ...access, phone: "0999999999" })).rejects.toMatchObject({
      code: "not_found",
    });
    const other = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 1 }]);
    await expect(submitReview({ productId: other.productId, rating: 5 }, access)).rejects.toMatchObject({ code: "not_found" });
    await expect(submitReview({ productId: f.productId, rating: 6 }, access)).rejects.toThrow();

    // Nhận xét gõ Zawgyi → lưu Unicode.
    const review = await submitReview(
      { productId: f.productId, rating: 4, body: Rabbit.uni2zg("ကောင်းပါတယ်") },
      access,
    );
    expect(review).toMatchObject({ status: "PENDING", body: "ကောင်းပါတယ်" });
    await expect(submitReview({ productId: f.productId, rating: 5 }, access)).rejects.toMatchObject({
      code: "invalid_transition",
    });
    expect(await reviewablesForOrder(order.id)).toEqual([
      expect.objectContaining({ productId: f.productId, review: expect.objectContaining({ status: "PENDING" }) }),
    ]);

    expect((await productReviews(f.productId)).count).toBe(0);
    await moderateReview(review.id, true, f.userId);
    const shown = await productReviews(f.productId);
    expect(shown).toMatchObject({ count: 1, average: 4 });
    expect(shown.items[0]).toMatchObject({ author: "Ma …", body: "ကောင်းပါတယ်" });
    await expect(moderateReview(review.id, true, f.userId)).rejects.toThrow();

    await moderateReview(review.id, false, f.userId);
    expect((await productReviews(f.productId)).count).toBe(0);
    expect(await prisma.auditLog.count({ where: { entity: "Review", entityId: review.id } })).toBe(2);
  });

  it("tên công khai chỉ lấy chữ đầu", () => {
    expect(publicName("Ma Hla Hla")).toBe("Ma …");
    expect(publicName("  ")).toBe("…");
  });
});
