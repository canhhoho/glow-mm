#!/usr/bin/env bash
# Backup: dump PostgreSQL + thư mục upload. Cài trên server Myanmar tại /opt/glow/backup.sh, chạy bằng cron
# (ops/cron.example) và bởi ops/deploy.sh trước mỗi migration.
# Hai chế độ:
#   - off-site: đặt CẢ AGE_RECIPIENT + RCLONE_REMOTE → mã hoá age, đẩy rclone (cần cài age, rclone).
#   - local:    để trống CẢ HAI → file không mã hoá trong BACKUP_DIR (root, 700/600). KHÔNG chống hỏng ổ/mất máy.
# Dump DB luôn được kiểm bằng pg_restore --list (ở chế độ local) trước khi coi là thành công.
set -euo pipefail
umask 077

: "${DB_CONTAINER:?Tên container Postgres, vd tandc-db-1}"
: "${UPLOADS_VOLUME:?Tên docker volume chứa upload, vd tandc_uploads}"
AGE_RECIPIENT="${AGE_RECIPIENT:-}"
RCLONE_REMOTE="${RCLONE_REMOTE:-}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/glow}"
KEEP_LOCAL_DAYS="${KEEP_LOCAL_DAYS:-14}"
KEEP_REMOTE_DAYS="${KEEP_REMOTE_DAYS:-30}"

if [ -n "$AGE_RECIPIENT" ] && [ -n "$RCLONE_REMOTE" ]; then mode=offsite
elif [ -z "$AGE_RECIPIENT" ] && [ -z "$RCLONE_REMOTE" ]; then mode=local
else echo "Cấu hình sai: đặt cả AGE_RECIPIENT và RCLONE_REMOTE (off-site) hoặc để trống cả hai (local)" >&2; exit 1
fi

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
cd "$BACKUP_DIR"

if [ "$mode" = offsite ]; then
  enc() { age -r "$AGE_RECIPIENT"; }; ext=".age"
else
  enc() { cat; }; ext=""
fi
db_file="db-$stamp.dump$ext"
up_file="uploads-$stamp.tar.gz$ext"

# 1) Database (định dạng custom → pg_restore được từng phần)
docker exec "$DB_CONTAINER" pg_dump -U glow -d glow --format=custom --no-owner --no-acl | enc > "$db_file"

# 2) File upload (ảnh sản phẩm, biên lai)
docker run --rm -v "$UPLOADS_VOLUME":/data:ro alpine:3.22 tar -C /data -czf - . | enc > "$up_file"

# 3) Kiểm tra: file không rỗng; bản local thì dump phải đọc được mục lục
for f in "$db_file" "$up_file"; do
  [ -s "$f" ] || { echo "Backup rỗng: $f" >&2; exit 1; }
done
if [ "$mode" = local ]; then
  docker exec -i "$DB_CONTAINER" pg_restore --list < "$db_file" > /dev/null \
    || { echo "Dump hỏng (pg_restore --list lỗi): $db_file" >&2; exit 1; }
fi

# 4) Off-site + dọn bản cũ
if [ "$mode" = offsite ]; then
  rclone copy "$BACKUP_DIR" "$RCLONE_REMOTE" --include "*-$stamp.*"
  rclone delete "$RCLONE_REMOTE" --min-age "${KEEP_REMOTE_DAYS}d"
fi
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'db-*' -o -name 'uploads-*' \) -mtime +"$KEEP_LOCAL_DAYS" -delete

echo "Backup OK ($mode) $stamp: $db_file $(du -h "$db_file" | cut -f1), $up_file $(du -h "$up_file" | cut -f1)"
