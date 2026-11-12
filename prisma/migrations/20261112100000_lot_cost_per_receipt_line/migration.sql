-- P1-C (D11): giá mua + tỷ giá lưu trên từng dòng phiếu NHẬP, để một lô nhập nhiều lần với giá khác nhau.
-- Giá vốn lô (Batch.unitCost*) = bình quân theo SL đã nhập của các dòng đã ghi sổ — code tính lại khi ghi sổ phiếu NHẬP.
-- Chỉ thêm cột + chép dữ liệu cũ (mỗi lô hiện chỉ có một mức giá nên chép là chính xác). Không xoá / đổi dữ liệu cũ.
-- Rollback: DROP các cột + CHECK + index bên dưới (giá lô đã bằng giá dòng khi mỗi lô chỉ có một lần nhập; nếu đã có lô nhập
-- lại khác giá thì giữ nguyên giá bình quân đang lưu ở Batch).

ALTER TABLE "StockDocumentLine" ADD COLUMN "unitCostVnd" INTEGER,
ADD COLUMN "unitCostMmk" INTEGER,
ADD COLUMN "landedCostVnd" INTEGER,
ADD COLUMN "rateId" TEXT;

ALTER TABLE "StockDocumentLine" ADD CONSTRAINT "StockDocumentLine_rateId_fkey" FOREIGN KEY ("rateId") REFERENCES "ExchangeRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "StockDocumentLine_batchId_idx" ON "StockDocumentLine"("batchId");

-- Chép giá của lô vào các dòng NHẬP đã có. Giá vốn về kho (landedCostVnd) chỉ là nhập tay với lô không thuộc chuyến;
-- lô thuộc chuyến thì giá này do phân bổ chuyến hàng quyết định, không phải của từng lần nhập.
UPDATE "StockDocumentLine" l
SET "unitCostVnd" = b."unitCostVnd",
    "unitCostMmk" = b."unitCostMmk",
    "landedCostVnd" = CASE WHEN b."shipmentId" IS NULL THEN b."landedCostVnd" END,
    "rateId" = b."rateId"
FROM "StockDocument" d, "Batch" b
WHERE d."id" = l."documentId" AND d."type" = 'RECEIVE' AND b."id" = l."batchId";

ALTER TABLE "StockDocumentLine" ADD CONSTRAINT "StockDocumentLine_cost_one_currency" CHECK (num_nonnulls("unitCostVnd", "unitCostMmk") <= 1);
ALTER TABLE "StockDocumentLine" ADD CONSTRAINT "StockDocumentLine_cost_non_negative" CHECK (COALESCE("unitCostVnd", 0) >= 0 AND COALESCE("unitCostMmk", 0) >= 0 AND COALESCE("landedCostVnd", 0) >= 0);
