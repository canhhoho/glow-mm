-- Sửa luồng giá 16/11: trang Giá bán (chế độ Thủ công), giá + hoa hồng có hiệu lực cùng lúc. Chỉ thêm cột/enum, không đổi dữ liệu cũ.
-- CreateEnum
CREATE TYPE "PriceRunMode" AS ENUM ('AUTO', 'MANUAL');

-- AlterTable
ALTER TABLE "PriceUpdateRun" ADD COLUMN     "mode" "PriceRunMode" NOT NULL DEFAULT 'AUTO';

-- AlterTable
ALTER TABLE "PriceRunLine" ADD COLUMN     "baseCommissionMmk" INTEGER,
ADD COLUMN     "basePriceMmk" INTEGER,
ADD COLUMN     "commissionMmk" INTEGER,
ADD COLUMN     "profitVnd" INTEGER,
ADD COLUMN     "sellVnd" INTEGER,
ADD COLUMN     "sourceLineId" TEXT;

-- AlterTable
ALTER TABLE "PriceHistory" ADD COLUMN     "newCommissionMmk" INTEGER,
ADD COLUMN     "oldCommissionMmk" INTEGER;

-- AddForeignKey
ALTER TABLE "PriceRunLine" ADD CONSTRAINT "PriceRunLine_sourceLineId_fkey" FOREIGN KEY ("sourceLineId") REFERENCES "StockDocumentLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

