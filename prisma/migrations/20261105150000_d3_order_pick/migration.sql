-- CreateTable
CREATE TABLE "OrderPick" (
    "orderId" TEXT NOT NULL,
    "printedById" TEXT NOT NULL,
    "printedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "OrderPick_pkey" PRIMARY KEY ("orderId")
);

-- CreateTable
CREATE TABLE "OrderPickLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,

    CONSTRAINT "OrderPickLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderPickLine_orderId_idx" ON "OrderPickLine"("orderId");

-- CreateIndex
CREATE INDEX "OrderPickLine_batchId_locationId_idx" ON "OrderPickLine"("batchId", "locationId");

-- AddForeignKey
ALTER TABLE "OrderPick" ADD CONSTRAINT "OrderPick_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderPickLine" ADD CONSTRAINT "OrderPickLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "OrderPick"("orderId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderPickLine" ADD CONSTRAINT "OrderPickLine_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderPickLine" ADD CONSTRAINT "OrderPickLine_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderPickLine" ADD CONSTRAINT "OrderPickLine_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

