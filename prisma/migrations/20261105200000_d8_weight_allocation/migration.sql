ALTER TYPE "AllocationMethod" ADD VALUE 'BY_WEIGHT';
CREATE TABLE "ShipmentAllocation" (
  "id" TEXT NOT NULL,
  "shipmentId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT NOT NULL,
  "method" "AllocationMethod" NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "input" JSONB NOT NULL,
  "result" JSONB NOT NULL,
  CONSTRAINT "ShipmentAllocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ShipmentAllocation_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "InboundShipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ShipmentAllocation_shipmentId_createdAt_idx" ON "ShipmentAllocation"("shipmentId", "createdAt");
