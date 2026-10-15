#!/usr/bin/env bash
# Backup hằng ngày: dump PostgreSQL + thư mục upload → mã hoá → đẩy off-site bằng rclone.
# Cài trên server Myanmar tại /opt/glow/backup.sh, chạy bằng cron (xem DEPLOY.md §3).
# Yêu cầu: docker, rclone (đã `rclone config` remote tên trong RCLONE_REMOTE), age (mã hoá).
set -euo pipefail

: "${DB_CONTAINER:?Tên container Postgres, vd glow-db}"
: "${UPLOADS_VOLUME:?Tên docker volume chứa upload, vd glow_uploads}"
: "${RCLONE_REMOTE:?Remote off-site, vd b2:glow-backups}"
: "${AGE_RECIPIENT:?Public key age để mã hoá (age1...)}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/glow}"
KEEP_LOCAL_DAYS="${KEEP_LOCAL_DAYS:-7}"
KEEP_REMOTE_DAYS="${KEEP_REMOTE_DAYS:-30}"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"
cd "$BACKUP_DIR"

# 1) Database (định dạng custom → pg_restore được từng phần)
docker exec "$DB_CONTAINER" pg_dump -U glow -d glow --format=custom --no-owner --no-acl \
  | age -r "$AGE_RECIPIENT" > "db-$stamp.dump.age"

# 2) File upload (ảnh sản phẩm, biên lai)
docker run --rm -v "$UPLOADS_VOLUME":/data:ro alpine:3.22 tar -C /data -czf - . \
  | age -r "$AGE_RECIPIENT" > "uploads-$stamp.tar.gz.age"

# 3) Kiểm tra nhanh: file không rỗng
for f in "db-$stamp.dump.age" "uploads-$stamp.tar.gz.age"; do
  [ -s "$f" ] || { echo "Backup rỗng: $f" >&2; exit 1; }
done

# 4) Đẩy off-site + dọn bản cũ
rclone copy "$BACKUP_DIR" "$RCLONE_REMOTE" --include "*-$stamp.*"
rclone delete "$RCLONE_REMOTE" --min-age "${KEEP_REMOTE_DAYS}d"
find "$BACKUP_DIR" -type f -name '*.age' -mtime +"$KEEP_LOCAL_DAYS" -delete

echo "Backup OK $stamp"
