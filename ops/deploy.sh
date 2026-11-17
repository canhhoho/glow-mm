#!/usr/bin/env bash
# Deploy HOẶC rollback tandcstore.com về một tag release-* (quyền root: CI gọi qua ops/tandc-deploy, hoặc chạy tay trên server).
#   bash /var/www/tandc/ops/deploy.sh                    # bản release mới nhất
#   bash /var/www/tandc/ops/deploy.sh release-20261108-2230   # một bản cụ thể (rollback = tag trước)
#   bash /var/www/tandc/ops/deploy.sh --list             # các bản có sẵn + lịch sử deploy
# Tuỳ chọn: --yes (không hỏi xác nhận), --allow-older-schema (xem bước 4 bên dưới).
# Chỉ nhận tag release-YYYYMMDD-HHMM: tag chỉ được gắn khi CI đầy đủ đã xanh → không deploy bản chưa qua kiểm tra.
# Không in secret. Biến (mặc định = server thật; đổi khi diễn tập local):
#   APP_DIR, COMPOSE_PROJECT, COMPOSE_FILE_NAME, ENV_FILE, DEPLOY_LOG, BACKUP_CMD,
#   REQUIRE_HTTPS (1 = APP_URL phải https), HEALTH_TIMEOUT (giây), cùng các biến của smoke.sh.
set -euo pipefail
export LC_COLLATE=C # sort/comm so tên migration ổn định

# Chạy từ bản sao tạm: git checkout bên dưới có thể thay chính file này giữa chừng.
if [ -z "${GLOW_DEPLOY_TMP:-}" ]; then
  src_dir="$(cd "$(dirname "$0")" && pwd)"
  GLOW_DEPLOY_TMP="$(mktemp -d)"
  cp "$src_dir/deploy.sh" "$src_dir/smoke.sh" "$GLOW_DEPLOY_TMP/"
  export GLOW_DEPLOY_TMP
  exec bash "$GLOW_DEPLOY_TMP/deploy.sh" "$@"
fi
trap 'rm -rf "$GLOW_DEPLOY_TMP"' EXIT

APP_DIR="${APP_DIR:-/var/www/tandc}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-tandc}"
COMPOSE_FILE_NAME="${COMPOSE_FILE_NAME:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.prod}"
DEPLOY_LOG="${DEPLOY_LOG:-/var/log/glow-deploy.log}"
BACKUP_CMD="${BACKUP_CMD:-set -a; . /opt/glow/cron.env; set +a; /opt/glow/backup.sh}"
REQUIRE_HTTPS="${REQUIRE_HTTPS:-1}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-300}"
TAG_RE='^release-[0-9]{8}-[0-9]{4}$'

die() { printf '\n⛔ %s\n' "$*" >&2; exit 1; }
say() { printf '\n== %s\n' "$*"; }
log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >> "$DEPLOY_LOG"; }
dc() { docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE_NAME" --env-file "$ENV_FILE" "$@"; }

target="" yes=0 allow_older=0 list=0
for a in "$@"; do
  case "$a" in
    --yes) yes=1 ;;
    --allow-older-schema) allow_older=1 ;;
    --list) list=1 ;;
    -*) die "Tuỳ chọn lạ: $a" ;;
    *) [ -z "$target" ] || die "Chỉ nhận một tag"; target="$a" ;;
  esac
done

cd "$APP_DIR" || die "Không có thư mục $APP_DIR"
git rev-parse --git-dir >/dev/null 2>&1 || die "$APP_DIR không phải git repo"

# Không deploy khi có deploy khác đang chạy (flock có trên Linux; thiếu thì bỏ qua).
# Khoá nằm trong .git (chỉ chủ repo ghi được), không ở /tmp: user khác tạo trước file trong /tmp sẽ chặn được deploy.
if command -v flock >/dev/null 2>&1; then
  exec 9>"$(git rev-parse --absolute-git-dir)/glow-deploy-$COMPOSE_PROJECT.lock"
  flock -n 9 || die "Đang có một lần deploy khác chạy"
fi

current_sha="$(git rev-parse --short HEAD)"
current_name="$(git describe --tags --exact-match HEAD 2>/dev/null || echo "$current_sha")"

say "Tải danh sách bản phát hành"
git fetch --quiet --tags origin || die "git fetch lỗi (mạng/GitHub token?)"
releases="$(git tag -l 'release-*' --sort=-refname | grep -E "$TAG_RE" || true)"

if [ "$list" = 1 ]; then
  echo "Đang chạy: $current_name"
  echo "Bản phát hành gần nhất (mới → cũ):"
  printf '%s\n' "$releases" | head -n 10 | sed 's/^/  /'
  echo "Lịch sử deploy ($DEPLOY_LOG):"
  tail -n 10 "$DEPLOY_LOG" 2>/dev/null | sed 's/^/  /' || echo "  (chưa có)"
  exit 0
fi

# 1) Chọn bản đích — chỉ tag release-*.
[ -n "$target" ] || target="$(printf '%s\n' "$releases" | head -n 1)"
[ -n "$target" ] || die "Chưa có tag release-* nào. Chờ Claude gắn tag sau khi CI đầy đủ xanh."
printf '%s' "$target" | grep -Eq "$TAG_RE" || die "'$target' không phải tag release-YYYYMMDD-HHMM → không deploy (chỉ bản đã qua CI đầy đủ)."
git rev-parse -q --verify "refs/tags/$target^{commit}" >/dev/null || die "Không tìm thấy tag $target"
target_sha="$(git rev-parse --short "$target^{commit}")"

# 2) Thư mục mã nguồn không có sửa tay (sẽ chặn checkout hoặc bị build lẫn vào).
[ -z "$(git status --porcelain --untracked-files=no)" ] || die "Có file bị sửa tay trong $APP_DIR (git status). Gửi Claude, không tự xoá."

# 3) Kiểm tra cấu hình (không in giá trị).
[ -f "$ENV_FILE" ] || die "Thiếu $APP_DIR/$ENV_FILE"
grep -q '^POSTGRES_PASSWORD=.' "$ENV_FILE" || die "$ENV_FILE thiếu POSTGRES_PASSWORD"
if [ "$REQUIRE_HTTPS" = 1 ]; then grep -q '^APP_URL=https://' "$ENV_FILE" || die "$ENV_FILE: APP_URL phải là https://"; fi
! grep -qi 'change-me' "$ENV_FILE" || die "$ENV_FILE còn khoá mẫu change-me"
dc config --quiet 2>&1 | sed 's/^/   /' >&2 || die "$ENV_FILE thiếu biến bắt buộc cho $COMPOSE_FILE_NAME (xem dòng trên)"

# 4) So migration: DB đã áp ↔ bản đích.
target_migs="$(git ls-tree --name-only "$target^{commit}" prisma/migrations/ | sed 's#^prisma/migrations/##' | grep -v '\.toml$' | sort)"
applied_migs="$(dc exec -T db psql -U glow -d glow -Atc \
  'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL' 2>/dev/null | tr -d '\r' | sort || true)"
if [ -z "$applied_migs" ]; then
  echo "⚠️  Không đọc được migration từ DB — so với mã đang chạy ($current_name)."
  applied_migs="$(git ls-tree --name-only HEAD prisma/migrations/ | sed 's#^prisma/migrations/##' | grep -v '\.toml$' | sort)"
fi
new_migs="$(comm -13 <(printf '%s\n' "$applied_migs") <(printf '%s\n' "$target_migs") | sed '/^$/d')"
missing_migs="$(comm -23 <(printf '%s\n' "$applied_migs") <(printf '%s\n' "$target_migs") | sed '/^$/d')"

say "Kế hoạch"
echo "Từ:  $current_name ($current_sha)"
echo "Đến: $target ($target_sha)"
if [ -n "$new_migs" ]; then echo "Migration mới sẽ chạy (có sao lưu trước):"; printf '%s\n' "$new_migs" | sed 's/^/  + /'; else echo "Không có migration mới."; fi
if [ -n "$missing_migs" ]; then
  echo "DB đã có migration mà bản đích KHÔNG biết:"; printf '%s\n' "$missing_migs" | sed 's/^/  - /'
  if [ "$allow_older" != 1 ]; then
    die "Quay về bản cũ hơn database. App cũ có thể ghi sai/lỗi với cột/bảng mới.
   Không xoá bảng/cột để quay lui. Chọn một:
   - Sửa lỗi và phát hành bản mới (khuyến nghị) — báo Claude.
   - Chỉ khi Claude xác nhận bản cũ chạy được với DB mới: chạy lại kèm --allow-older-schema.
   - Khôi phục backup (mất đơn/dữ liệu sau thời điểm backup) — xem mục F.13 tài liệu triển khai."
  fi
  echo "⚠️  --allow-older-schema: tiếp tục dù DB mới hơn bản đích."
fi
[ "$current_sha" != "$target_sha" ] || echo "Bản đích trùng bản đang chạy → build và chạy lại."

if [ "$yes" != 1 ]; then
  read -r -p "Gõ YES để tiếp tục: " ans || ans=""
  [ "$ans" = "YES" ] || die "Đã huỷ, không thay đổi gì."
fi

# 5) Sao lưu bắt buộc khi có migration mới.
if [ -n "$new_migs" ]; then
  say "Sao lưu trước khi đổi database"
  bash -c "$BACKUP_CMD" || die "Sao lưu lỗi → KHÔNG deploy."
fi

# 6) Đổi mã + build + chạy (migrate chạy trước app).
log "START from=$current_name($current_sha) to=$target($target_sha)"
say "Checkout $target"
git -c advice.detachedHead=false checkout --quiet --detach "$target"
say "Build và khởi động (3–10 phút; bản cũ vẫn phục vụ khách trong lúc build)"
rollback_hint() {
  if [ "$current_sha" = "$target_sha" ]; then
    echo "   Đang deploy lại chính bản đang chạy → không có bản trước để quay về; gửi Claude."
  elif printf '%s' "$current_name" | grep -Eq "$TAG_RE"; then
    echo "   Quay lại bản trước:  bash $APP_DIR/ops/deploy.sh $current_name"
  else
    echo "   Bản trước ($current_sha) không có tag release → gửi Claude để có lệnh quay lại."
  fi
}
# Build riêng trước: build lỗi thì chưa container nào bị thay → trả mã nguồn về bản đang chạy, web không đổi.
if ! SOURCE_COMMIT="$target_sha" dc build; then
  git -c advice.detachedHead=false checkout --quiet --detach "$current_sha"
  log "FAIL build to=$target (web vẫn chạy $current_name)"
  echo "⛔ Build lỗi — web VẪN CHẠY bản cũ $current_name, mã nguồn đã trả về bản đó. Gửi Claude toàn bộ chữ ở trên."
  exit 1
fi
if ! SOURCE_COMMIT="$target_sha" dc up -d; then
  log "FAIL up to=$target"
  echo "⛔ Khởi động lỗi. Gửi Claude: docker logs ${COMPOSE_PROJECT}-migrate-1 --tail 30; docker logs ${COMPOSE_PROJECT}-app-1 --tail 50"
  rollback_hint
  exit 1
fi

# 7) Chờ app healthy.
say "Chờ app healthy (tối đa ${HEALTH_TIMEOUT}s)"
app_id="$(dc ps -q app)"
waited=0 status=""
while [ "$waited" -lt "$HEALTH_TIMEOUT" ]; do
  status="$(docker inspect -f '{{.State.Health.Status}}' "$app_id" 2>/dev/null || echo unknown)"
  [ "$status" = healthy ] && break
  sleep 5; waited=$((waited + 5))
done
if [ "$status" != healthy ]; then
  log "FAIL unhealthy($status) to=$target"
  echo "⛔ App không healthy sau ${HEALTH_TIMEOUT}s (trạng thái: $status). Gửi Claude: docker logs ${COMPOSE_PROJECT}-app-1 --tail 50"
  rollback_hint
  exit 1
fi

# 8) Smoke test.
say "Smoke test"
if APP_DIR="$APP_DIR" COMPOSE_PROJECT="$COMPOSE_PROJECT" bash "$GLOW_DEPLOY_TMP/smoke.sh"; then
  log "OK to=$target($target_sha)"
  say "✅ Đang chạy $target. Mở web, nhấn Ctrl+Shift+R để xem bản mới."
else
  log "SMOKE_FAIL to=$target($target_sha)"
  echo "⛔ Smoke test có mục FAIL. Gửi Claude toàn bộ phần kết quả ở trên."
  rollback_hint
  exit 1
fi
