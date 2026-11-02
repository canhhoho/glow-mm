-- P23: tỷ giá nhập qua USD (1 USD = ? MMK, 1 USD = ? VND). Dòng cũ để NULL (đã nhập thẳng MMK/VND).
ALTER TABLE "ExchangeRate" ADD COLUMN "mmkPerUsd" DECIMAL(14,2),
ADD COLUMN "vndPerUsd" DECIMAL(14,2);
