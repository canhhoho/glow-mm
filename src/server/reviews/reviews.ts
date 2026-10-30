import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { Prisma, type ReviewStatus } from "@/generated/prisma/client";
import { toUnicode } from "@/lib/myanmar";
import { OrderError } from "@/server/orders/errors";
import { findOrderForCustomer } from "@/server/orders/orders";

/**
 * Đánh giá sản phẩm: chỉ khách có đơn ĐÃ HOÀN TẤT chứa sản phẩm đó (xác thực bằng mã đơn + SĐT),
 * 1 đánh giá / sản phẩm / đơn, chờ nhân viên duyệt (PENDING → APPROVED/REJECTED) mới hiện trên trang SP.
 */

/** Tag cache đánh giá đã duyệt trên trang SP (P20) — duyệt/từ chối gọi `updateTag(REVIEWS_TAG)`. */
export const REVIEWS_TAG = "reviews";

export const reviewSchema = z.object({
  productId: z.string().min(1),
  rating: z.coerce.number().int().min(1).max(5),
  body: z.string().trim().max(1000).transform(toUnicode).optional(),
});

export async function submitReview(raw: unknown, access: { code: string; phone: string }) {
  const input = reviewSchema.parse(raw);
  const order = await findOrderForCustomer(access.code, access.phone);
  if (!order) throw new OrderError("not_found", "Không tìm thấy đơn");
  if (order.status !== "COMPLETED") throw new OrderError("invalid_transition", "Chỉ đánh giá đơn đã giao xong");
  const inOrder = await prisma.orderItem.count({
    where: { orderId: order.id, variant: { productId: input.productId } },
  });
  if (inOrder === 0) throw new OrderError("not_found", "Sản phẩm không thuộc đơn này");
  try {
    return await prisma.review.create({
      data: { productId: input.productId, orderId: order.id, rating: input.rating, body: input.body || null },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new OrderError("invalid_transition", "Sản phẩm này đã được đánh giá");
    }
    throw e;
  }
}

export async function moderateReview(reviewId: string, approve: boolean, userId: string) {
  const res = await prisma.review.updateMany({
    where: { id: reviewId, status: { not: approve ? "APPROVED" : "REJECTED" } },
    data: { status: approve ? "APPROVED" : "REJECTED" },
  });
  if (res.count !== 1) throw new Error("Đánh giá không tồn tại hoặc đã ở trạng thái này");
  await prisma.auditLog.create({
    data: { userId, action: approve ? "review.approve" : "review.reject", entity: "Review", entityId: reviewId },
  });
}

/** Tên hiển thị công khai: chỉ chữ đầu của tên người nhận (không lộ họ tên đầy đủ). */
export function publicName(full: string): string {
  const first = full.trim().split(/\s+/)[0] ?? "";
  return first ? `${first} …` : "…";
}

export async function productReviews(productId: string, take = 20) {
  const [agg, rows] = await Promise.all([
    prisma.review.aggregate({ where: { productId, status: "APPROVED" }, _avg: { rating: true }, _count: true }),
    prisma.review.findMany({
      where: { productId, status: "APPROVED" },
      orderBy: { createdAt: "desc" },
      take,
      include: { order: { select: { recipientName: true } } },
    }),
  ]);
  return {
    count: agg._count,
    average: agg._avg.rating == null ? null : Math.round(agg._avg.rating * 10) / 10,
    items: rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      body: r.body,
      createdAt: r.createdAt,
      author: publicName(r.order.recipientName),
    })),
  };
}

/** Sản phẩm trong đơn (không trùng) + trạng thái đánh giá hiện có — cho trang đơn của khách. */
export async function reviewablesForOrder(orderId: string) {
  const [items, reviews] = await Promise.all([
    prisma.orderItem.findMany({
      where: { orderId },
      select: { name: true, variant: { select: { productId: true } } },
      orderBy: { id: "asc" },
    }),
    prisma.review.findMany({ where: { orderId }, select: { productId: true, status: true, rating: true } }),
  ]);
  const seen = new Set<string>();
  return items.flatMap((i) => {
    if (seen.has(i.variant.productId)) return [];
    seen.add(i.variant.productId);
    const review = reviews.find((r) => r.productId === i.variant.productId);
    return [{ productId: i.variant.productId, name: i.name, review: review ?? null }];
  });
}

export async function listReviewsAdmin(status: ReviewStatus, take = 100) {
  return prisma.review.findMany({
    where: { status },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      product: { select: { slug: true, translations: { select: { locale: true, name: true } } } },
      order: { select: { id: true, code: true, recipientName: true } },
    },
  });
}
