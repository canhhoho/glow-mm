-- Hoa hồng CTV cố định theo biến thể (MMK/cái) + mức chốt trên từng dòng đơn.
ALTER TABLE "Variant" ADD COLUMN "affiliateCommissionMmk" INTEGER;
ALTER TABLE "OrderItem" ADD COLUMN "commissionPerUnitMmk" INTEGER;

ALTER TABLE "Variant" ADD CONSTRAINT "Variant_affiliate_commission_nonnegative" CHECK ("affiliateCommissionMmk" IS NULL OR "affiliateCommissionMmk" >= 0);
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_commission_nonnegative" CHECK ("commissionPerUnitMmk" IS NULL OR "commissionPerUnitMmk" >= 0);
