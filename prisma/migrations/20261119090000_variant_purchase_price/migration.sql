-- Giá mua hiện tại của phân loại (19/11/2026): chỉ thêm cột, cho phép NULL — dữ liệu cũ không đổi.
ALTER TABLE "Variant" ADD COLUMN "purchasePriceVnd" INTEGER;
ALTER TABLE "Variant" ADD COLUMN "purchasePriceMmk" INTEGER;
ALTER TABLE "Variant" ADD COLUMN "purchasePriceAt" TIMESTAMP(3);
-- Giá mua không âm (0 hợp lệ — hàng tặng / mẫu).
ALTER TABLE "Variant" ADD CONSTRAINT "Variant_purchasePrice_nonneg" CHECK (("purchasePriceVnd" IS NULL OR "purchasePriceVnd" >= 0) AND ("purchasePriceMmk" IS NULL OR "purchasePriceMmk" >= 0));
