-- QT3: đặt trước khi hết hàng.
-- Trạng thái mới chưa được dùng trong migration này (Postgres không cho dùng giá trị enum vừa thêm trong cùng transaction).
ALTER TYPE "OrderStatus" ADD VALUE 'AWAITING_STOCK' BEFORE 'PENDING';

ALTER TABLE "Product" ADD COLUMN "preorderEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Variant" ADD COLUMN "preorderLimit" INTEGER;
ALTER TABLE "Order" ADD COLUMN "preorder" BOOLEAN NOT NULL DEFAULT false;
