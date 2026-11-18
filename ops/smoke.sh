#!/usr/bin/env bash
# Smoke test CHỈ ĐỌC sau mỗi lần deploy/rollback tandcstore.com (không ghi dữ liệu, không in secret).
# Chạy trên server:  bash /var/www/tandc/ops/smoke.sh   (ops/deploy.sh tự gọi sau khi app healthy)
# In PASS/FAIL/WARN/SKIP từng mục; có FAIL → exit 1.
# Biến (mặc định = server thật; đổi khi diễn tập local):
#   APP_DIR, COMPOSE_PROJECT, BASE_URL (URL công khai), LOCAL_URL (cổng nội bộ),
#   NEIGHBOR_URL (web khác trên cùng server, để trống = bỏ qua)
set -uo pipefail

APP_DIR="${APP_DIR:-/var/www/tandc}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-tandc}"
BASE_URL="${BASE_URL:-https://tandcstore.com}"
LOCAL_URL="${LOCAL_URL:-http://127.0.0.1:3000}"
NEIGHBOR_URL="${NEIGHBOR_URL-https://cons.viettelconstructionmyanmar.com}"
BASE_URL="${BASE_URL%/}"
LOCAL_URL="${LOCAL_URL%/}"

pass=0 fail=0 warn=0 skip=0
ok()   { pass=$((pass + 1)); printf 'PASS  %s\n' "$1"; }
bad()  { fail=$((fail + 1)); printf 'FAIL  %s\n' "$1"; }
note() { warn=$((warn + 1)); printf 'WARN  %s\n' "$1"; }
skp()  { skip=$((skip + 1)); printf 'SKIP  %s\n' "$1"; }
check() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (nhận '$3', cần '$2')"; fi; }

# Mã HTTP, không theo chuyển hướng; lỗi mạng → 000.
code() { curl -s -o /dev/null -m 20 -w '%{http_code}' "$@" 2>/dev/null || true; }
headers() { curl -s -D - -o /dev/null -m 20 "$1" 2>/dev/null || true; }

https=0
case "$BASE_URL" in https://*) https=1 ;; esac
host="${BASE_URL#*://}"; host="${host%%/*}"

echo "== Smoke $(date -u +%Y-%m-%dT%H:%M:%SZ) — $BASE_URL (project $COMPOSE_PROJECT)"
if git -C "$APP_DIR" rev-parse --git-dir >/dev/null 2>&1; then
  echo "== Bản đang chạy: $(git -C "$APP_DIR" describe --tags --always 2>/dev/null) ($(git -C "$APP_DIR" rev-parse --short HEAD))"
fi

# 1) Container
if command -v docker >/dev/null 2>&1; then
  ps_out="$(docker compose -p "$COMPOSE_PROJECT" ps -a --format '{{.Service}} {{.State}} {{.Health}} {{.ExitCode}}' 2>/dev/null)"
  app_line="$(printf '%s\n' "$ps_out" | awk '$1=="app"')"
  mig_line="$(printf '%s\n' "$ps_out" | awk '$1=="migrate"')"
  db_line="$(printf '%s\n' "$ps_out" | awk '$1=="db"')"
  case "$db_line" in *running*healthy*) ok "container db healthy" ;; *) bad "container db: '${db_line:-không có}'" ;; esac
  case "$mig_line" in "migrate exited "*" 0") ok "container migrate Exited (0)" ;; *) bad "container migrate: '${mig_line:-không có}'" ;; esac
  case "$app_line" in *running*healthy*) ok "container app healthy" ;; *) bad "container app: '${app_line:-không có}'" ;; esac
fi
if [ -n "${app_line:-}" ] && [ -n "${db_line:-}" ]; then
  # Cổng: app chỉ mở cho 127.0.0.1, DB không publish cổng nào.
  app_port="$(docker compose -p "$COMPOSE_PROJECT" port app 3000 2>/dev/null || true)"
  case "$app_port" in 127.0.0.1:*) ok "cổng app chỉ localhost ($app_port)" ;; *) bad "cổng app: '${app_port:-không publish}' (phải 127.0.0.1:…)" ;; esac
  # Đọc cấu hình publish thật của container (Compose ≥ 2.40 in ":0" cho cổng KHÔNG publish → `compose port` báo nhầm).
  db_id="$(docker compose -p "$COMPOSE_PROJECT" ps -q db 2>/dev/null || true)"
  db_port="$(docker port "$db_id" 5432 2>/dev/null | tr '\n' ' ' | sed 's/ *$//' || true)"
  if [ -z "$db_port" ]; then ok "DB không publish cổng"; else bad "DB đang publish cổng $db_port"; fi

  errors="$(docker compose -p "$COMPOSE_PROJECT" logs app --no-log-prefix 2>&1 | grep -ci error || true)"
  if [ "${errors:-0}" = "0" ]; then ok "log app không có 'error'"; else note "log app có $errors dòng chứa 'error' — xem: docker logs ${COMPOSE_PROJECT}-app-1 --tail 100"; fi
else
  skp "cổng/log container (không có docker hoặc không thấy container)"
fi

# 2) Health nội bộ + công khai
check "health nội bộ $LOCAL_URL/api/health" '{"ok":true}' "$(curl -s -m 20 "$LOCAL_URL/api/health" 2>/dev/null || true)"
if [ "$BASE_URL" != "$LOCAL_URL" ]; then
  check "health công khai $BASE_URL/api/health" '{"ok":true}' "$(curl -s -m 20 "$BASE_URL/api/health" 2>/dev/null || true)"
fi

# 3) Trang chính trả 200
for path in / /en /vi /admin/login /ctv/login /sitemap.xml /robots.txt; do
  check "GET $path" 200 "$(code "$BASE_URL$path")"
done

# 4) Header bảo mật
en_headers="$(headers "$BASE_URL/en")"
if printf '%s' "$en_headers" | grep -qi '^content-security-policy:'; then ok "/en có CSP"; else bad "/en thiếu Content-Security-Policy"; fi
if [ -z "$en_headers" ]; then bad "/en không trả header"
elif printf '%s' "$en_headers" | grep -qi '^x-powered-by:'; then bad "/en còn lộ X-Powered-By"
else ok "/en không lộ X-Powered-By"; fi
if [ "$https" = 1 ]; then
  if printf '%s' "$en_headers" | grep -qi '^strict-transport-security:'; then ok "/en có HSTS"; else bad "/en thiếu Strict-Transport-Security"; fi
else
  skp "HSTS (BASE_URL không phải https)"
fi
if headers "$BASE_URL/admin/login" | grep -i '^content-security-policy:' | grep -q "nonce-"; then
  ok "/admin/login CSP có nonce"
else
  bad "/admin/login CSP thiếu nonce"
fi

# 5) Cron: từ ngoài bị Nginx chặn (404), nội bộ không có token → 401.
check "cron nội bộ không token → 401" 401 "$(code "$LOCAL_URL/api/cron/cleanup")"
if [ "$https" = 1 ]; then
  check "cron từ Internet bị chặn → 404" 404 "$(code "$BASE_URL/api/cron/cleanup")"
else
  skp "chặn cron ở Nginx (BASE_URL không phải https)"
fi

# 6) Chuyển hướng http/www → https://<host>
if [ "$https" = 1 ]; then
  for from in "http://$host/" "http://www.$host/" "https://www.$host/"; do
    loc="$(curl -s -o /dev/null -m 20 -w '%{http_code} %{redirect_url}' "$from" 2>/dev/null || true)"
    case "$loc" in "301 https://$host/"*) ok "$from → https://$host/" ;; *) bad "$from chuyển hướng sai: '$loc'" ;; esac
  done
else
  skp "chuyển hướng http/www (BASE_URL không phải https)"
fi

# 7) Web khác trên cùng server vẫn chạy
if [ -n "$NEIGHBOR_URL" ]; then
  n="$(code "$NEIGHBOR_URL")"
  case "$n" in 2??|3??) ok "web hàng xóm $NEIGHBOR_URL ($n)" ;; *) bad "web hàng xóm $NEIGHBOR_URL trả '$n'" ;; esac
else
  skp "web hàng xóm (NEIGHBOR_URL trống)"
fi

echo "== Kết quả: $pass PASS · $fail FAIL · $warn WARN · $skip SKIP"
if [ "$fail" -gt 0 ]; then
  echo "SMOKE FAIL"
  exit 1
fi
echo "SMOKE OK"
