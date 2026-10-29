#!/usr/bin/env bash
# Khôi phục từ backup (DEPLOY.md §3). GHI ĐÈ dữ liệu hiện có của DB đích → chỉ chạy khi chắc chắn.
#   ./restore.sh <db-YYYYmmddTHHMMSSZ.dump.age> [uploads-....tar.gz.age]
# Yêu cầu: file private key age tại AGE_KEY_FILE.
set -euo pipefail

: "${DB_CONTAINER:?Tên container Postgres đích}"
: "${AGE_KEY_FILE:?Đường dẫn private key age}"
DB_FILE="${1:?Thiếu file db-*.dump.age}"
UPLOADS_FILE="${2:-}"
UPLOADS_VOLUME="${UPLOADS_VOLUME:-}"

read -r -p "Sẽ GHI ĐÈ database 'glow' trong container $DB_CONTAINER. Gõ YES để tiếp tục: " ok
[ "$ok" = "YES" ] || { echo "Huỷ."; exit 1; }

age -d -i "$AGE_KEY_FILE" "$DB_FILE" \
  | docker exec -i "$DB_CONTAINER" pg_restore -U glow -d glow --clean --if-exists --no-owner --no-acl

if [ -n "$UPLOADS_FILE" ]; then
  : "${UPLOADS_VOLUME:?Cần UPLOADS_VOLUME để khôi phục file upload}"
  age -d -i "$AGE_KEY_FILE" "$UPLOADS_FILE" \
    | docker run --rm -i -v "$UPLOADS_VOLUME":/data alpine:3.22 tar -C /data -xzf -
fi

echo "Khôi phục xong. Kiểm tra: curl -fsS https://<domain>/api/health và đăng nhập admin."
