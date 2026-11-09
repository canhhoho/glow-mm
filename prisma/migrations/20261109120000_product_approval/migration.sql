-- QT2: bước 4 Duyệt sản phẩm.
ALTER TABLE "Product" ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "approvedById" TEXT,
ADD COLUMN "approvedHash" TEXT;

-- SP đang hiển thị coi như đã duyệt (người duyệt = hệ thống) để không chặn sửa/đăng lại.
-- approvedHash để trống: lần sửa nội dung/giá/ảnh sau đó vẫn bị phát hiện (so trước/sau khi sửa).
UPDATE "Product" SET "approvedAt" = CURRENT_TIMESTAMP WHERE "published" = true;
