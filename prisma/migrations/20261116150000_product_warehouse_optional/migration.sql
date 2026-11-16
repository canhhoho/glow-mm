-- Kho bán của SP chọn lúc nhập hàng: SP mới chưa có kho (NULL) đến khi ghi sổ dòng nhập/chuyển đầu tiên vào kho bán.
-- Dữ liệu cũ không đổi; khoá ngoại giữ ON DELETE RESTRICT.
ALTER TABLE "Product" ALTER COLUMN "stockLocationId" DROP NOT NULL;
