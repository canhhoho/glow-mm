#!/usr/bin/env bash
# Khôi phục từ backup (DEPLOY.md §3). GHI ĐÈ dữ liệu hiện có của DB đích → chỉ chạy khi chắc chắn.
#   ./restore.sh <db-YYYYmmddTHHMMSSZ.dump[.age]> [uploads-....tar.gz[.age]]
# File .age (backup off-site) cần private key age tại AGE_KEY_FILE; file không đuôi .age (backup local) đọc thẳng.
set -euo pipefail

: "${DB_CONTAINER:?Tên container Postgres đích}"
DB_FILE="${1:?Thiếu file db-*.dump hoặc db-*.dump.age}"
UPLOADS_FILE="${2:-}"
UPLOADS_VOLUME="${UPLOADS_VOLUME:-}"

dec() { # $1 = file
  case "$1" in
    *.age) : "${AGE_KEY_FILE:?Đường dẫn private key age}"; age -d -i "$AGE_KEY_FILE" "$1" ;;
    *) cat "$1" ;;
  esac
}

read -r -p "Sẽ GHI ĐÈ database 'glow' trong container $DB_CONTAINER. Gõ YES để tiếp tục: " ok
[ "$ok" = "YES" ] || { echo "Huỷ."; exit 1; }

dec "$DB_FILE" \
  | docker exec -i "$DB_CONTAINER" pg_restore -U glow -d glow --clean --if-exists --no-owner --no-acl

if [ -n "$UPLOADS_FILE" ]; then
  : "${UPLOADS_VOLUME:?Cần UPLOADS_VOLUME để khôi phục file upload}"
  dec "$UPLOADS_FILE" \
    | docker run --rm -i -v "$UPLOADS_VOLUME":/data alpine:3.22 tar -C /data -xzf -
fi

echo "Khôi phục xong. Kiểm tra: curl -fsS https://<domain>/api/health và đăng nhập admin."
