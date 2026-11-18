# Hướng dẫn đưa web T&C Cosmetics lên tandcstore.com

> **Cập nhật 14/11/2026:** đăng nhập **Google đã gỡ khỏi code** (làm lại sau) — bỏ qua mọi bước/mục kiểm tra về Google (OAuth, redirect URI, `GOOGLE_CLIENT_*`). Khách quên mật khẩu tự gửi yêu cầu ở `/forgot-password`, admin Xác nhận ở Tài khoản → Khách hàng (có migration mới `20261114120000_password_reset_requests` — cần backup trước khi cập nhật server). Xem DEPLOY.md §1.4.

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

## Bước 7. Trỏ tên miền về server — ✅ ĐÃ LÀM XONG (2026-10-30, cùng Claude)

📖 **ĐỌC ĐỂ HIỂU — đã làm gì:**
- **IP CÔNG CỘNG** của server (dùng chung với web VCM) là **`65.18.117.228`**.
- Trên inet.vn đã thêm 2 bản ghi, kiểm tra thấy cả máy chủ DNS của inet lẫn Google đều trả đúng IP:

  | Tên | Loại | Nội dung | TTL | Bảo vệ |
  |---|---|---|---|---|
  | `@` | A | `65.18.117.228` | 5 phút | **Tắt** (Chỉ DNS) |
  | `www` | A | `65.18.117.228` | 5 phút | **Tắt** (Chỉ DNS) |

- **Giữ nguyên** 5 bản ghi của **hộp thư email** đang dùng trên tên miền (dịch vụ oxmail của inet): `@` MX `gw.oxmail.vn`, `@` TXT `v=spf1…`, `default._domainkey` TXT, `_dmarc` TXT, `mail` CNAME. **Không bao giờ xoá các bản ghi này**, nếu xoá thì email @tandcstore.com ngừng chạy.
- Ô **"Bảo vệ"** (OneShield của inet) phải để **Tắt**. Nếu bật, khách sẽ đi vòng qua máy chủ trung gian của inet: web không thấy IP thật của khách, chứng chỉ HTTPS ở bước 8 cũng phải làm cách khác.

📖 **Khi cần sửa bản ghi sau này:** đăng nhập **inet.vn** → bấm tên tài khoản (góc phải) → **Danh sách dịch vụ** (mở trang **OnePortal**) → dòng `tandcstore.com` loại **Tên miền** → nút **Bản ghi** → trang **Bản ghi DNS tandcstore.com**. Tại đây:
- thêm bản ghi mới bằng nút **Thêm bản ghi** (form gồm Loại, Tên, TTL, Trạng thái Bảo vệ, Địa chỉ IP);
- sửa bản ghi có sẵn bằng **Chỉnh sửa** ở cuối dòng.

💻 **DÁN VÀO MÁY TÍNH CỦA BẠN** (kiểm tra bất cứ lúc nào):
```bash
nslookup tandcstore.com 8.8.8.8
```
✅ **KẾT QUẢ ĐÚNG:** dòng `Address:` sau dòng `Name:` là `65.18.117.228`.

⚠️ **Trước khi làm xong bước 8:** ai mở `tandcstore.com` có thể thấy **web VCM** hoặc **cảnh báo chứng chỉ**. Lý do: server chưa có cấu hình cho tên miền mới, nên Nginx trả trang mặc định. Không ảnh hưởng gì; nên làm bước 1–8 sớm để hết tình trạng này.

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
# Giới hạn tần suất theo IP (tên vùng có tiền tố tandc_ để không trùng cấu hình web VCM).
limit_req_zone $binary_remote_addr zone=tandc_auth:10m rate=30r/m;
limit_req_zone $binary_remote_addr zone=tandc_all:10m  rate=20r/s;

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

    server_tokens off;
    client_max_body_size 10M;
    limit_req_status 429;

    # Dùng chung cho mọi location bên dưới.
    proxy_http_version 1.1;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host  $host;
    proxy_buffering off;
    proxy_read_timeout 120s;

    # Tác vụ định kỳ chỉ gọi từ chính server (127.0.0.1:3000), không mở ra Internet.
    location ^~ /api/cron/ {
        return 404;
    }

    # Đăng nhập / đăng ký / quên mật khẩu: tối đa ~30 lần/phút/IP (cho phép dồn 20).
    location ~ ^/(api/(auth|customer-auth)/|admin/login|ctv/login|(en/|vi/)?(login|register|track)) {
        limit_req zone=tandc_auth burst=20 nodelay;
        proxy_pass http://127.0.0.1:3000;
    }

    location / {
        limit_req zone=tandc_all burst=100 nodelay;
        proxy_pass http://127.0.0.1:3000;
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

## Bước 10. ~~Cho phép đăng nhập Google trên tên miền mới~~ — BỎ QUA (Google đã gỡ khỏi code)

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

🖥️ **DÁN VÀO SERVER** (11f — đổi đuôi email đăng nhập `@glow.local` → `@tandcstore.com` cho mọi tài khoản):
```bash
docker exec tandc-db-1 psql -U glow -d glow -v ON_ERROR_STOP=1 -c "BEGIN; UPDATE \"user\" SET email = replace(email, '@glow.local', '@tandcstore.com'), \"updatedAt\" = now() WHERE email LIKE '%@glow.local'; INSERT INTO \"AuditLog\" (id, action, entity, data, \"createdAt\") VALUES (gen_random_uuid()::text, 'user.bulkEmailDomain', 'User', '{\"from\":\"@glow.local\",\"to\":\"@tandcstore.com\"}'::jsonb, now()); COMMIT;" && docker exec tandc-db-1 psql -U glow -d glow -c "SELECT email, role, active FROM \"user\" WHERE role <> 'CUSTOMER' ORDER BY role, email;"
```
✅ **KẾT QUẢ ĐÚNG:** có dòng `UPDATE <số>` rồi `COMMIT`, bảng cuối toàn email `@tandcstore.com`. Từ giờ đăng nhập bằng `admin@tandcstore.com` (mật khẩu **giữ nguyên**).
- Báo lỗi `duplicate key` → đã có sẵn tài khoản `@tandcstore.com` trùng tên; không có gì bị đổi → ⛔ gửi Claude.
- Email nội bộ của khách đăng ký bằng SĐT (`…@phone.glow.invalid`) **không** bị đổi — đúng như vậy.

📖 **ĐỌC ĐỂ HIỂU:** ở **bước 15** (ngày chuyển chính thức) dữ liệu được chép lại từ web cũ, **ghi đè** mọi thay đổi trên server — kể cả email và mật khẩu vừa đổi. Vì vậy sau bước 15 phải chạy lại **11f**, và nên **đổi mật khẩu sau bước 15** (đổi trước sẽ mất).

## Bước 12. Chạy thử (trên trình duyệt)

🖱️ Mở **cửa sổ ẩn danh** (`Ctrl+Shift+N` trên Chrome) và kiểm tra:
- [ ] `https://tandcstore.com`: trang chủ, ảnh sản phẩm, banner hiện đủ. `https://tandcstore.com/en`: hiện tiếng Anh.
- [ ] `https://www.tandcstore.com` tự chuyển về `https://tandcstore.com`.
- [ ] **Đăng ký** bằng một số điện thoại thử → vào được trang tài khoản → **đăng xuất** → **đăng nhập** lại bằng số đó.
- [ ] Trang đăng nhập có link **Quên mật khẩu?**; gửi yêu cầu → admin Xác nhận → đăng nhập được bằng mật khẩu mới. (Không còn nút Google.)
- [ ] `https://tandcstore.com/admin`: đăng nhập được cả 3 loại tài khoản nhân viên; mở thử 1 đơn chuyển khoản, kiểm tra nút **Đã nhận tiền**; khách không cần tải biên lai.
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
- **11d**;
- **11f** (đổi lại đuôi email sang `@tandcstore.com`).

**Bước 16.** 🖱️ Vào `https://tandcstore.com/admin` (đăng nhập bằng email `@tandcstore.com`):
- [ ] **Tài khoản của tôi** → đổi mật khẩu; **Cài đặt → Tài khoản → Nhân viên / Cộng tác viên** → đặt lại mật khẩu cho từng người, khoá tài khoản không dùng.
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

> **Từ 17/11/2026: deploy tự động.** Push/merge `main` → CI (`check` + `e2e`) xanh → job `release` gắn tag `release-YYYYMMDD-HHMM` (giờ UTC) → job `deploy` trên runner `tandc-myanmar` gọi `sudo -n /usr/local/sbin/tandc-deploy <tag> <sha>` → `ops/deploy.sh --yes` (sao lưu nếu có migration, build, migrate, chờ healthy, smoke). CI lỗi → không có tag, không deploy. Theo dõi ở GitHub → Actions → CI.
> - **Từ 18/11/2026:** merge PR (kiểu "Create a merge commit") khi CI của PR đã xanh → CI trên `main` không chạy lại `check`/`e2e`, chỉ gắn tag + deploy (~3 phút; job `changes` ghi link lần chạy PR đã dùng). `main` có commit khác ngoài PR / squash / rebase → chạy đầy đủ. Chỉ sửa tài liệu → không deploy.
> - **Deploy lỗi:** web thường vẫn chạy bản cũ (build lỗi) hoặc log job in lệnh quay lại. Gửi Claude log job `deploy`.
> - **Quay lại bản trước (không cần SSH):** Actions → CI → *Run workflow* → nhánh `main` → `rollback_tag` = tag trước (xem danh sách tag trên GitHub). Nếu job báo *"Quay về bản cũ hơn database"* → dừng, gửi Claude (không có cờ bỏ qua qua CI).
> - **An toàn:** runner (user `github-runner`) không có docker/sudo, chỉ được gọi đúng wrapper `ops/tandc-deploy` (cài bằng copy, root 755) theo `ops/sudoers-tandc-deploy`; wrapper chỉ nhận tag `release-*` thuộc lịch sử `origin/main` và trỏ đúng SHA CI đã test, chạy deploy.sh với môi trường sạch. Job deploy không checkout code.
> - **Cài một lần trên server** (thứ tự: backup → mirror → wrapper → thử quyền): xem mục 4.0 bên dưới. Khi đổi `ops/tandc-deploy` hoặc `ops/sudoers-tandc-deploy` phải cài lại bằng tay (cố ý).
> - Các bước làm tay bên dưới vẫn dùng được làm dự phòng.

### 4.0 Cài deploy tự động (một lần, root trên server)
🖥️ Lấy file từ nhánh đã push (không đổi thư mục mã nguồn), cài backup local + lịch chạy:
```bash
cd /var/www/tandc && git fetch --quiet origin && R=origin/main   # lần đầu: R=origin/dev
mkdir -p /opt/glow && chmod 700 /opt/glow
git show $R:ops/backup.sh > /opt/glow/backup.sh && git show $R:ops/restore.sh > /opt/glow/restore.sh && chmod 700 /opt/glow/*.sh
[ -f /opt/glow/cron.env ] || { CS=$(grep ^CRON_SECRET= .env.prod | cut -d= -f2-); printf 'CRON_SECRET=%s\nDB_CONTAINER=tandc-db-1\nUPLOADS_VOLUME=tandc_uploads\n' "$CS" > /opt/glow/cron.env; }
chmod 600 /opt/glow/cron.env && touch /var/log/glow-backup.log /var/log/glow-cron.log
bash -c 'set -a; . /opt/glow/cron.env; /opt/glow/backup.sh' && ls -l /var/backups/glow
```
✅ `Backup OK (local) …`. Lịch chạy: thêm dòng backup (và các job cron khác nếu chưa có) từ `ops/cron.example` vào `crontab -e` của root. Backup local **không** chống hỏng ổ — làm off-site (mục 13) sau.

🖥️ Mirror Alpine vào `.env.prod`, cất bản sửa tay Dockerfile rồi trả Dockerfile về bản git (container đang chạy không bị ảnh hưởng):
```bash
cd /var/www/tandc && grep -q '^ALPINE_MIRROR=' .env.prod || echo 'ALPINE_MIRROR=https://mirror.kku.ac.th/alpine' >> .env.prod
git diff -- Dockerfile > /root/dockerfile-mirror.patch && git checkout -- Dockerfile && git status --short --untracked-files=no
```
✅ Lệnh cuối không in gì.

🖥️ Cài wrapper + sudoers, kiểm cú pháp và quyền:
```bash
cd /var/www/tandc && T=$(mktemp -d) && git show $R:ops/tandc-deploy > $T/w && install -o root -g root -m 755 $T/w /usr/local/sbin/tandc-deploy
git show $R:ops/sudoers-tandc-deploy > $T/s && visudo -cf $T/s && install -o root -g root -m 440 $T/s /etc/sudoers.d/tandc-deploy; rm -rf "$T"
visudo -c && sudo -l -U github-runner
sudo -u github-runner sudo -n /usr/local/sbin/tandc-deploy 'bad; id'; echo "exit=$?"   # cần: tag không hợp lệ, exit=2
sudo -u github-runner sudo -n /bin/true; echo "exit=$?"                                 # cần: bị từ chối, exit≠0
```

**Riêng đợt tối ưu quy trình 05/11/2026:** chỉ cập nhật khi bản phát hành đã được duyệt và CI xanh. Có các migration mới: `20261105090000_estimated_inventory_cost`, `20261105120000_d1_price_provenance`, `20261105150000_d3_order_pick`, `20261105180000_d4_cod_shipping_payer`, `20261105190000_d5_analytics_events`, `20261105200000_d8_weight_allocation`. Sao lưu và xác nhận khôi phục được trước khi cập nhật. Container migrate chạy `prisma migrate deploy`, không reset database. Giữ `orders.requirePickList` theo quyết định vận hành; chính sách chi CTV hiện tại giữ nguyên.

Sau cập nhật: đăng nhập admin kiểm trang COD, Báo cáo → Hành vi mua hàng và Sức khỏe dữ liệu; tải mốc JSON D0, lưu kèm commit/thời điểm. Kiểm cron `cleanup`, log `analytics.write_failed`, đặt thử một đơn rồi hủy qua nghiệp vụ. Cấu hình analytics theo `.env.example`, không đưa khóa bí mật vào log. Theo dõi mốc D0 và phễu sau 2–4 tuần; guest COD chỉ xem xét sau ít nhất hai tuần dữ liệu D5 thật. Không quay lui bằng cách drop bảng/cột hoặc phục hồi đè lên giao dịch mới.

Nếu cần quay lui sau khi đã dùng BY_WEIGHT/người trả cước SENDER/ngoại lệ COD: dùng bản app vẫn hiểu các trường và phương pháp này. App cũ có thể phân bổ theo số lượng hoặc xuất nhãn/cước sai. Không chuyển dữ liệu ngược hoặc xóa lịch sử tự động để chạy app cũ.

Claude sẽ nhắn: *"đã phát hành `release-…`"* (chỉ khi mọi kiểm tra tự động đã đạt). Bạn làm:

📖 **Chỉ một lần, lần đầu dùng cách mới** (server chưa có script): làm **bước 1**, rồi 🖥️ **DÁN VÀO SERVER**:
```bash
cd /var/www/tandc && git pull origin main && echo "DA CO SCRIPT"
```
Từ lần sau **không** dùng `git pull` nữa.

1. Làm **bước 1** (vào server).
2. 🖥️ **DÁN VÀO SERVER** để cập nhật (mất 3–10 phút, khách chỉ bị gián đoạn vài giây):
   ```bash
   bash /var/www/tandc/ops/deploy.sh
   ```
   📖 Script tự: kiểm tra cấu hình, **tự sao lưu** nếu bản mới đổi database, hiện kế hoạch "Từ … Đến …".
   ⌨️ **MÀN HÌNH SẼ HỎI** `Gõ YES để tiếp tục` → gõ `YES` (chữ hoa) → Enter.
   ✅ **KẾT QUẢ ĐÚNG:** gần cuối có `== Kết quả: … 0 FAIL …`, dòng `SMOKE OK` và `✅ Đang chạy release-…`.
   ⛔ Thấy `⛔` hoặc `FAIL` → không làm gì thêm, copy toàn bộ chữ trên màn hình gửi Claude (script in sẵn lệnh quay lại bản trước nếu cần).
3. 🖱️ Mở `https://tandcstore.com`, nhấn `Ctrl+Shift+R` để xem bản mới.

**Quay lại bản trước** (khi bản mới lỗi, **chỉ khi Claude bảo**):
🖥️ **DÁN VÀO SERVER** để xem các bản:
```bash
bash /var/www/tandc/ops/deploy.sh --list
```
Rồi 🖥️ **DÁN VÀO SERVER** lệnh Claude gửi, dạng:
```bash
bash /var/www/tandc/ops/deploy.sh release-YYYYMMDD-HHMM
```
Nếu script báo *"Quay về bản cũ hơn database"* → ⛔ dừng, gửi Claude. **Không** tự thêm tuỳ chọn nào.

4. Mỗi tháng một lần, 🖥️ **DÁN VÀO SERVER** để dọn ổ đĩa:
   ```bash
   docker image prune -f
   ```

---

# PHẦN 5 — Tăng cường bảo mật server (làm một lần, 08/11/2026)

📖 **ĐỌC ĐỂ HIỂU:** đợt vá bảo mật 08/11/2026 có **thay đổi database** (bảng `appRateLimit`) và bắt buộc `.env.prod` có `POSTGRES_PASSWORD`. Làm 5.1 **trước** khi cập nhật theo PHẦN 4; 5.2–5.4 làm sau, lúc nào rảnh.

**5.1 Kiểm tra trước khi cập nhật bản 08/11** — 🖥️ **DÁN VÀO SERVER**:
```bash
cd /var/www/tandc && grep -c '^POSTGRES_PASSWORD=.\+' .env.prod && grep -c '^APP_URL=https://' .env.prod && ! grep -qi 'change-me' .env.prod && echo "ENV OK"
```
✅ **KẾT QUẢ ĐÚNG:** hai dòng `1` rồi `ENV OK`. Khác → ⛔ **không cập nhật**, gửi Claude (app mới từ chối chạy khi thiếu mật khẩu DB, `APP_URL` không phải https, hoặc còn khoá mẫu `change-me`).
Sau đó làm PHẦN 4 (có bước 2 sao lưu).

**5.2 Nginx: giới hạn tần suất, ẩn phiên bản, chặn `/api/cron` từ ngoài** — 🖥️ dán lại **nguyên lệnh 8c** (đã cập nhật ở PHẦN 2, bước 8). Nó chỉ ghi đè file `tandc`, không đụng web VCM.
✅ `BUOC 8c OK`. Kiểm tra — 🖥️ **DÁN VÀO SERVER**:
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://tandcstore.com/api/cron/cleanup; curl -sI https://tandcstore.com | grep -i '^server'
```
✅ **KẾT QUẢ ĐÚNG:** `404` và `Server: nginx` (không còn số phiên bản). Web lỗi → dán lệnh tắt site ở bước 8c rồi gửi Claude.

**5.3 Cảnh báo khi sao lưu lỗi** — 📖 hiện lỗi sao lưu chỉ nằm trong `/var/log/glow-backup.log`. Mỗi sáng thứ Hai, 🖥️ **DÁN VÀO SERVER** để xem lần sao lưu gần nhất:
```bash
tail -n 5 /var/log/glow-backup.log; ls -lt /var/backups/glow 2>/dev/null | head -n 3
```
✅ Có file trong 24 giờ gần nhất, log không có `ERROR`/`failed`. Khác → gửi Claude.
[CẦN XÁC MINH] Bật **Object Lock** (khoá không cho xoá) cho bucket B2 và dùng khoá ứng dụng không có quyền xoá — để người chiếm được server cũng không xoá được bản sao lưu. Cần kiểm tra B2 có cho bật Object Lock trên bucket đã tạo không; Claude sẽ hướng dẫn khi bạn muốn làm.

**5.4 Chạy thử khôi phục một lần** — chưa từng khôi phục bản sao lưu production. Làm theo mục "B7.7 Khôi phục thử" trong [huong-dan-trien-khai-tandcstore.md](huong-dan-trien-khai-tandcstore.md) (khôi phục vào database tạm, không đụng dữ liệu đang chạy), xong xoá khoá giải mã khỏi server như hướng dẫn.

📖 **Rủi ro chấp nhận:** server dùng chung với web VCM — ai có quyền root/docker trên máy đọc được `.env.prod` và database. Chỉ cấp `sudo`/nhóm `docker` cho người thật sự cần.

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
| Kiểm tra toàn bộ web (chỉ xem) | `bash /var/www/tandc/ops/smoke.sh` |
| Các bản phát hành + lịch sử cập nhật | `bash /var/www/tandc/ops/deploy.sh --list` |
| Web có đang chạy không | `docker compose -p tandc ps -a` |
| Xem lỗi gần đây của web | `docker logs tandc-app-1 --tail 100` |
| Khởi động lại web | `docker restart tandc-app-1` |
| Tắt site tandc (cứu web VCM khi có sự cố) | `rm -f /etc/nginx/sites-enabled/tandc && nginx -t && systemctl reload nginx` |
| Dung lượng ổ đĩa | `df -h /; docker system df` |
| Sao lưu ngay | `bash -c 'set -a; . /opt/glow/cron.env; /opt/glow/backup.sh'` |
| Xem email đăng nhập nhân viên / CTV | `docker exec tandc-db-1 psql -U glow -d glow -c "SELECT email, role, active FROM \"user\" WHERE role <> 'CUSTOMER' ORDER BY role, email;"` |
