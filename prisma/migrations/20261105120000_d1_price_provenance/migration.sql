-- CreateEnum
CREATE TYPE "PriceLineStatus" AS ENUM ('PENDING', 'APPLIED', 'SKIPPED');

-- AlterTable
ALTER TABLE "PriceRunLine" ADD COLUMN     "appliedAt" TIMESTAMP(3),
ADD COLUMN     "fingerprint" TEXT,
ADD COLUMN     "skipReason" TEXT,
ADD COLUMN     "sourceBatchId" TEXT,
ADD COLUMN     "sourceDocumentId" TEXT,
ADD COLUMN     "sourcePostedAt" TIMESTAMP(3),
ADD COLUMN     "status" "PriceLineStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "weightFromComponents" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "weightGrams" INTEGER;

-- AlterTable
ALTER TABLE "PriceUpdateRun" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "formulaVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "skipped" JSONB;

-- AddForeignKey
ALTER TABLE "PriceRunLine" ADD CONSTRAINT "PriceRunLine_sourceBatchId_fkey" FOREIGN KEY ("sourceBatchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceRunLine" ADD CONSTRAINT "PriceRunLine_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "StockDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- D1 backfill: bản đã áp dụng → dòng có lịch sử giá là APPLIED; còn lại của bản đã đóng là SKIPPED (LEGACY).
UPDATE "PriceRunLine" l SET "status" = 'APPLIED', "appliedAt" = r."appliedAt"
FROM "PriceUpdateRun" r
WHERE r."id" = l."runId"
  AND EXISTS (SELECT 1 FROM "PriceHistory" h WHERE h."runId" = l."runId" AND h."variantId" = l."variantId");

UPDATE "PriceRunLine" l SET "status" = 'SKIPPED', "skipReason" = 'LEGACY'
FROM "PriceUpdateRun" r
WHERE r."id" = l."runId" AND r."status" IN ('APPLIED', 'CANCELLED') AND l."status" = 'PENDING';
-- Bản PREVIEW cũ: expiresAt = NULL, formulaVersion = 1 → coi như hết hạn, phải tạo lại (nguồn giá cũ theo ngày tạo lô).
