import type { Prisma } from "@/generated/prisma/client";

/**
 * D9 — SP khách thấy được: đã đăng VÀ chưa ngừng kinh doanh. Ngừng KD hiện luôn tắt `published` cùng lúc
 * (`deleteProducts`), điều kiện `archivedAt` là lớp phòng thủ thêm cho mọi truy vấn storefront / đặt đơn.
 * File riêng (không import gì từ domain) để `orders/*` dùng được mà không vòng import.
 */
export const STORE_PRODUCT = { published: true, archivedAt: null } satisfies Prisma.ProductWhereInput;
