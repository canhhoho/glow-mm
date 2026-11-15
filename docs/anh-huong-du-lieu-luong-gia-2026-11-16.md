# Ảnh hưởng tới dữ liệu — sửa luồng giá 16/11/2026

Tài liệu dành cho người triển khai. **Không có thay đổi nào tự sửa dữ liệu cũ.** Migration `20261116090000_price_flow_manual_mode` chỉ thêm một enum và các cột cho phép rỗng (không đổi dòng nào đang có). Các truy vấn dưới đây **chỉ đọc**; tôi chưa chạy trên production — hãy chạy trên bản sao hoặc ở giờ vắng khách trước khi triển khai.

## 1. Việc cần xem trước khi triển khai

| # | Nội dung | Vì sao quan trọng | Cách xem (chỉ đọc) | Xử lý (làm bằng giao diện, không sửa tay DB) |
|---|---|---|---|---|
| 1 | **Lô còn tồn bán được nhưng chưa có giá vốn** (không thực tế, không tạm tính) | Từ nay **đơn dùng lô này không bàn giao được** ("Không bàn giao được: lô sắp xuất chưa có giá vốn") | **Báo cáo › Sức khoẻ dữ liệu**, mục *Tồn bán thiếu giá vốn* (mức "Lỗi"); hoặc SQL A | Mở lô → **Tính giá vốn tạm** (cần khối lượng + cước tạm); hoặc phân bổ chi phí chuyến hàng ở **Chuyến hàng**; hoặc nhập lại giá vốn thực tế |
| 2 | Đơn **Chuẩn bị giao** có lô thuộc mục 1 | Sẽ bị chặn lúc bàn giao ngay sau khi triển khai | SQL B | Xử lý lô ở mục 1 trước giờ giao |
| 3 | **Bản xem trước giá** đang mở (trạng thái Chờ) | Phiên bản công thức tăng lên 3 → bản cũ báo hết hạn, phải tạo lại | SQL C | Mở **Giá bán › Tính tự động** tạo lại |
| 4 | **Hoa hồng CTV cố định lớn hơn giá bán** đang tồn tại | Các đường đặt giá mới đều chặn trường hợp này; dữ liệu cũ vẫn nằm đó | SQL D | Sửa ở trang **Giá bán › Nhập thủ công** (cột CTV) |
| 5 | **Giá chờ duyệt cũ** (trước 16/11) | Vẫn đọc được; không có hoa hồng đi kèm. Sau triển khai, hoa hồng của SP đã duyệt phải đổi qua bản đang sửa | SQL E | Không cần làm gì; duyệt hoặc huỷ như bình thường |
| 6 | **Phiếu nhập nháp từ Excel** chưa ghi sổ | Mở lại để sửa sẽ giữ giá mua / phí về kho / tỷ giá đã chốt (trước đây làm mất) | **Kho hàng › Phiếu kho › Nháp** | Kiểm tra rồi **Ghi sổ** như thường |
| 7 | Lô Excel nhập với **Phí đưa về kho để trống** trước đây | Trước đây xem trước hiện giá vốn nhưng sau ghi sổ lô lại thiếu giá vốn (cùng nhóm với mục 1) | SQL A | Như mục 1 |

## 2. Giá có thể đã bị tính sai trước bản sửa

Hai lỗi cũ có thể đã làm bảng tính giá đưa ra **giá đề xuất sai** (giá đang bán **không** bị đổi tự động):
- Dòng nhập **Tester** (giá 0) hoặc phiếu vào **kho bán khác / khu chờ kiểm tra** từng được dùng làm "giá mua gần nhất".
- Cảnh báo "cần tính lại giá" bật/tắt theo thời điểm, không theo nội dung giá.

Việc nên làm một lần sau triển khai: ở **Giá bán**, lọc **Giá cũ hơn phiếu nhập** và **Chưa có giá**; với các SKU từng được tính bằng bảng tính trong thời gian có phiếu Tester, chạy lại **Tính tự động** (hệ thống chỉ so và đề xuất, bạn duyệt). SQL F liệt kê SKU mà lần nhập gần nhất là dòng Tester.

## 3. Điều không thay đổi
- Giá đang bán, hoa hồng đã chốt trên từng dòng đơn (`commissionPerUnitMmk`), giá vốn đã chụp lúc bàn giao (`unitLandedCostMmk`), lịch sử giá và sổ kho: giữ nguyên.
- Lô thiếu giá vốn **vẫn bán được trên web**; chỉ bước **Đã bàn giao vận chuyển** bị chặn.

## 4. Truy vấn tham khảo (chỉ đọc)

```sql
-- A. Lô bán được còn tồn nhưng thiếu hoàn toàn giá vốn
SELECT v.sku, b."lotNo", b.id AS "batchId", SUM(sb.qty) AS tonban
FROM "Batch" b
JOIN "Variant" v ON v.id = b."variantId"
JOIN "StockBalance" sb ON sb."batchId" = b.id AND sb."stockType" = 'SELLABLE' AND sb.qty > 0
JOIN "Location" l ON l.id = sb."locationId" AND l.sellable
WHERE b."landedCostMmk" IS NULL AND b."estimatedCostMmk" IS NULL
GROUP BY 1, 2, 3 ORDER BY 1, 2;

-- B. Đơn chuẩn bị giao có lô thiếu giá vốn (theo phiếu soạn đã chốt)
SELECT DISTINCT o.code
FROM "Order" o
JOIN "OrderPickLine" p ON p."orderId" = o.id
JOIN "Batch" b ON b.id = p."batchId"
WHERE o.status IN ('PAYMENT_CONFIRMED', 'COD_CONFIRMED')
  AND b."landedCostMmk" IS NULL AND b."estimatedCostMmk" IS NULL;

-- C. Bản xem trước giá đang mở (sẽ hết hạn)
SELECT id, "createdAt", "formulaVersion" FROM "PriceUpdateRun" WHERE status = 'PREVIEW';

-- D. Hoa hồng CTV cố định lớn hơn giá bán
SELECT sku, "priceMmk", "affiliateCommissionMmk"
FROM "Variant" WHERE "affiliateCommissionMmk" IS NOT NULL AND "affiliateCommissionMmk" > "priceMmk";

-- E. Giá chờ duyệt tạo trước 16/11 (chưa có stagedAt)
SELECT cr."productId", e.key AS "variantId", e.value
FROM "ProductChangeRequest" cr, jsonb_each(cr.prices) e
WHERE cr.prices IS NOT NULL AND NOT (e.value ? 'stagedAt');

-- F. SKU mà lần nhập đã ghi sổ gần nhất là dòng Tester (giá mua tham chiếu từng bị lệch)
SELECT sku, "stockType", code, "postedAt" FROM (
  SELECT DISTINCT ON (l."variantId") v.sku, l."stockType", d.code, d."postedAt"
  FROM "StockDocumentLine" l
  JOIN "StockDocument" d ON d.id = l."documentId" AND d.type = 'RECEIVE' AND d.status = 'POSTED'
  JOIN "Variant" v ON v.id = l."variantId"
  WHERE l.qty > 0
  ORDER BY l."variantId", d."postedAt" DESC
) x WHERE "stockType" = 'TESTER';
```

## 5. Khôi phục
Cột mới đều cho phép rỗng và không có ràng buộc mới lên dữ liệu cũ, nên quay lại bản trước (deploy lại tag cũ) vẫn chạy được: cột thừa bị bỏ qua. Việc chặn bàn giao và nguồn giá mua là logic ứng dụng, không lưu trong DB.
