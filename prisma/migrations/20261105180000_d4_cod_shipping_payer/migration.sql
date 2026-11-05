CREATE TYPE "ShippingPayer" AS ENUM ('RECEIVER', 'SENDER');
ALTER TABLE "Order" ADD COLUMN "shippingPayer" "ShippingPayer" NOT NULL DEFAULT 'RECEIVER',
  ADD COLUMN "codAdjustmentMmk" INTEGER,
  ADD COLUMN "codSettlementNote" TEXT;
ALTER TABLE "Order" ADD CONSTRAINT "Order_codAdjustmentMmk_check" CHECK ("codAdjustmentMmk" IS NULL OR "codAdjustmentMmk" >= 0);
