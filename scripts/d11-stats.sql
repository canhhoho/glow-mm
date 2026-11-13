-- D11 / P1-C — số liệu CHỈ ĐỌC về lô, phiếu nhập và chuyến hàng (không đổi dữ liệu, không in thông tin khách).
-- Chạy trên server (DB không publish cổng):
--   docker exec -i tandc-db-1 psql -U glow -d glow -q -P pager=off < scripts/d11-stats.sql
-- hoặc trên bản sao DB ở máy local. Gửi kết quả để đối chiếu quy tắc "nhập lại cùng lô khác giá".
BEGIN TRANSACTION READ ONLY;
\echo '== 1. Lô theo loại tiền × có chuyến × nguồn giá vốn'
SELECT CASE WHEN "unitCostMmk" IS NOT NULL THEN 'MMK' ELSE 'VND' END cur,
       ("shipmentId" IS NOT NULL) has_ship,
       CASE WHEN "landedCostVnd" IS NOT NULL THEN 'landedVnd' WHEN "landedCostMmk" IS NOT NULL THEN 'landedMmk' WHEN "estimatedCostMmk" IS NOT NULL THEN 'estimated' ELSE 'none' END cost_src,
       count(*) FROM "Batch" GROUP BY 1,2,3 ORDER BY 1,2,3;
\echo '== 2. Số phiếu NHẬP đã ghi sổ mỗi lô'
SELECT n_docs, count(*) lots FROM (SELECT l."batchId", count(DISTINCT d.id) n_docs FROM "StockDocumentLine" l JOIN "StockDocument" d ON d.id=l."documentId" WHERE d.type='RECEIVE' AND d.status='POSTED' GROUP BY 1) t GROUP BY 1 ORDER BY 1;
\echo '== 3. Phiếu NHẬP (đã ghi sổ) có / không có chuyến'
SELECT ("shipmentId" IS NOT NULL) has_ship, count(*) FROM "StockDocument" WHERE type='RECEIVE' AND status='POSTED' GROUP BY 1;
\echo '== 4. Lô có chuyến nhưng phiếu nhập không gắn chuyến (gắn lô sau) / ngược lại'
SELECT ("b_ship") , ("d_ship"), count(*) FROM (
  SELECT DISTINCT b.id, b."shipmentId" IS NOT NULL b_ship, d."shipmentId" IS NOT NULL d_ship
  FROM "Batch" b JOIN "StockDocumentLine" l ON l."batchId"=b.id JOIN "StockDocument" d ON d.id=l."documentId"
  WHERE d.type='RECEIVE' AND d.status='POSTED') t GROUP BY 1,2 ORDER BY 1,2;
\echo '== 5. Chuyến hàng: số lô, đã phân bổ chưa, phương pháp'
SELECT s.code, s."allocationMethod", count(DISTINCT b.id) lots, (SELECT count(*) FROM "ShipmentAllocation" a WHERE a."shipmentId"=s.id) allocations, (SELECT count(*) FROM "ShipmentCost" c WHERE c."shipmentId"=s.id) costs
FROM "InboundShipment" s LEFT JOIN "Batch" b ON b."shipmentId"=s.id GROUP BY s.id ORDER BY s.code;
\echo '== 6. Lô VND không chuyến có landedCostVnd (tồn đầu kỳ nhập tay)'
SELECT count(*) FROM "Batch" WHERE "shipmentId" IS NULL AND "unitCostVnd" IS NOT NULL AND "landedCostVnd" IS NOT NULL;
\echo '== 7. Lô đã có dòng giao đơn (OrderAllocation) — giá vốn đã chốt vào đơn'
SELECT ("shipmentId" IS NOT NULL) has_ship, count(DISTINCT b.id) FROM "Batch" b JOIN "OrderAllocation" o ON o."batchId"=b.id GROUP BY 1;
\echo '== 8. Lô còn tồn ở nhiều kho'
SELECT count(*) FROM (SELECT "batchId" FROM "StockBalance" WHERE qty>0 GROUP BY 1 HAVING count(DISTINCT "locationId")>1) t;
\echo '== 9. Phiếu NHẬP NHÁP đang mở (sẽ ghi sổ theo quy tắc mới)'
SELECT ("shipmentId" IS NOT NULL) has_ship, count(*) FROM "StockDocument" WHERE type='RECEIVE' AND status='DRAFT' GROUP BY 1;
ROLLBACK;
