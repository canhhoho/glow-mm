-- SL dự kiến nhập của phân loại (19/11/2026): chỉ thêm cột, mặc định 0 — dữ liệu cũ không đổi.
ALTER TABLE "Variant" ADD COLUMN "plannedReceiveQty" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Variant" ADD CONSTRAINT "Variant_plannedReceiveQty_nonneg" CHECK ("plannedReceiveQty" >= 0);
