# Danh sách lệnh đưa T&C Cosmetics lên tandcstore.com (đi thẳng lên server)

> Cập nhật 2026-10-30. Làm **từ trên xuống**, mỗi khối lệnh copy–dán một lần, đọc dòng **"Đúng khi"** rồi mới đi tiếp.
> Giải thích chi tiết từng bước và xử lý sự cố: [huong-dan-trien-khai-tandcstore.md](huong-dan-trien-khai-tandcstore.md) (PHẦN F).
>
> `<...>` = chỗ bạn tự điền. Không dán mật khẩu/secret vào chat hay vào Git.

**Cách làm (đã chốt):**
- `tandcstore.com` chưa có ai dùng → dựng và **chạy thử ngay trên tandcstore.com**. DNS chỉ đổi một lần.
- Khách vẫn mua trên Vercel (`glow-mm.vercel.app`) cho tới **Ngày chuyển (PHẦN 3)**.
- Trước ngày chuyển, **nhận đơn trên server luôn TẮT**: dữ liệu chạy thử sẽ bị ghi đè khi chép dữ liệu lần cuối.
- Khách đăng nhập bằng **SĐT + mật khẩu** và **Google**. Không dùng email.

**Tránh va chạm với các app khác trên server** — app này được thiết kế để **tách hẳn**:

| Tài nguyên | App này dùng | Vì sao không đụng app khác |
|---|---|---|
| Cổng 80/443 | Không chiếm — Nginx sẵn có nhận rồi chuyển vào | Chỉ thêm **một file site riêng** `/etc/nginx/sites-available/tandc`, `server_name` chỉ là `tandcstore.com`/`www` |
| Cổng app | `127.0.0.1:3000` (chỉ trong máy) | Kiểm ở bước 2; trùng thì báo Claude đổi sang cổng khác |
| Database | PostgreSQL **riêng trong Docker**, không mở cổng ra máy | Không đụng PostgreSQL hệ thống (cổng 5432) hay DB của app khác |
| Node.js | Node 24 **bên trong container** | Không đụng Node/PM2 của app khác |
| Tên Docker | Mọi thứ bắt đầu bằng `tandc` (`tandc-app-1`, volume `tandc_*`, mạng `tandc_default`) | Kiểm ở bước 2 rằng chưa có gì tên `tandc` |
| Thư mục | `/var/www/tandc`, `/opt/glow`, `/var/log/glow-*.log` | Kiểm ở bước 2 rằng chưa tồn tại |
| Crontab | **Thêm** 5 dòng vào crontab root, giữ nguyên dòng cũ | Bước 13e nối thêm, không ghi đè |
| Chứng chỉ HTTPS | `certbot certonly` chỉ cho tandcstore.com | Không sửa site/chứng chỉ của app khác |
| CPU/RAM | Build tốn ~2–3 GB RAM vài phút | Server 24 vCPU/48 GB dư; nên build ngoài giờ cao điểm |

**Những lệnh có thể ảnh hưởng app khác — chỉ chạy đúng như hướng dẫn:**
- `systemctl restart docker` (bước 3): **khởi động lại MỌI container** trên máy → chỉ chạy khi máy **chưa có Docker** (cài mới). Đã có Docker của app khác → bỏ qua cả bước 3.
- `systemctl reload nginx`: luôn chạy **sau** `nginx -t` báo OK (lệnh trong hướng dẫn đã ghép sẵn `nginx -t && …`). `reload` không làm rớt kết nối của site khác.
- **Không** sửa/xoá file trong `/etc/nginx/sites-enabled/` của app khác, **không** đổi `ufw`, SSH, múi giờ, PostgreSQL hệ thống, PM2.
- **Không** chạy `docker system prune`, `docker volume prune`, `docker network prune`, `docker compose down` **không có `-p tandc`** — các lệnh này có thể xoá dữ liệu/mạng của app khác. Chỉ dùng `docker image prune -f` (xoá image rác không ai dùng).

**Bạn cần chuẩn bị:**
- [ ] OpenVPN đã kết nối, SSH được: `ssh vcm_aio@10.201.42.65`.
- [ ] Tài khoản inet.vn (DNS), Google Cloud Console (OAuth), Neon (chuỗi kết nối DB hiện tại), GitHub.
- [ ] **GitHub token** chỉ đọc repo `glow-mm`: GitHub → Settings → Developer settings → Fine-grained tokens → Repository access: `glow-mm`; Permissions → Contents: *Read-only*.
- [ ] Nơi lưu backup ngoài server: Backblaze B2 hoặc Cloudflare R2 (dùng ở bước 13).

---

# PHẦN 1 — Dựng app trên server

## Bước 1. Vào server
```bash
ssh vcm_aio@10.201.42.65
```
```bash
sudo su -
```

## Bước 2. Kiểm kê server và các app đang chạy (chỉ xem, không sửa gì)
Chạy một lần, **chụp/lưu toàn bộ kết quả** (để đối chiếu nếu có sự cố, và gửi Claude nếu có mục nào lạ):
```bash
echo "== CPU/RAM/DIA =="; nproc; free -h; df -h /
echo "== CONG DANG NGHE =="; ss -tlnp
echo "== SITE NGINX =="; ls -l /etc/nginx/sites-enabled/; grep -h -E "server_name|listen" /etc/nginx/sites-enabled/* | sed 's/^ *//' | sort -u
echo "== PM2 =="; pm2 ls 2>/dev/null || echo "(khong co pm2 cho root)"
echo "== DOCKER =="; docker --version 2>/dev/null && docker compose version && docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' && docker compose ls -a && docker volume ls && docker network ls || echo "(chua co Docker)"
echo "== MANG DOCKER (dai IP) =="; for n in $(docker network ls -q 2>/dev/null); do docker network inspect -f '{{.Name}} {{range .IPAM.Config}}{{.Subnet}} {{end}}' $n; done
echo "== ROUTE CUA MAY =="; ip -4 route
echo "== TEN SE DUNG (phai trong) =="; ls -d /var/www/tandc /opt/glow /var/log/glow-* 2>/dev/null; docker ps -a --format '{{.Names}}' 2>/dev/null | grep -i tandc; docker volume ls -q 2>/dev/null | grep -i tandc; echo "(het)"
echo "== CRONTAB ROOT =="; crontab -l 2>/dev/null || echo "(trong)"
echo "== KHAC =="; nginx -v; certbot --version; timedatectl | grep "Time zone"
```
Đúng khi:
- **CỔNG:** không có tiến trình nào ở `:3000` (dòng chứa `:3000 `). Có → **dừng**, gửi kết quả cho Claude để đổi cổng.
- **TÊN SẼ DÙNG:** giữa tiêu đề và `(het)` **không có dòng nào** (chưa có `/var/www/tandc`, `/opt/glow`, container/volume `tandc`). Có → dừng, báo Claude.
- **SITE NGINX:** không site nào đang có `server_name` chứa `tandcstore.com`.
- **DOCKER:**
  - nếu đã có Docker (app khác đang dùng) → **bỏ qua bước 3**, không restart Docker;
  - nếu chưa có → làm bước 3.
- **MẠNG DOCKER / ROUTE:** dải IP của mạng Docker (thường `172.17–31.x.x` hoặc `192.168.x.x`) **không được trùng** với dải mạng công ty/VPN trong `ip -4 route` hoặc dải bộ phận hạ tầng đang dùng. Hỏi hạ tầng: *"Mạng nội bộ/VPN có dùng dải 172.16.0.0/12 hoặc 192.168.0.0/16 không?"*. Nếu có → báo Claude trước bước 6 để cấu hình dải riêng cho mạng `tandc`.
- `nginx` và `certbot` có phiên bản.

Kiểm tra server ra được Internet (mỗi dòng phải có số, không phải `000`):
```bash
for u in https://github.com https://registry.npmjs.org https://registry-1.docker.io/v2/ https://binaries.prisma.sh https://acme-v02.api.letsencrypt.org/directory https://oauth2.googleapis.com; do printf '%-50s ' "$u"; curl -s -o /dev/null -m 10 -w '%{http_code}\n' "$u" || echo LOI; done
```
Dòng nào `000`/`LOI` → nhờ bộ phận hạ tầng mở firewall cho địa chỉ đó (cổng 443).

## Bước 3. Cài Docker — CHỈ khi bước 2 báo "(chua co Docker)"
> Máy đã có Docker (của app khác) → **bỏ qua cả bước này**. Lệnh `systemctl restart docker` bên dưới khởi động lại mọi container trên máy.

```bash
curl -fsSL https://get.docker.com | sh && systemctl enable --now docker && docker compose version
```
Giới hạn log container. Nếu file đã tồn tại thì **dừng**, mở ra gộp tay:
```bash
test -e /etc/docker/daemon.json && cat /etc/docker/daemon.json || (echo '{"log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"3"}}' > /etc/docker/daemon.json && systemctl restart docker && echo OK)
```

## Bước 4. Lấy mã nguồn
```bash
git config --global credential.helper store && mkdir -p /var/www && cd /var/www && git clone https://github.com/canhhoho/glow-mm.git tandc
```
Khi hỏi: **Username** `canhhoho`, **Password** = dán **GitHub token** (không phải mật khẩu GitHub).
```bash
cd /var/www/tandc && git log --oneline -1
```
Đúng khi: in ra một dòng commit.

## Bước 5. Tạo file cấu hình `.env.prod` (chỉ chạy MỘT lần)
Lệnh dưới **tự sinh mọi secret** và không ghi đè nếu file đã có:
```bash
cd /var/www/tandc && test -e .env.prod && echo "DA CO .env.prod - KHONG TAO LAI" || { cat > .env.prod <<EOF
POSTGRES_PASSWORD=$(openssl rand -hex 24)
APP_URL=https://tandcstore.com
BETTER_AUTH_SECRET=$(openssl rand -base64 32)
CRON_SECRET=$(openssl rand -hex 24)
NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=$(openssl rand -base64 32)
DATABASE_POOL_MAX=20
EMAIL_DRIVER=none
FB_PAGE_USERNAME=
VIBER_CHAT_URI=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
EOF
chmod 600 .env.prod && echo "DA TAO .env.prod"; }
```
Điền 4 dòng còn trống, lấy giá trị như trên Vercel → Settings → Environment Variables (Production):
```bash
nano /var/www/tandc/.env.prod
```
- `FB_PAGE_USERNAME`, `VIBER_CHAT_URI`: có thể để trống.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: Vercel thường **ẩn** giá trị secret. Khi đó vào Google Cloud → Google Auth Platform → Clients → client web → **Add secret** để tạo secret mới (secret cũ vẫn dùng được cho Vercel).
- Lưu file trong nano: `Ctrl+O`, `Enter`, `Ctrl+X`.

**Sao lưu file này** vào trình quản lý mật khẩu (mất là khách bị đăng xuất/lỗi form):
```bash
cat /var/www/tandc/.env.prod
```

## Bước 6. Build và chạy app
```bash
cd /var/www/tandc && SOURCE_COMMIT=$(git rev-parse --short HEAD) docker compose -p tandc -f docker-compose.prod.yml --env-file .env.prod up -d --build
```
Lần đầu mất 5–15 phút. Sau đó:
```bash
docker compose -p tandc ps -a; curl -s http://127.0.0.1:3000/api/health; echo
```
Đúng khi:
- `tandc-db-1` healthy;
- `tandc-migrate-1` **Exited (0)**;
- `tandc-app-1` healthy với `127.0.0.1:3000->3000`;
- dòng cuối là `{"ok":true}`.

---

# PHẦN 2 — Tên miền, HTTPS, dữ liệu, chạy thử

## Bước 7. Trỏ tên miền về server (làm trên inet.vn)
Lấy IP công cộng (chạy trên **máy tính của bạn**), dùng chung IP với web VCM:
```bash
nslookup cons.viettelconstructionmyanmar.com
```
inet.vn → `tandcstore.com` → **Quản lý DNS** → xoá bản ghi `@`/`www` mặc định (nếu có) → thêm:

| Loại | Host | Giá trị | TTL |
|---|---|---|---|
| A | `@` | `<IP_CONG_CONG>` | 300 |
| A | `www` | `<IP_CONG_CONG>` | 300 |

Chờ 5–30 phút, kiểm tra trên **máy tính của bạn**:
```bash
nslookup tandcstore.com
```
Đúng khi: ra đúng `<IP_CONG_CONG>`.

> Nếu máy LB/Firewall lọc theo tên miền, nhờ hạ tầng thêm `tandcstore.com` và `www.tandcstore.com`.

## Bước 8. Nginx + HTTPS (site riêng, không đụng web VCM)
**8a.** Cấu hình HTTP tạm để Certbot xác thực:
```bash
cat > /etc/nginx/sites-available/tandc <<'EOF'
server {
    listen 80;
    server_name tandcstore.com www.tandcstore.com;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
EOF
ln -sf /etc/nginx/sites-available/tandc /etc/nginx/sites-enabled/tandc && nginx -t && systemctl reload nginx
```
Đúng khi: `nginx -t` báo `syntax is ok` và `test is successful`.

**8b.** Xin chứng chỉ HTTPS (Certbot có thể hỏi email):
```bash
certbot certonly --nginx -d tandcstore.com -d www.tandcstore.com
```
Đúng khi: báo `Successfully received certificate`. Lỗi thì xem [PHẦN F.3](huong-dan-trien-khai-tandcstore.md#f3-certbot-không-cấp-được-chứng-chỉ).

**8c.** Cấu hình chính thức:
- HTTPS cho `tandcstore.com`;
- `www` và `http` chuyển về `https://tandcstore.com`;
- giữ IP thật của khách;
- tắt buffer để trang hiện dần trên 3G.
```bash
cat > /etc/nginx/sites-available/tandc <<'EOF'
server {
    listen 80;
    server_name tandcstore.com www.tandcstore.com;
    return 301 https://tandcstore.com$request_uri;
}

server {
    listen 443 ssl http2;
    server_name www.tandcstore.com;
    ssl_certificate     /etc/letsencrypt/live/tandcstore.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tandcstore.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    return 301 https://tandcstore.com$request_uri;
}

server {
    listen 443 ssl http2;
    server_name tandcstore.com;
    ssl_certificate     /etc/letsencrypt/live/tandcstore.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tandcstore.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;

    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host  $host;
        proxy_buffering off;
        proxy_read_timeout 120s;
    }
}
EOF
nginx -t && systemctl reload nginx
```
- Nếu `nginx -t` báo không có `options-ssl-nginx.conf`: xoá 2 dòng `include …` rồi chạy lại `nginx -t && systemctl reload nginx`.
- Nếu `nginx -t` báo lỗi khác: **không reload**. Tắt site bằng `rm /etc/nginx/sites-enabled/tandc && nginx -t && systemctl reload nginx`, rồi gửi lỗi cho Claude.

Kiểm tra:
```bash
curl -s https://tandcstore.com/api/health; echo; curl -sI http://www.tandcstore.com | grep -i location; curl -sI https://cons.viettelconstructionmyanmar.com | head -1; certbot renew --dry-run 2>&1 | tail -2
```
Đúng khi:
- `{"ok":true}`;
- `location: https://tandcstore.com/`;
- web VCM vẫn `HTTP/… 200` (hoặc 30x);
- gia hạn thử báo thành công.

## Bước 9. Kiểm tra IP thật của khách
Mở `https://tandcstore.com` bằng **điện thoại dùng 4G**, rồi:
```bash
tail -3 /var/log/nginx/access.log
```
Đúng khi: cột đầu là IP công cộng của điện thoại, không phải `10.x`.

**Chỉ khi** cột đầu là IP `10.x` của máy LB: hỏi hạ tầng IP nội bộ máy LB, rồi chèn 3 dòng *real IP* vào khối `server_name tandcstore.com;`:
```bash
sed -i 's|    client_max_body_size 10M;|    client_max_body_size 10M;\n    set_real_ip_from <IP_NOI_BO_MAY_LB>;\n    real_ip_header X-Forwarded-For;\n    real_ip_recursive on;|' /etc/nginx/sites-available/tandc && nginx -t && systemctl reload nginx
```

## Bước 10. Google đăng nhập (làm trên Google Cloud Console)
Google Auth Platform → **Clients** → client web hiện có → thêm (**giữ** các URI cũ của Vercel):
- Authorized JavaScript origins: `https://tandcstore.com`
- Authorized redirect URIs: `https://tandcstore.com/api/customer-auth/callback/google`

→ **Save**.

## Bước 11. Chép dữ liệu thật từ Neon (bản chạy thử)
Lấy **chuỗi kết nối DIRECT** của Neon nhánh production: Neon → **Connect** → bỏ chọn *Connection pooling* → copy chuỗi `postgresql://…`.
```bash
mkdir -p /root/migrate && read -rs NEON_URL && export NEON_URL && echo "da nhan chuoi Neon"
```
(dán chuỗi Neon — không hiện ra màn hình — rồi Enter)

**11a.** Dump Neon → khôi phục vào server:
```bash
docker run --rm -e NEON_URL -v /root/migrate:/out postgres:17.6-alpine sh -c 'pg_dump "$NEON_URL" --format=custom --no-owner --no-acl -f /out/neon.dump' && ls -lh /root/migrate/neon.dump && docker cp /root/migrate/neon.dump tandc-db-1:/tmp/neon.dump && docker exec tandc-db-1 pg_restore -U glow -d glow --clean --if-exists --no-owner --no-acl /tmp/neon.dump; echo "pg_restore exit=$?"
```
Đúng khi: có file `neon.dump` và `pg_restore exit=0`.

**11b.** Đối chiếu số dòng Neon ↔ server (hai bảng kết quả phải giống nhau):
```bash
Q='SELECT (SELECT count(*) FROM "Order") orders, (SELECT count(*) FROM "StockLedger") ledger, (SELECT count(*) FROM "Batch") batches, (SELECT count(*) FROM "Product") products, (SELECT count(*) FROM "user") users, (SELECT coalesce(sum(qty),0) FROM "StockBalance") total_qty'; docker run --rm -e NEON_URL postgres:17.6-alpine sh -c "psql \"\$NEON_URL\" -c '$Q'"; docker exec tandc-db-1 psql -U glow -d glow -c "$Q"
```

**11c.** Chép ảnh/biên lai từ Vercel Blob về server. Chạy thử trước:
```bash
cd /var/www/tandc && set -a && . ./.env.prod && set +a && docker run --rm --user 1001:1001 --network tandc_default -v tandc_uploads:/app/storage -e LOCAL_STORAGE_DIR=/app/storage -e DATABASE_URL="postgresql://glow:${POSTGRES_PASSWORD}@db:5432/glow" tandc-migrate node scripts/migrate-blob-to-local.mjs --dry-run
```
Thấy số file sẽ chép → chạy thật (cùng lệnh, bỏ `--dry-run`):
```bash
cd /var/www/tandc && set -a && . ./.env.prod && set +a && docker run --rm --user 1001:1001 --network tandc_default -v tandc_uploads:/app/storage -e LOCAL_STORAGE_DIR=/app/storage -e DATABASE_URL="postgresql://glow:${POSTGRES_PASSWORD}@db:5432/glow" tandc-migrate node scripts/migrate-blob-to-local.mjs
```
Đúng khi: báo số file đã chép, không còn lỗi. Lỗi mạng → chạy lại, chỉ xử lý file còn thiếu.

**11d.** Khởi động lại app (xoá cache cũ):
```bash
docker restart tandc-app-1 && sleep 15 && curl -s http://127.0.0.1:3000/api/health; echo
```

**11e. NGAY LẬP TỨC** tắt nhận đơn trên server: dữ liệu vừa chép có cài đặt "đang nhận đơn" từ Vercel.
→ Mở `https://tandcstore.com/admin` → đăng nhập bằng **tài khoản admin thật** (giống Vercel) → **Cài đặt** → **bỏ chọn "Nhận đơn trên web"** → **Lưu**.

## Bước 12. Chạy thử trên tandcstore.com
Trên trình duyệt (cửa sổ ẩn danh):
- [ ] `https://tandcstore.com`: trang chủ tiếng Myanmar, ảnh sản phẩm, banner hiện đủ; `/en` tiếng Anh.
- [ ] `https://www.tandcstore.com` → chuyển về `https://tandcstore.com`.
- [ ] `/en/register` đăng ký bằng **số thử** → vào `/en/account`; đăng xuất → đăng nhập lại bằng SĐT.
- [ ] `/en/login`: có dòng "Quên mật khẩu? Nhắn shop…"; nút **Google** → đăng nhập được.
- [ ] `/admin` (3 vai trò), cổng `/ctv`; mở một biên lai chuyển khoản (chỉ admin xem được).
- [ ] `/admin/customer-accounts`: tìm số thử → đặt lại mật khẩu → đăng nhập được.
- [ ] Checkout báo **tạm ngừng nhận đơn** (đúng, vì đang tắt). Muốn thử đặt đơn: bật tạm → đặt 1 đơn COD → huỷ → **tắt lại ngay**.

Trên server:
```bash
curl -sI https://tandcstore.com/en | grep -iE "strict-transport|content-security" ; curl -sI https://tandcstore.com/admin/login | grep -io "nonce-[^']*" | head -1; ss -tlnp | grep -E ':(3000|5432)\b'
```
Đúng khi:
- có `Strict-Transport-Security` và `Content-Security-Policy`;
- có một dòng `nonce-…`;
- cổng 3000 chỉ ở `127.0.0.1`, không có 5432 của Docker lộ ra.

## Bước 13. Cron + backup
**13a.** Cài công cụ, chép script:
```bash
apt install -y rclone age && mkdir -p /opt/glow && cp /var/www/tandc/ops/backup.sh /var/www/tandc/ops/restore.sh /opt/glow/ && chmod 700 /opt/glow/*.sh && touch /var/log/glow-cron.log /var/log/glow-backup.log
```

**13b.** Khoá mã hoá backup. Private key phải giữ **ngoài server**:
```bash
age-keygen -o /root/glow-backup.key && cat /root/glow-backup.key
```
→ Chép **toàn bộ** nội dung vào trình quản lý mật khẩu. Ghi lại dòng `public key: age1…`. Sau đó xoá key khỏi server:
```bash
rm /root/glow-backup.key
```

**13c.** Nơi lưu backup. Tạo bucket `glow-backups` trên B2/R2 cùng key chỉ có quyền bucket đó, rồi:
```bash
rclone config
```
(`n` → đặt tên `b2` → chọn loại Backblaze B2 hoặc S3/Cloudflare R2 → nhập key)
```bash
rclone lsd b2:
```

**13d.** File cấu hình cron. Dán **dòng `public key` của bạn** vào `<age1...>`:
```bash
CS=$(grep ^CRON_SECRET= /var/www/tandc/.env.prod | cut -d= -f2-) && cat > /opt/glow/cron.env <<EOF
CRON_SECRET=$CS
DB_CONTAINER=tandc-db-1
UPLOADS_VOLUME=tandc_uploads
RCLONE_REMOTE=b2:glow-backups
AGE_RECIPIENT=<age1...>
EOF
chmod 600 /opt/glow/cron.env && nano /opt/glow/cron.env
```
(sửa dòng `AGE_RECIPIENT`, lưu)

**13e.** Lịch chạy. Kiểm tra múi giờ server (bước 2); lịch trong file tính theo **UTC**:
```bash
(crontab -l 2>/dev/null; grep -v '^#' /var/www/tandc/ops/cron.example | grep -v '^\s*$') | crontab - && crontab -l
```
Đúng khi: thấy 5 dòng lịch (2 dòng mỗi 15 phút, cảnh báo tồn, cleanup, backup) cùng các dòng cũ của web VCM (nếu có).
Nếu server **không** để UTC: báo Claude để đổi giờ trong lịch. **Không** đổi múi giờ server vì ảnh hưởng web VCM.

**13f.** Thử cron + backup ngay:
```bash
bash -c 'set -a; . /opt/glow/cron.env; curl -fsS -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/api/cron/cleanup'; echo; curl -s -o /dev/null -w "khong secret: %{http_code}\n" http://127.0.0.1:3000/api/cron/cleanup; bash -c 'set -a; . /opt/glow/cron.env; /opt/glow/backup.sh' && rclone ls b2:glow-backups
```
Đúng khi:
- dòng đầu có `"job":"cleanup"`;
- `khong secret: 401`;
- trên B2/R2 có file `db-….dump.age` và `uploads-….tar.gz.age`.

---

# PHẦN 3 — Ngày chuyển chính thức

Giờ ít khách (vd 22:00 Yangon), khoảng 30–60 phút. Báo nhân viên không tạo đơn, không nhập kho trong lúc chuyển.

**14.** Admin **Vercel** (`https://glow-mm.vercel.app/admin`) → **Cài đặt** → **bỏ chọn "Nhận đơn trên web"** → Lưu.

**15.** Trên server, nhập lại chuỗi Neon (nếu đã thoát phiên SSH):
```bash
read -rs NEON_URL && export NEON_URL && echo "da nhan chuoi Neon"
```
Chạy lại **11a** → **11b** (số liệu phải khớp) → **11c** (bản chạy thật, không `--dry-run`) → **11d**.

**16.** Admin **server** (`https://tandcstore.com/admin`):
- kiểm tra "Nhận đơn trên web" đang **tắt** (dữ liệu vừa chép từ Vercel đã tắt ở bước 14);
- kiểm tra vài đơn mới nhất và tồn kho khớp Vercel;
- **bật "Nhận đơn trên web"** → Lưu;
- đặt thử 1 đơn COD → huỷ.

**17.** Báo Claude: **"đã chuyển xong"**. Claude đẩy bản cập nhật chuyển mọi link `glow-mm.vercel.app/…` (kể cả link CTV `?ref=`) sang `https://tandcstore.com/…`.

**18.** Cập nhật link ở Facebook page, Viber, danh thiếp sang `tandcstore.com`. Báo CTV dùng link mới.

**19.** Theo dõi 2–3 ngày:
```bash
docker logs tandc-app-1 --since 1h | tail -50; tail -20 /var/log/glow-cron.log; tail -5 /var/log/glow-backup.log; rclone ls b2:glow-backups | tail -4
```

**Quay lại khi có sự cố nặng:** trong vài giờ đầu, nếu **chưa có đơn mới trên server**:
- tắt nhận đơn trên server;
- bật lại nhận đơn trên Vercel;
- báo Claude bỏ chuyển hướng.

Nếu đã có đơn mới trên server thì **không quay lại**. Gửi log cho Claude để sửa.

---

# PHẦN 4 — Cập nhật hằng ngày (sau khi Claude báo đã merge `main`)
```bash
ssh vcm_aio@10.201.42.65
```
```bash
sudo su -
```
Backup trước, nếu Claude báo bản mới có thay đổi database:
```bash
bash -c 'set -a; . /opt/glow/cron.env; /opt/glow/backup.sh'
```
Kéo code, build, chạy lại. Migration tự chạy trước app; khách chỉ gián đoạn vài giây:
```bash
cd /var/www/tandc && git pull origin main && SOURCE_COMMIT=$(git rev-parse --short HEAD) docker compose -p tandc -f docker-compose.prod.yml --env-file .env.prod up -d --build && docker compose -p tandc ps -a && curl -s http://127.0.0.1:3000/api/health; echo
```
Dọn image cũ (mỗi vài lần cập nhật):
```bash
docker image prune -f
```

**Không bao giờ chạy:**
- `git clean -fd` (xoá `.env.prod`);
- `docker compose down -v`, `docker volume rm`/`prune` (xoá dữ liệu).

**Không đổi** `BETTER_AUTH_SECRET` và `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` trong `.env.prod`.

---

# Phụ lục — Lệnh tra cứu nhanh

| Việc | Lệnh |
|---|---|
| Trạng thái app | `docker compose -p tandc ps -a` |
| Log app | `docker logs tandc-app-1 --tail 100` |
| Log migration | `docker logs tandc-migrate-1` |
| Khởi động lại app | `docker restart tandc-app-1` |
| Vào DB | `docker exec -it tandc-db-1 psql -U glow -d glow` |
| Kiểm tra / nạp lại Nginx | `nginx -t && systemctl reload nginx` |
| Tắt site tandc (cứu web VCM) | `rm /etc/nginx/sites-enabled/tandc && nginx -t && systemctl reload nginx` |
| Dung lượng | `df -h /; docker system df` |
| Backup tay | `bash -c 'set -a; . /opt/glow/cron.env; /opt/glow/backup.sh'` |
| Khôi phục backup | xem [huong-dan-trien-khai-tandcstore.md](huong-dan-trien-khai-tandcstore.md) mục B7.7 |
