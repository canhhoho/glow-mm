-- CreateTable
CREATE TABLE "PriceRunLine" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "costVnd" INTEGER NOT NULL,
    "oldPriceMmk" INTEGER NOT NULL,
    "newPriceMmk" INTEGER NOT NULL,

    CONSTRAINT "PriceRunLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PriceRunLine_runId_variantId_key" ON "PriceRunLine"("runId", "variantId");

-- AddForeignKey
ALTER TABLE "PriceRunLine" ADD CONSTRAINT "PriceRunLine_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PriceUpdateRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceRunLine" ADD CONSTRAINT "PriceRunLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

