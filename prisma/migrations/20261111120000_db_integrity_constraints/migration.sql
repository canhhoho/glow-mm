-- P4 — Ràng buộc toàn vẹn ở tầng DB (lưới an toàn sau code; code vẫn là lớp kiểm chính).
-- Trước khi deploy: chạy `npm run data:check` (scripts/data-checks.ts) trên BẢN SAO production —
-- 3 mục "Dòng tồn âm", "Tổng sổ kho ≠ tồn", "Nhãn biến thể trùng" phải bằng 0, nếu không migration này sẽ dừng.
-- Prisma không biểu diễn CHECK/trigger trong schema → không gây lệch khi `migrate dev`.
-- Rollback (không mất dữ liệu):
--   DROP TRIGGER "Variant_label_unique" ON "Variant"; DROP FUNCTION "variant_label_unique"(); DROP FUNCTION "variant_label_key"(text);
--   DROP TRIGGER "StockLedger_append_only" ON "StockLedger"; DROP TRIGGER "StockLedger_no_truncate" ON "StockLedger"; DROP FUNCTION "stock_ledger_append_only"();
--   ALTER TABLE "StockBalance" DROP CONSTRAINT "StockBalance_qty_non_negative";
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261111120000_db_integrity_constraints';

-- 1) Tồn không bao giờ âm (applyMoves đã chặn; DB chặn mọi đường ghi khác).
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_qty_non_negative" CHECK ("qty" >= 0);

-- 2) Sổ kho chỉ ghi thêm: chặn UPDATE / DELETE / TRUNCATE. Sửa sai = phiếu điều chỉnh mới.
CREATE FUNCTION "stock_ledger_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'StockLedger chỉ được ghi thêm (thao tác % bị chặn) — dùng phiếu điều chỉnh', TG_OP
    USING ERRCODE = 'check_violation';
END
$$;

CREATE TRIGGER "StockLedger_append_only"
  BEFORE UPDATE OR DELETE ON "StockLedger"
  FOR EACH ROW EXECUTE FUNCTION "stock_ledger_append_only"();

CREATE TRIGGER "StockLedger_no_truncate"
  BEFORE TRUNCATE ON "StockLedger"
  FOR EACH STATEMENT EXECUTE FUNCTION "stock_ledger_append_only"();

-- 3) Tên loại (nhãn biến thể) không trùng trong cùng SP — không phân biệt hoa thường / khoảng trắng thừa,
--    đúng quy tắc của saveProduct (P1-D). Dùng constraint trigger HOÃN tới cuối transaction (không dùng
--    unique index) để đổi chéo nhãn giữa hai biến thể trong một lần lưu vẫn hợp lệ.
CREATE FUNCTION "variant_label_key"(label text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(regexp_replace(btrim(label), '\s+', ' ', 'g'))
$$;

CREATE FUNCTION "variant_label_unique"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  cur RECORD;
BEGIN
  -- Đọc lại giá trị hiện tại (trigger hoãn nhận NEW của lúc ghi, có thể đã bị sửa tiếp trong transaction).
  SELECT "productId", "label" INTO cur FROM "Variant" WHERE "id" = NEW."id";
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF EXISTS (
    SELECT 1 FROM "Variant" v
    WHERE v."productId" = cur."productId" AND v."id" <> NEW."id"
      AND "variant_label_key"(v."label") = "variant_label_key"(cur."label")
  ) THEN
    RAISE EXCEPTION 'Tên loại "%" bị trùng trong cùng sản phẩm', cur."label"
      USING ERRCODE = 'unique_violation', CONSTRAINT = 'Variant_productId_label_key';
  END IF;
  RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER "Variant_label_unique"
  AFTER INSERT OR UPDATE OF "label", "productId" ON "Variant"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "variant_label_unique"();

-- Kiểm dữ liệu hiện có ngay khi migrate (trigger chỉ bắt các lần ghi sau).
DO $$
DECLARE
  dup text;
BEGIN
  SELECT string_agg(p, ', ') INTO dup FROM (
    SELECT DISTINCT "productId" AS p FROM "Variant"
    GROUP BY "productId", "variant_label_key"("label") HAVING COUNT(*) > 1
    LIMIT 20
  ) t;
  IF dup IS NOT NULL THEN
    RAISE EXCEPTION 'Có SP trùng tên loại, xử lý trước khi migrate (productId): %', dup;
  END IF;
END
$$;
