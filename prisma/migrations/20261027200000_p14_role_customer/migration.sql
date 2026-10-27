-- Postgres không cho dùng giá trị enum mới trong cùng transaction thêm nó → migration riêng.
ALTER TYPE "Role" ADD VALUE 'CUSTOMER';
