CREATE TYPE "ExpiryStatus" AS ENUM ('DATED', 'NONE', 'UNKNOWN');
ALTER TABLE "Product" ADD COLUMN "requiresExpiry" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Product" ADD COLUMN "paoMonths" INTEGER;
ALTER TABLE "Batch" ALTER COLUMN "expiryDate" DROP NOT NULL;
ALTER TABLE "Batch" ADD COLUMN "expiryStatus" "ExpiryStatus" NOT NULL DEFAULT 'DATED';
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_expiry_consistent" CHECK (
  ("expiryStatus" = 'DATED' AND "expiryDate" IS NOT NULL) OR
  ("expiryStatus" IN ('NONE', 'UNKNOWN') AND "expiryDate" IS NULL)
);
CREATE TABLE "CatalogOpeningImport" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userId" TEXT NOT NULL,
  "result" JSONB NOT NULL
);
ALTER TABLE "Order" ADD COLUMN "codCollectedAt" TIMESTAMP(3),
  ADD COLUMN "codRemittedAt" TIMESTAMP(3),
  ADD COLUMN "codRemittedMmk" INTEGER,
  ADD COLUMN "codCarrierFeeMmk" INTEGER,
  ADD COLUMN "codRemittanceRef" TEXT;
ALTER TABLE "Order" ADD CONSTRAINT "Order_cod_remittance_positive" CHECK (
  ("codRemittedMmk" IS NULL OR "codRemittedMmk" >= 0) AND
  ("codCarrierFeeMmk" IS NULL OR "codCarrierFeeMmk" >= 0)
);
-- Old completed COD orders are collected; receipt by the store still requires reconciliation.
UPDATE "Order" SET "codCollectedAt" = COALESCE("completedAt", "updatedAt")
WHERE "paymentMethod" = 'COD' AND "paymentStatus" IN ('PAID', 'REFUNDED');
