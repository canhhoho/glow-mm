-- Chống tạo trùng phiếu kho khi gửi lại cùng một form.
ALTER TABLE "StockDocument" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "StockDocument_idempotencyKey_key" ON "StockDocument"("idempotencyKey");
