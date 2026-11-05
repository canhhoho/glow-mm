ALTER TABLE "Batch" ADD COLUMN "estimatedCostMmk" INTEGER,
  ADD COLUMN "estimatedShipMmkPerKg" INTEGER,
  ADD COLUMN "estimatedWeightGrams" INTEGER;
ALTER TABLE "StockDocument" ADD COLUMN "estimatedShipMmkPerKg" INTEGER;
CREATE TYPE "CostStatus" AS ENUM ('ACTUAL', 'ESTIMATED', 'MISSING');
ALTER TABLE "OrderAllocation" ADD COLUMN "costStatus" "CostStatus" NOT NULL DEFAULT 'MISSING';
-- Historical zero costs cannot be distinguished from missing costs: keep them marked missing.
UPDATE "OrderAllocation" SET "costStatus" = 'ACTUAL' WHERE "unitLandedCostMmk" > 0;
-- These previews may already include inbound freight in their input cost. Recreate them.
UPDATE "PriceUpdateRun" SET "status" = 'CANCELLED'
WHERE "status" = 'PREVIEW' AND "shipMmkPerKg" IS NOT NULL;
