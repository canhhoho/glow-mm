-- DropForeignKey
ALTER TABLE "PriceUpdateRun" DROP CONSTRAINT "PriceUpdateRun_rateId_fkey";

-- AlterTable
ALTER TABLE "Batch" ADD COLUMN     "unitCostMmk" INTEGER,
ALTER COLUMN "unitCostVnd" DROP NOT NULL;

-- AlterTable
ALTER TABLE "PriceRunLine" ADD COLUMN     "costMmk" INTEGER,
ADD COLUMN     "profitMmk" INTEGER,
ADD COLUMN     "shipMmk" INTEGER,
ALTER COLUMN "costVnd" DROP NOT NULL;

-- AlterTable
ALTER TABLE "PriceUpdateRun" ADD COLUMN     "locationId" TEXT,
ADD COLUMN     "shipMmkPerKg" INTEGER,
ALTER COLUMN "rateId" DROP NOT NULL,
ALTER COLUMN "marginPct" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "fixedProfitMmk" INTEGER;

-- AddForeignKey
ALTER TABLE "PriceUpdateRun" ADD CONSTRAINT "PriceUpdateRun_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceUpdateRun" ADD CONSTRAINT "PriceUpdateRun_rateId_fkey" FOREIGN KEY ("rateId") REFERENCES "ExchangeRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- P24: giá mua của lô là VND (hàng nhập VN) hoặc MMK (hàng mua tại Myanmar) — đúng một trong hai.
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_unit_cost_one_currency" CHECK (num_nonnulls("unitCostVnd", "unitCostMmk") = 1);
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_unit_cost_non_negative" CHECK (COALESCE("unitCostVnd", 0) >= 0 AND COALESCE("unitCostMmk", 0) >= 0);
