-- Bỏ trang Thương hiệu: thương hiệu tự xoá khi không còn SP. Dọn một lần các thương hiệu đang không có SP nào.
DELETE FROM "Brand" b WHERE NOT EXISTS (SELECT 1 FROM "Product" p WHERE p."brandId" = b.id);
