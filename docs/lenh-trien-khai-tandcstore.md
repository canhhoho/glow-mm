# Hướng dẫn đưa web T&C Cosmetics lên tandcstore.com

> Cập nhật 2026-10-30. Dành cho người **không chuyên IT**: chỉ cần copy–dán lệnh và bấm theo hướng dẫn.
> Tài liệu kỹ thuật chi tiết (cho người IT/Claude): [huong-dan-trien-khai-tandcstore.md](huong-dan-trien-khai-tandcstore.md).

---

## Cách đọc tài liệu này

Mỗi việc có **một nhãn** cho biết phải làm gì:

| Nhãn | Nghĩa là |
|---|---|
| 🖥️ **DÁN VÀO SERVER** | Copy **cả khung lệnh** → dán vào **cửa sổ đang kết nối server** → nhấn **Enter** → chờ tới khi hiện lại dòng `root@...#` |
| 💻 **DÁN VÀO MÁY TÍNH CỦA BẠN** | Mở **PowerShell** trên máy Windows (bấm Start, gõ `PowerShell`, Enter) → dán → Enter |
| 🖱️ **LÀM TRÊN TRANG WEB** | Không có lệnh. Mở trang web được nêu và bấm theo hướng dẫn |
| ⌨️ **MÀN HÌNH SẼ HỎI** | Lệnh dừng lại để hỏi bạn. Dán hoặc gõ đúng thứ được hỏi rồi Enter |
| ✅ **KẾT QUẢ ĐÚNG** | So màn hình của bạn với mô tả. Giống thì làm bước tiếp |
| ⛔ **DỪNG LẠI** | Không làm tiếp. Chụp màn hình (hoặc copy chữ trên màn hình) gửi Claude |
| 📖 **ĐỌC ĐỂ HIỂU** | Chỉ để biết, **không phải làm gì** |

**Mẹo copy–dán:**
- Rê chuột vào khung lệnh → bấm nút **Copy** ở góc khung (hoặc bôi đen toàn bộ khung rồi `Ctrl+C`).
- Dán vào cửa sổ server bằng **chuột phải** (hoặc `Ctrl+Shift+V`). `Ctrl+V` thường **không** dùng được ở đây.
- Khung có nhiều dòng thì dán **cả khung một lần**, không dán từng dòng.
- Khi màn hình hỏi mật khẩu hoặc chuỗi bí mật, dán vào mà **không thấy chữ hiện ra** là bình thường (để bảo mật). Cứ dán rồi Enter.
- Thấy các chữ `error`, `Error`, `failed`, `permission denied`, `not found` → ⛔ dừng lại, gửi Claude.

**3 quy tắc an toàn** (server đang chạy các web khác):
1. **Chỉ dán các lệnh trong tài liệu này.** Không tự gõ lệnh khác, không chạy lệnh người khác gửi qua chat/email.
2. **Làm đúng thứ tự từ trên xuống.** Không bỏ bước, trừ khi tài liệu ghi "bỏ qua nếu…".
3. Không hiểu, hoặc kết quả khác mô tả → ⛔ dừng, gửi Claude. Không đoán.

---

## Chuẩn bị trước (làm một lần)

🖱️ **LÀM TRÊN TRANG WEB / NHỜ NGƯỜI KHÁC:**
- [ ] Bật **OpenVPN** của công ty (như khi vào web VCM).
- [ ] Đăng nhập được: **inet.vn** (quản lý tên miền), **Google Cloud Console** (đăng nhập Google), **Neon** (database hiện tại), **GitHub**, **Vercel**.
- [ ] Tạo **GitHub token** (chìa khoá để server tải mã nguồn):
  GitHub → ảnh đại diện → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**:
  - Token name `server-tandc`; Expiration 1 năm.
  - Repository access: **Only select repositories** → chọn `glow-mm`.
  - Permissions → Repository permissions → **Contents: Read-only**.
  - Bấm **Generate** → copy token (chỉ hiện một lần) → lưu vào nơi an toàn (trình quản lý mật khẩu hoặc file ghi chú riêng).
- [ ] Tạo tài khoản **Backblaze B2** tại backblaze.com (dùng ở bước 13 để sao lưu).

---

# PHẦN 1 — Cài web lên server

## Bước 1. Vào server

💻 **DÁN VÀO MÁY TÍNH CỦA BẠN** (PowerShell):
```bash
ssh vcm_aio@10.201.42.65
```
⌨️ **MÀN HÌNH SẼ HỎI** mật khẩu của `vcm_aio` → gõ (không hiện chữ) → Enter.

🖥️ **DÁN VÀO SERVER** (chuyển sang quyền quản trị):
```bash
sudo su -
```
⌨️ Có thể hỏi lại mật khẩu → gõ → Enter.

✅ **KẾT QUẢ ĐÚNG:** dòng cuối có dạng `root@...:~#`. Từ đây, mọi lệnh 🖥️ đều dán vào cửa sổ này.

## Bước 2. Kiểm tra server (chỉ xem, không thay đổi gì)

📖 **ĐỌC ĐỂ HIỂU:** lệnh dưới chỉ **xem** thông tin, không thay đổi gì, nên không ảnh hưởng web VCM hay các app khác.

🖥️ **DÁN VÀO SERVER:**
```bash
echo "== CPU/RAM/DIA =="; nproc; free -h; df -h /
echo "== CONG DANG NGHE =="; ss -tlnp
echo "== SITE NGINX =="; ls -l /etc/nginx/sites-enabled/; grep -h -E "server_name|listen" /etc/nginx/sites-enabled/* | sed 's/^ *//' | sort -u
echo "== PM2 =="; pm2 ls 2>/dev/null || echo "(khong co pm2 cho root)"
echo "== DOCKER =="; docker --version 2>/dev/null && docker compose version && docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' && docker compose ls -a && docker volume ls && docker network ls || echo "(chua co Docker)"
echo "== MANG DOCKER =="; for n in $(docker network ls -q 2>/dev/null); do docker network inspect -f '{{.Name}} {{range .IPAM.Config}}{{.Subnet}} {{end}}' $n; done
echo "== ROUTE =="; ip -4 route
echo "== TEN SE DUNG (phai trong) =="; ls -d /var/www/tandc /opt/glow /var/log/glow-* 2>/dev/null; docker ps -a --format '{{.Names}}' 2>/dev/null | grep -i tandc; docker volume ls -q 2>/dev/null | grep -i tandc; echo "(het)"
echo "== CRONTAB =="; crontab -l 2>/dev/null || echo "(trong)"
echo "== KHAC =="; nginx -v; certbot --version; timedatectl | grep "Time zone"
echo "== RA INTERNET =="; for u in https://github.com https://registry.npmjs.org https://registry-1.docker.io/v2/ https://binaries.prisma.sh https://acme-v02.api.letsencrypt.org/directory https://oauth2.googleapis.com; do printf '%-50s ' "$u"; curl -s -o /dev/null -m 10 -w '%{http_code}\n' "$u" || echo LOI; done
```

⛔ **DỪNG LẠI — bước này LUÔN phải dừng:** bôi đen **toàn bộ** chữ hiện ra (từ `== CPU/RAM/DIA ==` đến hết), copy rồi gửi cho Claude.
Claude sẽ kiểm tra cổng 3000 còn trống, chưa có gì trùng tên, Docker đã có chưa, server ra được Internet và múi giờ. Sau đó Claude báo bạn **làm hay bỏ qua bước 3**, và có cần chỉnh gì không.

## Bước 3. Cài Docker — ⚠️ CHỈ LÀM KHI CLAUDE BẢO "CHƯA CÓ DOCKER"

📖 **ĐỌC ĐỂ HIỂU:** Docker là "hộp" chạy riêng web T&C, không trộn với app khác. Nếu server **đã có Docker** (app khác đang dùng) thì **bỏ qua cả bước này**, vì lệnh bên dưới khởi động lại Docker và làm các app khác bị gián đoạn.

🖥️ **DÁN VÀO SERVER:**
```bash
curl -fsSL https://get.docker.com | sh && systemctl enable --now docker && docker compose version
```
```bash
test -e /etc/docker/daemon.json && cat /etc/docker/daemon.json || (echo '{"log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"3"}}' > /etc/docker/daemon.json && systemctl restart docker && echo OK)
```
✅ **KẾT QUẢ ĐÚNG:** có dòng `Docker Compose version v2...` và chữ `OK`. Nếu thay vì `OK` lại hiện nội dung một file cấu hình → gửi Claude xem.

## Bước 4. Tải mã nguồn về server

🖥️ **DÁN VÀO SERVER:**
```bash
git config --global credential.helper store && mkdir -p /var/www && cd /var/www && git clone https://github.com/canhhoho/glow-mm.git tandc
```
⌨️ **MÀN HÌNH SẼ HỎI:**
- `Username`: gõ `canhhoho` → Enter.
- `Password`: **dán GitHub token** (đã tạo ở phần Chuẩn bị) → Enter. Không hiện chữ là bình thường.

✅ **KẾT QUẢ ĐÚNG:** có dòng `Receiving objects: 100%` và không có chữ `fatal`.

## Bước 5. Tạo file cấu hình (chỉ làm MỘT lần)

📖 **ĐỌC ĐỂ HIỂU:** file `.env.prod` chứa mật khẩu database và các "chìa khoá" bí mật của web. Lệnh dưới **tự tạo** các chìa khoá ngẫu nhiên, bạn không cần nghĩ ra. Nếu file đã có, lệnh **không ghi đè**, nên lỡ chạy lại cũng an toàn.

🖥️ **DÁN VÀO SERVER:**
```bash
cd /var/www/tandc && test -e .env.prod && echo "DA CO .env.prod - KHONG TAO LAI" || { cat > .env.prod <<EOF
POSTGRES_PASSWORD=$(openssl rand -hex 24)
APP_URL=https://tandcstore.com
BETTER_AUTH_SECRET=$(openssl rand -base64 32)
CRON_SECRET=$(openssl rand -hex 24)
NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=$(openssl rand -base64 32)
DATABASE_POOL_MAX=20
EMAIL_DRIVER=none
EOF
chmod 600 .env.prod && echo "DA TAO .env.prod"; }
```
✅ **KẾT QUẢ ĐÚNG:** dòng `DA TAO .env.prod`.

**Điền thông tin Google, Facebook, Viber:**

🖱️ **LÀM TRÊN TRANG WEB** trước: mở **Vercel** → project `glow-mm` → **Settings** → **Environment Variables** → xem giá trị của `GOOGLE_CLIENT_ID`, `FB_PAGE_USERNAME`, `VIBER_CHAT_URI`.
- Vercel thường **không cho xem** `GOOGLE_CLIENT_SECRET`. Khi đó vào **Google Cloud Console** → **Google Auth Platform** → **Clients** → bấm vào client web đang dùng → **Add secret** → copy secret mới. Secret cũ vẫn chạy cho Vercel, không ảnh hưởng gì.

🖥️ **DÁN VÀO SERVER** (lệnh sẽ hỏi từng giá trị):
```bash
cd /var/www/tandc && setv() { grep -v "^$1=" .env.prod > .env.tmp; printf '%s=%s\n' "$1" "$2" >> .env.tmp; mv .env.tmp .env.prod; chmod 600 .env.prod; } && read -p "Dan GOOGLE_CLIENT_ID roi Enter: " V1 && read -rsp "Dan GOOGLE_CLIENT_SECRET roi Enter (khong hien chu): " V2 && echo && read -p "Dan FB_PAGE_USERNAME (khong co thi Enter): " V3 && read -p "Dan VIBER_CHAT_URI (khong co thi Enter): " V4 && setv GOOGLE_CLIENT_ID "$V1" && setv GOOGLE_CLIENT_SECRET "$V2" && setv FB_PAGE_USERNAME "$V3" && setv VIBER_CHAT_URI "$V4" && echo "XONG" && grep -c . .env.prod
```
⌨️ **MÀN HÌNH SẼ HỎI** lần lượt 4 câu → dán từng giá trị → Enter.
✅ **KẾT QUẢ ĐÚNG:** chữ `XONG` và số `11`.

**Lưu dự phòng file này.** Mất file thì khách bị đăng xuất và phải làm lại nhiều thứ.

🖥️ **DÁN VÀO SERVER:**
```bash
cat /var/www/tandc/.env.prod
```
→ Bôi đen 11 dòng hiện ra, copy, lưu vào **trình quản lý mật khẩu** hoặc file ghi chú bảo mật của bạn. **Không gửi nội dung này cho Claude hay bất kỳ ai.**

## Bước 6. Cài đặt và chạy web

🖥️ **DÁN VÀO SERVER:**
```bash
cd /var/www/tandc && SOURCE_COMMIT=$(git rev-parse --short HEAD) docker compose -p tandc -f docker-compose.prod.yml --env-file .env.prod up -d --build
```
📖 **ĐỌC ĐỂ HIỂU:** lần đầu mất **5–15 phút**, màn hình chạy rất nhiều chữ. Đó là bình thường. Chờ tới khi hiện lại `root@...#`.

🖥️ **DÁN VÀO SERVER** (kiểm tra):
```bash
docker compose -p tandc ps -a; curl -s http://127.0.0.1:3000/api/health; echo
```
✅ **KẾT QUẢ ĐÚNG:**
- 3 dòng: `tandc-db-1` (healthy), `tandc-migrate-1` (**Exited (0)**), `tandc-app-1` (healthy);
- dòng cuối là `{"ok":true}`.

⛔ Nếu thấy `Exited (1)`, `unhealthy`, hoặc dòng cuối không phải `{"ok":true}` → dán lệnh dưới và gửi kết quả cho Claude:
```bash
docker logs tandc-migrate-1 --tail 30; docker logs tandc-app-1 --tail 50
```

---

# PHẦN 2 — Gắn tên miền, chép dữ liệu, chạy thử

📖 **ĐỌC ĐỂ HIỂU:** trong phần này web chạy trên `tandcstore.com` nhưng **chưa nhận đơn**. Khách vẫn mua trên web cũ (Vercel) cho tới **PHẦN 3**.

## Bước 7. Trỏ tên miền về server

💻 **DÁN VÀO MÁY TÍNH CỦA BẠN** (PowerShell), để lấy địa chỉ IP công cộng (dùng chung với web VCM):
```bash
nslookup cons.viettelconstructionmyanmar.com
```
✅ Ghi lại địa chỉ ở dòng **`Address:` cuối cùng** (dạng `123.45.67.89`). Từ đây gọi là **IP CÔNG CỘNG**.

🖱️ **LÀM TRÊN TRANG WEB inet.vn:**
1. Đăng nhập inet.vn → **Tên miền của tôi** → `tandcstore.com` → **Quản lý DNS** (có thể tên là "Cấu hình DNS").
2. Nếu đã có bản ghi với Host là `@` hoặc `www` thì **xoá**.
3. Thêm 2 bản ghi:

   | Loại (Type) | Tên (Host) | Giá trị (Value) | TTL |
   |---|---|---|---|
   | A | `@` | IP CÔNG CỘNG | 300 |
   | A | `www` | IP CÔNG CỘNG | 300 |

4. Lưu. Chờ **10–30 phút**.

💻 **DÁN VÀO MÁY TÍNH CỦA BẠN** (kiểm tra sau khi chờ):
```bash
nslookup tandcstore.com
```
✅ **KẾT QUẢ ĐÚNG:** dòng `Address:` cuối là **IP CÔNG CỘNG**. Chưa đúng thì chờ thêm 15 phút rồi thử lại.

## Bước 8. Bật HTTPS (ổ khoá) cho tandcstore.com

📖 **ĐỌC ĐỂ HIỂU:** bước này tạo **một file cấu hình riêng** cho tandcstore.com trong Nginx (phần mềm đang phục vụ web VCM), không sửa gì của web VCM. Mỗi lệnh đều tự kiểm tra cấu hình (`nginx -t`) trước khi áp dụng.

🖥️ **DÁN VÀO SERVER** (8a — cấu hình tạm):
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
ln -sf /etc/nginx/sites-available/tandc /etc/nginx/sites-enabled/tandc && nginx -t && systemctl reload nginx && echo "BUOC 8a OK"
```
✅ **KẾT QUẢ ĐÚNG:** có `syntax is ok`, `test is successful` và `BUOC 8a OK`.

🖥️ **DÁN VÀO SERVER** (8b — xin chứng chỉ HTTPS):
```bash
certbot certonly --nginx -d tandcstore.com -d www.tandcstore.com
```
⌨️ Hỏi email → gõ email của bạn. Hỏi đồng ý điều khoản → gõ `Y`. Hỏi có nhận tin không → gõ `N`.
✅ **KẾT QUẢ ĐÚNG:** dòng `Successfully received certificate`.
⛔ Báo lỗi → gửi Claude. Thường là do bước 7 chưa xong, hoặc tường lửa chưa mở cho tên miền mới.

🖥️ **DÁN VÀO SERVER** (8c — cấu hình chính thức):
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
nginx -t && systemctl reload nginx && echo "BUOC 8c OK"
```
✅ **KẾT QUẢ ĐÚNG:** `test is successful` và `BUOC 8c OK`.
⛔ Không thấy `BUOC 8c OK` → **dán ngay lệnh dưới** để tắt site mới (chắc chắn web VCM không bị ảnh hưởng), rồi gửi màn hình cho Claude:
```bash
rm -f /etc/nginx/sites-enabled/tandc && nginx -t && systemctl reload nginx && echo "DA TAT SITE TANDC"
```

🖥️ **DÁN VÀO SERVER** (kiểm tra):
```bash
curl -s https://tandcstore.com/api/health; echo; curl -sI http://www.tandcstore.com | grep -i location; curl -sI https://cons.viettelconstructionmyanmar.com | head -1
```
✅ **KẾT QUẢ ĐÚNG:**
- `{"ok":true}`;
- `location: https://tandcstore.com/`;
- dòng `HTTP/...` của web VCM có số `200`, `301` hoặc `302`, tức web VCM vẫn chạy bình thường.

🖱️ Mở trình duyệt vào `https://tandcstore.com`: thấy trang chủ và có **ổ khoá** cạnh địa chỉ. Lúc này chưa có sản phẩm là bình thường, bước 11 mới chép dữ liệu.

## Bước 9. Kiểm tra web nhận đúng địa chỉ của khách

📖 **ĐỌC ĐỂ HIỂU:** web chặn người đoán mật khẩu dựa trên địa chỉ mạng của từng khách. Cần chắc web thấy địa chỉ thật của khách, không phải địa chỉ của máy tường lửa công ty.

🖱️ Dùng **điện thoại, tắt Wi-Fi, bật 4G** → mở `https://tandcstore.com`.

🖥️ **DÁN VÀO SERVER:**
```bash
tail -3 /var/log/nginx/access.log | cut -d' ' -f1
```
⛔ **Gửi kết quả cho Claude** (3 dòng địa chỉ). Claude sẽ báo là đúng hay cần chỉnh; nếu cần chỉnh, Claude gửi lệnh riêng.

## Bước 10. Cho phép đăng nhập Google trên tên miền mới

🖱️ **LÀM TRÊN TRANG WEB Google Cloud Console** (console.cloud.google.com):
1. Menu → **Google Auth Platform** → **Clients** → bấm vào client web đang dùng.
2. Mục **Authorized JavaScript origins** → **Add URI** → `https://tandcstore.com`
3. Mục **Authorized redirect URIs** → **Add URI** → `https://tandcstore.com/api/customer-auth/callback/google`
4. **Giữ nguyên** các dòng cũ (của `glow-mm.vercel.app`). Bấm **Save**.

## Bước 11. Chép dữ liệu thật sang server (bản chạy thử)

🖱️ **LÀM TRÊN TRANG WEB Neon** (console.neon.tech): chọn project → nhánh **production** → bấm **Connect** → **tắt** ô *Connection pooling* → bấm **Copy** chuỗi bắt đầu bằng `postgresql://`.

🖥️ **DÁN VÀO SERVER:**
```bash
mkdir -p /root/migrate && read -rsp "Dan chuoi Neon roi Enter (khong hien chu): " NEON_URL && export NEON_URL && echo && echo "DA NHAN"
```
⌨️ **MÀN HÌNH SẼ HỎI** → dán chuỗi Neon → Enter. ✅ Thấy `DA NHAN`.

🖥️ **DÁN VÀO SERVER** (11a — chép database, mất 1–5 phút):
```bash
docker run --rm -e NEON_URL -v /root/migrate:/out postgres:17.6-alpine sh -c 'pg_dump "$NEON_URL" --format=custom --no-owner --no-acl -f /out/neon.dump' && docker cp /root/migrate/neon.dump tandc-db-1:/tmp/neon.dump && docker exec tandc-db-1 pg_restore -U glow -d glow --clean --if-exists --no-owner --no-acl /tmp/neon.dump; echo "KET QUA=$?"
```
✅ **KẾT QUẢ ĐÚNG:** dòng cuối `KET QUA=0`.

🖥️ **DÁN VÀO SERVER** (11b — so số liệu web cũ và server mới):
```bash
Q='SELECT (SELECT count(*) FROM "Order") don_hang, (SELECT count(*) FROM "Product") san_pham, (SELECT count(*) FROM "user") tai_khoan, (SELECT coalesce(sum(qty),0) FROM "StockBalance") tong_ton'; echo "=== WEB CU (Neon) ==="; docker run --rm -e NEON_URL postgres:17.6-alpine sh -c "psql \"\$NEON_URL\" -c '$Q'"; echo "=== SERVER MOI ==="; docker exec tandc-db-1 psql -U glow -d glow -c "$Q"
```
✅ **KẾT QUẢ ĐÚNG:** hai bảng **WEB CU** và **SERVER MOI** có **cùng các con số**. Khác → ⛔ gửi Claude.

🖥️ **DÁN VÀO SERVER** (11c — chép ảnh sản phẩm và biên lai; lần này chỉ chạy thử, chưa ghi gì):
```bash
cd /var/www/tandc && set -a && . ./.env.prod && set +a && docker run --rm --user 1001:1001 --network tandc_default -v tandc_uploads:/app/storage -e LOCAL_STORAGE_DIR=/app/storage -e DATABASE_URL="postgresql://glow:${POSTGRES_PASSWORD}@db:5432/glow" tandc-migrate node scripts/migrate-blob-to-local.mjs --dry-run
```
✅ Thấy số lượng file sẽ chép. Sau đó 🖥️ **DÁN VÀO SERVER** (chép thật):
```bash
cd /var/www/tandc && set -a && . ./.env.prod && set +a && docker run --rm --user 1001:1001 --network tandc_default -v tandc_uploads:/app/storage -e LOCAL_STORAGE_DIR=/app/storage -e DATABASE_URL="postgresql://glow:${POSTGRES_PASSWORD}@db:5432/glow" tandc-migrate node scripts/migrate-blob-to-local.mjs
```
✅ **KẾT QUẢ ĐÚNG:** báo đã chép xong, **không còn file lỗi**.
- Có file lỗi → dán lại đúng lệnh vừa rồi, nó chỉ chép phần còn thiếu.
- Vẫn lỗi → ⛔ gửi Claude.

🖥️ **DÁN VÀO SERVER** (11d — khởi động lại web):
```bash
docker restart tandc-app-1 && sleep 20 && curl -s http://127.0.0.1:3000/api/health; echo
```
✅ `{"ok":true}`.

🖱️ **LÀM NGAY — RẤT QUAN TRỌNG (11e):** vào `https://tandcstore.com/admin` → đăng nhập bằng **tài khoản admin đang dùng trên web cũ** → **Cài đặt** → **bỏ chọn "Nhận đơn trên web"** → **Lưu**.

📖 **ĐỌC ĐỂ HIỂU:** dữ liệu vừa chép mang theo cài đặt "đang nhận đơn". Nếu không tắt, khách lạc vào tandcstore.com có thể đặt đơn, và đơn đó sẽ **mất** khi chép dữ liệu lần cuối ở PHẦN 3.

## Bước 12. Chạy thử (trên trình duyệt)

🖱️ Mở **cửa sổ ẩn danh** (`Ctrl+Shift+N` trên Chrome) và kiểm tra:
- [ ] `https://tandcstore.com`: trang chủ, ảnh sản phẩm, banner hiện đủ. `https://tandcstore.com/en`: hiện tiếng Anh.
- [ ] `https://www.tandcstore.com` tự chuyển về `https://tandcstore.com`.
- [ ] **Đăng ký** bằng một số điện thoại thử → vào được trang tài khoản → **đăng xuất** → **đăng nhập** lại bằng số đó.
- [ ] Trang đăng nhập có dòng hướng dẫn "quên mật khẩu thì nhắn shop"; nút **Google** đăng nhập được.
- [ ] `https://tandcstore.com/admin`: đăng nhập được cả 3 loại tài khoản nhân viên; mở thử 1 đơn có biên lai chuyển khoản và xem được ảnh biên lai.
- [ ] Admin → **Tài khoản khách** → tìm số thử → **đặt lại mật khẩu** → đăng nhập bằng mật khẩu mới được.
- [ ] Cổng cộng tác viên `https://tandcstore.com/ctv` đăng nhập được.
- [ ] Bấm thanh toán → web báo **tạm ngừng nhận đơn**. Đúng như vậy, vì đang tắt nhận đơn.

🖥️ **DÁN VÀO SERVER** (kiểm tra bảo mật):
```bash
curl -sI https://tandcstore.com/en | grep -ciE "strict-transport|content-security"; ss -tlnp | grep -E ':(3000|5432)\b'
```
✅ **KẾT QUẢ ĐÚNG:**
- số `2`;
- dòng cổng `3000` có `127.0.0.1:3000`, **không** có `0.0.0.0:3000`.

Khác → ⛔ gửi Claude.

## Bước 13. Tự chạy việc định kỳ + sao lưu hằng đêm

📖 **ĐỌC ĐỂ HIỂU:** web cần vài việc tự chạy định kỳ: nhả hàng giữ quá hạn, huỷ đơn COD quá hạn, cảnh báo tồn kho, dọn dữ liệu tạm. Ngoài ra web **sao lưu database và ảnh mỗi đêm** lên Backblaze B2 (ngoài server, có mã hoá), nên lỡ mất server vẫn khôi phục được.

🖱️ **LÀM TRÊN TRANG WEB Backblaze** (backblaze.com, đăng nhập):
1. **B2 Cloud Storage** → **Buckets** → **Create a Bucket**:
   - tên `glow-backups-<tên-tuỳ-ý>` (tên phải là duy nhất trên toàn hệ thống);
   - chọn **Private** → Create.

   Ghi lại tên bucket.
2. **Application Keys** → **Add a New Application Key**:
   - Name: `server-tandc`;
   - Allow access to: **chỉ bucket vừa tạo**;
   - Type: **Read and Write** → Create.
3. Copy **keyID** và **applicationKey** (chỉ hiện một lần).

🖥️ **DÁN VÀO SERVER** (13a — cài công cụ, chép script):
```bash
apt install -y rclone age && mkdir -p /opt/glow && cp /var/www/tandc/ops/backup.sh /var/www/tandc/ops/restore.sh /opt/glow/ && chmod 700 /opt/glow/*.sh && touch /var/log/glow-cron.log /var/log/glow-backup.log && echo "BUOC 13a OK"
```
✅ `BUOC 13a OK`.

🖥️ **DÁN VÀO SERVER** (13b — kết nối Backblaze; lệnh sẽ hỏi 3 thứ):
```bash
read -p "Dan keyID roi Enter: " K && read -rsp "Dan applicationKey roi Enter (khong hien chu): " S && echo && read -p "Dan TEN BUCKET roi Enter: " BUCKET && rclone config create b2 b2 account="$K" key="$S" >/dev/null && rclone lsd b2: && echo "RCLONE_REMOTE=b2:$BUCKET" > /root/glow-bucket.txt && echo "BUOC 13b OK"
```
✅ Thấy tên bucket của bạn trong danh sách, và dòng `BUOC 13b OK`.

🖥️ **DÁN VÀO SERVER** (13c — tạo khoá mã hoá backup và file cấu hình):
```bash
age-keygen -o /root/glow-backup.key 2>/dev/null; AGE_PUB=$(grep -o 'age1[0-9a-z]*' /root/glow-backup.key | head -1); CS=$(grep ^CRON_SECRET= /var/www/tandc/.env.prod | cut -d= -f2-); { echo "CRON_SECRET=$CS"; echo "DB_CONTAINER=tandc-db-1"; echo "UPLOADS_VOLUME=tandc_uploads"; cat /root/glow-bucket.txt; echo "AGE_RECIPIENT=$AGE_PUB"; } > /opt/glow/cron.env && chmod 600 /opt/glow/cron.env && echo "=== KHOA GIAI MA BACKUP - LUU LAI ===" && cat /root/glow-backup.key
```
⌨️ **VIỆC CỦA BẠN:**
- Bôi đen **3 dòng** dưới `=== KHOA GIAI MA BACKUP - LUU LAI ===` (bắt đầu bằng `# created`, `# public key`, `AGE-SECRET-KEY-...`).
- Copy rồi lưu vào **trình quản lý mật khẩu** với tên "Khoá backup T&C".
- **Không có khoá này thì không mở được bản backup.** Không gửi cho ai.

Sau khi đã lưu chắc chắn, 🖥️ **DÁN VÀO SERVER** để xoá khoá khỏi server cho an toàn:
```bash
rm -f /root/glow-backup.key /root/glow-bucket.txt && echo "DA XOA KHOA KHOI SERVER"
```

🖥️ **DÁN VÀO SERVER** (13d — kiểm tra múi giờ server):
```bash
timedatectl | grep "Time zone"
```
- Nếu **không** phải `Etc/UTC` hoặc `UTC` → ⛔ **dừng**, gửi Claude để đổi giờ trong lịch chạy cho khớp. **Không** tự đổi múi giờ server, vì ảnh hưởng web VCM.
- Nếu là UTC → làm tiếp.

🖥️ **DÁN VÀO SERVER** (13e — đặt lịch tự chạy, giữ nguyên lịch cũ của app khác):
```bash
(crontab -l 2>/dev/null; grep -v '^#' /var/www/tandc/ops/cron.example | grep -v '^\s*$') | crontab - && crontab -l | grep -c glow
```
✅ **KẾT QUẢ ĐÚNG:** số `5`.

🖥️ **DÁN VÀO SERVER** (13f — chạy thử ngay):
```bash
bash -c 'set -a; . /opt/glow/cron.env; curl -fsS -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/api/cron/cleanup'; echo; curl -s -o /dev/null -w "khong co chia khoa: %{http_code}\n" http://127.0.0.1:3000/api/cron/cleanup; bash -c 'set -a; . /opt/glow/cron.env; /opt/glow/backup.sh' && bash -c 'set -a; . /opt/glow/cron.env; rclone ls "$RCLONE_REMOTE"'
```
✅ **KẾT QUẢ ĐÚNG:**
- dòng đầu có chữ `"job":"cleanup"`;
- có dòng `khong co chia khoa: 401`;
- cuối cùng liệt kê 2 file có tên bắt đầu bằng `db-` và `uploads-`.

⛔ Khác → gửi Claude.

🎉 **Hết PHẦN 2.** Web đã sẵn sàng. Chọn ngày giờ làm PHẦN 3 và báo Claude trước.

---

# PHẦN 3 — Ngày chuyển chính thức

📖 **ĐỌC ĐỂ HIỂU:** tắt nhận đơn trên web cũ → chép dữ liệu mới nhất sang server → bật nhận đơn trên server. Mất khoảng **30–60 phút**, nên làm vào giờ ít khách (vd 22:00 giờ Yangon). Báo nhân viên **không tạo đơn, không nhập kho** trong lúc này.

**Bước 14.** 🖱️ Vào web cũ `https://glow-mm.vercel.app/admin` → **Cài đặt** → **bỏ chọn "Nhận đơn trên web"** → **Lưu**.

**Bước 15.** Làm lại **bước 1** (vào server), rồi 🖥️ **DÁN VÀO SERVER** để nhập chuỗi Neon:
```bash
read -rsp "Dan chuoi Neon roi Enter (khong hien chu): " NEON_URL && export NEON_URL && echo && echo "DA NHAN"
```
Rồi làm lại lần lượt:
- **11a**;
- **11b** (số liệu phải giống nhau);
- **11c** (chỉ chạy lệnh **chép thật**);
- **11d**.

**Bước 16.** 🖱️ Vào `https://tandcstore.com/admin`:
- [ ] Mở vài đơn mới nhất, kiểm tra giống web cũ.
- [ ] **Cài đặt** → **chọn "Nhận đơn trên web"** → **Lưu**.
- [ ] Đặt thử 1 đơn COD (cửa sổ ẩn danh, đăng nhập bằng số thử), rồi vào admin **huỷ** đơn đó.

**Bước 17.** Nhắn Claude: **"đã chuyển xong"**. Claude sẽ cài để web cũ `glow-mm.vercel.app` (kể cả link cộng tác viên) tự chuyển sang `tandcstore.com`.

**Bước 18.** Đổi link ở trang Facebook, Viber, danh thiếp sang `tandcstore.com`. Báo cộng tác viên dùng link mới.

**Bước 19.** Trong 2–3 ngày đầu, mỗi sáng làm bước 1 rồi 🖥️ **DÁN VÀO SERVER** lệnh dưới. Thấy chữ `error` thì gửi Claude:
```bash
docker compose -p tandc ps -a; docker logs tandc-app-1 --since 24h 2>&1 | grep -ic error; tail -3 /var/log/glow-backup.log
```

**Nếu có sự cố nặng ngay sau khi chuyển:** ⛔ báo Claude ngay. Trong vài giờ đầu, nếu **chưa có đơn mới** trên server thì có thể quay về web cũ: tắt nhận đơn trên tandcstore.com, bật lại trên glow-mm.vercel.app.

---

# PHẦN 4 — Cập nhật web khi Claude báo có bản mới

Claude sẽ nhắn: *"đã merge main, có/không thay đổi database"*. Bạn làm:

1. Làm **bước 1** (vào server).
2. Nếu Claude báo **có thay đổi database** → 🖥️ **DÁN VÀO SERVER** để sao lưu trước:
   ```bash
   bash -c 'set -a; . /opt/glow/cron.env; /opt/glow/backup.sh' && echo "DA SAO LUU"
   ```
3. 🖥️ **DÁN VÀO SERVER** để cập nhật (mất 3–10 phút, khách chỉ bị gián đoạn vài giây):
   ```bash
   cd /var/www/tandc && git pull origin main && SOURCE_COMMIT=$(git rev-parse --short HEAD) docker compose -p tandc -f docker-compose.prod.yml --env-file .env.prod up -d --build && docker compose -p tandc ps -a && curl -s http://127.0.0.1:3000/api/health; echo
   ```
   ✅ **KẾT QUẢ ĐÚNG:**
   - `tandc-migrate-1` **Exited (0)**;
   - `tandc-app-1` healthy;
   - dòng cuối `{"ok":true}`.

   Khác → ⛔ gửi Claude.
4. 🖱️ Mở `https://tandcstore.com`, nhấn `Ctrl+Shift+R` để xem bản mới.
5. Mỗi tháng một lần, 🖥️ **DÁN VÀO SERVER** để dọn ổ đĩa:
   ```bash
   docker image prune -f
   ```

---

# 📖 Phụ lục A — Những lệnh KHÔNG BAO GIỜ được chạy

| Lệnh | Vì sao |
|---|---|
| `git clean -fd` | Xoá file cấu hình `.env.prod` |
| `docker compose down -v`, `docker volume rm …`, `docker volume prune` | **Xoá toàn bộ đơn hàng, tồn kho, ảnh** |
| `docker system prune`, `docker network prune` | Có thể xoá dữ liệu hoặc mạng của **app khác** |
| `systemctl restart docker` | Khởi động lại **mọi** app chạy bằng Docker trên server |
| Sửa/xoá file trong `/etc/nginx/sites-enabled/` (trừ `tandc`) | Làm hỏng web VCM hoặc app khác |
| Đổi múi giờ, tường lửa (`ufw`), SSH, PostgreSQL, PM2 của server | Ảnh hưởng app khác |
| Sửa `BETTER_AUTH_SECRET`, `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` trong `.env.prod` | Khách bị đăng xuất, hoặc bấm nút bị lỗi |

# 📖 Phụ lục B — Vì sao không ảnh hưởng các app khác trên server

| Thứ | Web T&C dùng | Ghi chú |
|---|---|---|
| Cổng 80/443 | Không chiếm: Nginx sẵn có nhận rồi chuyển vào | Chỉ thêm 1 file riêng `/etc/nginx/sites-available/tandc` |
| Cổng của web | `127.0.0.1:3000`, chỉ dùng trong máy | Bước 2 kiểm tra trước |
| Database | Riêng, nằm trong Docker, không mở cổng | Không đụng database của app khác |
| Phần mềm Node.js | Nằm trong Docker | Không đụng Node/PM2 của app khác |
| Tên gọi | Mọi thứ bắt đầu bằng `tandc`; thư mục `/var/www/tandc`, `/opt/glow` | Bước 2 kiểm tra chưa có ai dùng |
| Lịch tự chạy | **Thêm** 5 dòng, giữ nguyên lịch cũ | Bước 13e |
| CPU/RAM | Lúc cài đặt dùng khoảng 2–3 GB RAM trong vài phút | Server có 48 GB, dư dùng |

# 📖 Phụ lục C — Lệnh tra cứu nhanh (dán vào server khi Claude yêu cầu)

| Việc | Lệnh |
|---|---|
| Web có đang chạy không | `docker compose -p tandc ps -a` |
| Xem lỗi gần đây của web | `docker logs tandc-app-1 --tail 100` |
| Khởi động lại web | `docker restart tandc-app-1` |
| Tắt site tandc (cứu web VCM khi có sự cố) | `rm -f /etc/nginx/sites-enabled/tandc && nginx -t && systemctl reload nginx` |
| Dung lượng ổ đĩa | `df -h /; docker system df` |
| Sao lưu ngay | `bash -c 'set -a; . /opt/glow/cron.env; /opt/glow/backup.sh'` |
