-- P16: CTV đăng nhập storefront bằng Google cùng email → email do admin nhập/duyệt coi như đã xác minh
-- (Better Auth chỉ tự liên kết Google vào tài khoản có emailVerified = true).
UPDATE "user" SET "emailVerified" = true WHERE "role" = 'AFFILIATE';
