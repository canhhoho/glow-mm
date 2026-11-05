-- P24: hai kho bán (Kho Thắm · Kho Chi), SP thuộc một kho, kho tắt được.

-- CreateEnum
CREATE TYPE "PricingMode" AS ENUM ('VN_IMPORT', 'LOCAL_MMK');

-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "pricingMode" "PricingMode";

-- ── Dữ liệu (DB đã có kho từ seed: dev, glow_test, production). DB mới: seed tạo đúng cấu trúc. ──
-- 1) Kho Yangon hiện tại → Kho Thắm (giữ id: sổ kho + tồn không đổi).
UPDATE "Location"
SET "code" = 'THAM', "name" = 'Kho Thắm', "pricingMode" = 'VN_IMPORT'
WHERE "code" = 'MM-STOCK' AND NOT EXISTS (SELECT 1 FROM "Location" WHERE "code" = 'THAM');

-- 2) Thêm Kho Chi (bán được, giá vốn MMK) cạnh Kho Thắm.
INSERT INTO "Location" ("id", "code", "name", "type", "warehouseId", "sellable", "active", "pricingMode")
SELECT 'loc-chi', 'CHI', 'Kho Chi', 'MM_STOCK', t."warehouseId", true, true, 'LOCAL_MMK'
FROM "Location" t
WHERE t."code" = 'THAM' AND NOT EXISTS (SELECT 1 FROM "Location" WHERE "code" = 'CHI');

-- 3) Kho VN / đang vận chuyển / hải quan: tắt (không xoá — sổ kho tham chiếu).
UPDATE "Location" SET "active" = false WHERE "code" IN ('VN-STOCK', 'IN-TRANSIT', 'CUSTOMS');

-- Kho bán khác (vd. vị trí tạo trong test) chưa có cách tính giá → mặc định như Kho Thắm.
UPDATE "Location" SET "pricingMode" = 'VN_IMPORT' WHERE "sellable" = true AND "pricingMode" IS NULL;

-- 4) SP thuộc kho: gán mọi SP hiện có vào Kho Thắm (không có thì kho bán đầu tiên theo mã).
ALTER TABLE "Product" ADD COLUMN "stockLocationId" TEXT;
UPDATE "Product" SET "stockLocationId" = COALESCE(
  (SELECT "id" FROM "Location" WHERE "code" = 'THAM'),
  (SELECT "id" FROM "Location" WHERE "sellable" = true ORDER BY "code" LIMIT 1)
);
ALTER TABLE "Product" ALTER COLUMN "stockLocationId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Product_stockLocationId_idx" ON "Product"("stockLocationId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_stockLocationId_fkey" FOREIGN KEY ("stockLocationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
