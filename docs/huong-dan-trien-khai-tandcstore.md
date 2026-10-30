# Hướng dẫn đưa T&C Cosmetics lên tandcstore.com và server 10.201.42.65

> Cập nhật: 2026-10-30. Runbook làm theo từng bước; tài liệu tham khảo chi tiết: [DEPLOY.md](../DEPLOY.md).
> Đánh dấu `[x]` khi xong từng ô. `<...>` = chỗ cần điền. **[CẦN XÁC MINH]** = giao diện/chính sách dịch vụ ngoài có thể đã đổi — làm theo màn hình thật.

## Thông số hệ thống

| Hạng mục | Giá trị |
|---|---|
| Server App&DB | Ubuntu, IP nội bộ `10.201.42.65` — **24 vCPU, 48 GB RAM, 1000 GB SSD** — **dùng chung** với web VCM XDDD (`cons.viettelconstructionmyanmar.com`) |
| Máy mạng phía trước | Máy riêng **Load Balancer / Firewall ảo / OpenVPN** (16 vCPU, 32 GB RAM, 300 GB) — giữ IP công cộng, chuyển 80/443 vào `10.201.42.65`; SSH vào server qua OpenVPN |
| User SSH | `vcm_aio` (rồi `sudo su -`) |
| IP công cộng | IP của máy LB/Firewall — chính là IP mà `cons.viettelconstructionmyanmar.com` đang trỏ tới → `<IP_CONG_CONG>` |
| Thư mục mã nguồn | `/var/www/tandc` |
| Repo GitHub | `https://github.com/canhhoho/glow-mm.git` (private, nhánh `main`) |
| Cách chạy | **Docker Compose**, project `tandc`, file `docker-compose.prod.yml` (3 service: `db` Postgres 17, `migrate`, `app` Next.js) |
| Cổng app | `127.0.0.1:3000` (chỉ nội bộ máy) — Nginx của server proxy vào |
| Tên container / volume | `tandc-app-1`, `tandc-db-1`, `tandc-migrate-1`; volume `tandc_pgdata`, `tandc_uploads`, `tandc_next-cache` |
| File cấu hình bí mật | `/var/www/tandc/.env.prod` (KHÔNG có trong Git) |
| Reverse proxy + HTTPS | **Nginx + Certbot đang có sẵn** trên server (dùng chung với web VCM) |
| Tên miền | `tandcstore.com` (chính), `www.tandcstore.com` → chuyển về; DNS quản lý tại **inet.vn** |
| Hiện đang chạy | Vercel `glow-mm.vercel.app` + Neon (DB) + Vercel Blob (ảnh) |

**Bốn điều cần nhớ trước khi làm bất cứ việc gì:**

1. **Server dùng chung với web VCM.** Không cài Coolify/Traefik hay bất cứ thứ gì chiếm cổng 80/443; không sửa/xoá file Nginx của VCM (`/etc/nginx/sites-available/vcm-xddd`); không đổi SSH, ufw, PostgreSQL hệ thống, Node/PM2. Luôn `sudo nginx -t` trước khi `reload` — cấu hình lỗi làm sập cả hai web.
2. **File `.env.prod` KHÔNG có trong Git.** Chỉ có trên server; mất là app không chạy (và nếu mất `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`/`BETTER_AUTH_SECRET` thì khách bị lỗi form/đăng xuất). Sao lưu nội dung vào trình quản lý mật khẩu. **Tuyệt đối không chạy `git clean -fd`** trong `/var/www/tandc`.
3. **Khác web VCM: build diễn ra TRÊN SERVER** (trong Docker, `docker compose up --build`), không commit thư mục build. Migration DB **tự chạy** (service `migrate`) trước khi app khởi động — không chạy tay.
4. **Dữ liệu nằm trong Docker volume** (`tandc_pgdata`, `tandc_uploads`). Không chạy `docker compose down -v` / `docker volume rm` — mất toàn bộ đơn hàng, tồn kho, ảnh.

**Lộ trình 2 giai đoạn**
- **Giai đoạn A — làm ngay (1–2 giờ, chủ yếu chờ DNS):** `tandcstore.com` chạy trên Vercel hiện tại; bật email; cập nhật đăng nhập Google.
- **Giai đoạn B — khi sẵn sàng:** dựng app trên server, chạy thử ở `moi.tandcstore.com` với bản sao dữ liệu → chọn ngày chuyển dữ liệu + đổi DNS về server. Khách không phải đổi gì.

> **Không dán secret** (mật khẩu, token, khoá) vào chat hay vào Git. Sinh secret **trên server** bằng các lệnh có sẵn trong hướng dẫn.

---

# PHẦN A — tandcstore.com trên Vercel (làm ngay)

## A1. Gắn tên miền vào Vercel
- [ ] Vercel → project `glow-mm` → **Settings → Domains → Add**:
  - `tandcstore.com` — tên miền chính (Production);
  - `www.tandcstore.com` — chọn **Redirect to `tandcstore.com`** (308).
- [ ] Ghi lại bản ghi DNS Vercel yêu cầu, thường là **[CẦN XÁC MINH theo màn hình Vercel]**:

  | Loại | Tên (Host) | Giá trị |
  |---|---|---|
  | A | `@` | `76.76.21.21` |
  | CNAME | `www` | `cname.vercel-dns.com` |

## A2. Tạo bản ghi ở inet.vn
- [ ] inet.vn → Quản lý tên miền → `tandcstore.com` → **Quản lý DNS** **[CẦN XÁC MINH tên menu]**.
- [ ] Xoá bản ghi `A @` / `www` mặc định (trang đỗ của nhà đăng ký) nếu có; thêm đúng các bản ghi ở A1, **TTL 300**.
- [ ] Chờ 5–30 phút, kiểm tra từ **máy tính của bạn**:
  ```bash
  nslookup tandcstore.com
  ```
  ```bash
  nslookup www.tandcstore.com
  ```
- [ ] Vercel → Domains: cả hai **Valid Configuration**, HTTPS tự cấp.

## A3. Đổi URL gốc của app
- [ ] Vercel → **Settings → Environment Variables** → `APP_URL` (môi trường **Production**) = `https://tandcstore.com`.
- [ ] **Deployments → Redeploy** bản Production mới nhất. Bắt buộc build lại: canonical, sitemap, Open Graph và phiên đăng nhập (Better Auth) đều dùng `APP_URL`.
- [ ] Vercel → Domains → `glow-mm.vercel.app` → **Redirect to `tandcstore.com`** **[CẦN XÁC MINH Vercel cho phép với tên miền .vercel.app]**. Link cũ (kể cả link CTV `?ref=MAUNG`) tự chuyển sang tên miền mới — đăng nhập chỉ chạy trên đúng `APP_URL`. Nếu Vercel không cho, báo Claude thêm chuyển hướng trong code.

## A4. Đăng nhập Google
- [ ] Google Cloud Console → **Google Auth Platform → Clients** → client web hiện có → thêm (giữ URI cũ):
  - Authorized JavaScript origins: `https://tandcstore.com`
  - Authorized redirect URIs: `https://tandcstore.com/api/customer-auth/callback/google`
  - **Save** (vài phút mới có hiệu lực).
- [ ] **Branding**: Authorized domains thêm `tandcstore.com`; App home page `https://tandcstore.com`; Privacy policy `https://tandcstore.com/info/privacy`; Terms để trống (web chưa có trang điều khoản).
- [ ] **Xác minh sở hữu tên miền**: [Google Search Console](https://search.google.com/search-console) → Add property → **Domain** `tandcstore.com` → thêm bản ghi **TXT** Google đưa (Host `@`) ở inet.vn → Verify.
- [ ] **Verification Center / Branding → Verify branding**. Sau khi Google duyệt, màn hình đăng nhập Google hiện tên "T&C Cosmetics" **[CẦN XÁC MINH thời gian duyệt]**. Trong lúc chờ, đăng nhập Google vẫn chạy.

## A5. Email (Resend) — đăng ký/đăng nhập bằng email, quên mật khẩu
- [ ] resend.com → **Domains → Add Domain** → `tandcstore.com` (region gần nhất, vd Tokyo/Singapore **[CẦN XÁC MINH]**).
- [ ] Chép **từng bản ghi** Resend hiển thị vào inet.vn, thường là **[CẦN XÁC MINH]**:

  | Loại | Tên (Host) | Giá trị |
  |---|---|---|
  | TXT | `resend._domainkey` | `p=MIGf...` (khoá DKIM dài) |
  | MX | `send` | `feedback-smtp.<region>.amazonses.com`, ưu tiên 10 |
  | TXT | `send` | `v=spf1 include:amazonses.com ~all` |

- [ ] Thêm DMARC: TXT, Host `_dmarc`, giá trị `v=DMARC1; p=none;`.
- [ ] Nếu tên miền **đã có email khác** (vd hộp thư inet): **không xoá** MX/SPF ở `@` — bản ghi Resend nằm ở `send` / `resend._domainkey` nên không đụng nhau.
- [ ] Chờ **Verified** → **API Keys → Create** (quyền *Sending access*, chỉ domain `tandcstore.com`) → chép key (chỉ hiện một lần, lưu vào trình quản lý mật khẩu — sẽ dùng lại ở giai đoạn B).
- [ ] Vercel → Environment Variables (Production): `EMAIL_DRIVER`=`resend`, `RESEND_API_KEY`=key vừa tạo, `EMAIL_FROM`=`T&C Cosmetics <no-reply@tandcstore.com>` → **Redeploy**.

## A6. Kiểm tra giai đoạn A (cửa sổ ẩn danh)
- [ ] `https://tandcstore.com` hiện trang chủ tiếng Myanmar, ổ khoá HTTPS hợp lệ.
- [ ] `https://www.tandcstore.com` và `https://glow-mm.vercel.app` → chuyển về `https://tandcstore.com`.
- [ ] `https://tandcstore.com/sitemap.xml`, `/robots.txt` chỉ chứa `tandcstore.com`.
- [ ] `/en/login`: đăng nhập **Google** → về `/en/account`; đăng ký **email** → nhận thư (xem cả Spam); **quên mật khẩu** → nhận link; đăng nhập SĐT + mật khẩu vẫn chạy.
- [ ] `/admin` (3 vai trò) và cổng `/ctv` đăng nhập được.
- [ ] Link CTV `https://tandcstore.com/?ref=<mã CTV>` → đặt thử đơn → đơn gắn đúng CTV (rồi huỷ).
- [ ] Header bảo mật:
  ```bash
  curl -sI https://tandcstore.com/en | grep -iE "strict-transport|content-security"
  ```
- [ ] Search Console → **Sitemaps** → gửi `https://tandcstore.com/sitemap.xml`. Cập nhật link Facebook page, Viber, danh thiếp.

---

# PHẦN B — Cài đặt lần đầu trên server

Thứ tự: B1 → B6 (chạy thử ở `moi.tandcstore.com`, khách vẫn dùng Vercel) → B7 (cron + backup) → chọn ngày làm **PHẦN C** (chuyển chính thức).

## B1. Kiểm tra server (chỉ xem, không sửa gì)

```bash
ssh vcm_aio@10.201.42.65
```
```bash
sudo su -
```

Tài nguyên — server có 24 vCPU / 48 GB RAM / 1000 GB, dư cho cả hai web (build Next.js cần ~2–3 GB RAM, dữ liệu + image Docker vài chục GB). Xác nhận còn trống:
```bash
nproc && free -h && df -h /
```

Cổng đang dùng — phải thấy Nginx ở 80/443, Node VCM ở 3001, PostgreSQL ở 5432 và **cổng 3000 còn trống**:
```bash
ss -tlnp | grep -E ':(80|443|3000|3001|5432)\b'
```

Phần mềm có sẵn:
```bash
nginx -v; certbot --version; docker --version; docker compose version; ufw status
```

IP công cộng — chạy trên **máy tính của bạn** (cùng IP mà web VCM đang dùng, đã NAT 80/443 về server):
```bash
nslookup cons.viettelconstructionmyanmar.com
```
→ ghi địa chỉ vào `<IP_CONG_CONG>`.

- [ ] RAM trống (`available` trong `free -h`) ≥ 8 GB và đĩa trống ≥ 50 GB — với cấu hình 48 GB/1000 GB là thoả; **không cần swap**.
- [ ] Nếu cổng 3000 **đã bị chiếm** → dừng lại, báo Claude đổi cổng (sửa `docker-compose.prod.yml` và Nginx).
- [ ] `ufw status`: đã có `OpenSSH` và `Nginx Full` (từ web VCM) là đủ — **không** mở thêm cổng 3000/5432.

### B1.1 Hỏi bộ phận hạ tầng về máy LB/Firewall/OpenVPN
Khách đi theo đường: **Internet → máy LB/Firewall (IP công cộng) → Nginx trên `10.201.42.65` → app**. Cần biết rõ 4 điều (ghi câu trả lời vào đây):

- [ ] **Kiểu chuyển tiếp 80/443:** chỉ NAT/chuyển cổng (L4 — giữ nguyên IP khách) hay reverse proxy/load balancer HTTP (L7 — đổi IP nguồn thành IP của máy LB)? → quyết định có cần cấu hình *real IP* ở B6.2 không.
- [ ] **HTTPS kết thúc ở đâu:** chuyển nguyên 443 vào server (Certbot trên server như web VCM — hướng dẫn này giả định cách này) hay LB tự giữ chứng chỉ? Nếu LB giữ chứng chỉ → báo Claude, bước B6.3/C6 sẽ khác.
- [ ] **Tên miền mới có đi vào được không:** NAT theo IP thì `tandcstore.com` tự đi vào như web VCM; nếu LB/firewall lọc theo tên miền (Host/SNI) thì phải **thêm `tandcstore.com`, `www.tandcstore.com`, `moi.tandcstore.com`**.
- [ ] **Chiều ra Internet (outbound) từ `10.201.42.65` được phép tới:**

  | Đích | Dùng cho |
  |---|---|
  | `github.com` (443) | `git pull` |
  | `registry-1.docker.io`, `production.cloudflare.docker.com`, `registry.npmjs.org`, `binaries.prisma.sh` (443) | Build image (tải Node, thư viện, Prisma) |
  | `acme-v02.api.letsencrypt.org` (443) | Certbot cấp/gia hạn chứng chỉ |
  | `api.resend.com` (443) | Gửi email |
  | `oauth2.googleapis.com`, `www.googleapis.com` (443) | Đăng nhập Google (server đổi mã lấy thông tin tài khoản) |
  | `*.neon.tech` (5432), `*.public.blob.vercel-storage.com` (443) | Chỉ khi chuyển dữ liệu (B6.4, PHẦN C) |
  | Backblaze B2 / Cloudflare R2 (443) | Backup hằng đêm (B7) |

- [ ] SSH vào server qua **OpenVPN** như hiện tại — không mở cổng 22 ra Internet.

## B2. Cài Docker (bỏ qua nếu `docker compose version` đã chạy)

Docker chạy độc lập, không đụng Nginx/PostgreSQL/PM2 của web VCM.

```bash
curl -fsSL https://get.docker.com | sh
```
**[CẦN XÁC MINH: script chính thức của Docker; có thể dùng hướng dẫn "Install Docker Engine on Ubuntu" tại docs.docker.com]**

```bash
systemctl enable --now docker && docker compose version
```

Giới hạn dung lượng log của container (nếu `/etc/docker/daemon.json` đã có nội dung thì **gộp tay**, đừng ghi đè):
```bash
echo '{"log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"3"}}' > /etc/docker/daemon.json && systemctl restart docker
```

Kiểm tra chiều ra Internet (mỗi dòng phải có mã HTTP, không bị treo/timeout):
```bash
for u in https://github.com https://registry.npmjs.org https://registry-1.docker.io/v2/ https://binaries.prisma.sh https://acme-v02.api.letsencrypt.org/directory https://api.resend.com https://oauth2.googleapis.com; do printf '%-50s ' "$u"; curl -s -o /dev/null -m 10 -w '%{http_code}\n' "$u" || echo LỖI; done
```
Dòng nào `000`/`LỖI` → nhờ bộ phận hạ tầng mở trên firewall (bảng ở B1.1).

## B3. Clone mã nguồn

Repo private → tạo **Fine-grained Personal Access Token** trên GitHub: chỉ repo `glow-mm`, quyền *Contents: Read-only*, hạn 1 năm (giống cách đang làm với web VCM).

```bash
mkdir -p /var/www && cd /var/www && git clone https://github.com/canhhoho/glow-mm.git tandc
```
Khi Git hỏi: Username = `canhhoho`, Password = **token** (không phải mật khẩu GitHub). Lưu lại để lần sau `git pull` không hỏi:
```bash
git config --global credential.helper store
```

```bash
cd /var/www/tandc && git log --oneline -1
```

## B4. Tạo file `.env.prod`

Sinh các secret (chạy từng lệnh, chép kết quả):
```bash
openssl rand -base64 24   # → POSTGRES_PASSWORD
openssl rand -base64 32   # → BETTER_AUTH_SECRET
openssl rand -hex 24      # → CRON_SECRET (chỉ chữ/số)
openssl rand -base64 32   # → NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
```

```bash
nano /var/www/tandc/.env.prod
```

Nội dung (giai đoạn chạy thử dùng `moi.tandcstore.com`):
```ini
POSTGRES_PASSWORD=<...>
APP_URL=https://moi.tandcstore.com
BETTER_AUTH_SECRET=<...>
CRON_SECRET=<...>
# Tạo MỘT lần, giữ mãi — đổi là tab khách đang mở bị lỗi gửi form
NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=<...>
DATABASE_POOL_MAX=20

FB_PAGE_USERNAME=<như trên Vercel, có thể để trống>
VIBER_CHAT_URI=<như trên Vercel, có thể để trống>

EMAIL_DRIVER=resend
RESEND_API_KEY=<key Resend ở A5>
EMAIL_FROM="T&C Cosmetics <no-reply@tandcstore.com>"

GOOGLE_CLIENT_ID=<như trên Vercel>
GOOGLE_CLIENT_SECRET=<như trên Vercel>
```
- `BETTER_AUTH_SECRET`, `CRON_SECRET` là giá trị **mới**, khác Vercel (khách đăng nhập lại một lần sau khi chuyển — bình thường).
- Muốn thử đăng nhập Google trên `moi`: thêm tạm redirect `https://moi.tandcstore.com/api/customer-auth/callback/google` ở Google (xoá ở PHẦN C).

Bảo vệ file và sao lưu nội dung vào trình quản lý mật khẩu:
```bash
chmod 600 /var/www/tandc/.env.prod
```

## B5. Build và khởi động app

```bash
cd /var/www/tandc && SOURCE_COMMIT=$(git rev-parse --short HEAD) docker compose -p tandc -f docker-compose.prod.yml --env-file .env.prod up -d --build
```
Lần đầu mất 5–15 phút (tải image, `npm ci`, `next build`). Thứ tự tự động: `db` khoẻ → `migrate` tạo bảng rồi thoát → `app` chạy.

```bash
docker compose -p tandc ps -a
```
→ `tandc-db-1` healthy, `tandc-migrate-1` **Exited (0)**, `tandc-app-1` healthy, cổng `127.0.0.1:3000->3000/tcp`.

```bash
curl -s http://127.0.0.1:3000/api/health
```
→ `{"ok":true}`

> DB đang **trống** (chưa có sản phẩm/tài khoản) — dữ liệu thật được chép từ Neon ở B6.4. Không chạy `db:seed` trên server.

## B6. Chạy thử trên `moi.tandcstore.com`

### B6.1 DNS
- [ ] inet.vn: thêm `A`, Host `moi`, giá trị `<IP_CONG_CONG>`, TTL 300. Kiểm tra từ máy bạn: `nslookup moi.tandcstore.com`.

### B6.2 Nginx (site mới, không đụng site VCM)
```bash
nano /etc/nginx/sites-available/tandc
```
Dán:
```nginx
server {
    listen 80;
    server_name moi.tandcstore.com;

    # Biên lai/ảnh tối đa 5MB mỗi file (Server Action giới hạn 6MB)
    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        # App đọc IP khách từ X-Real-IP (chống dò mật khẩu theo IP) — bắt buộc
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host  $host;
        # Next.js stream trang theo từng phần (Suspense) — tắt buffer để khách 3G thấy nội dung sớm
        proxy_buffering off;
        proxy_read_timeout 120s;
    }
}
```

**Chỉ khi máy LB là reverse proxy HTTP (L7, câu hỏi đầu tiên ở B1.1):** IP Nginx thấy là IP của máy LB, không phải của khách → mọi khách dùng chung một IP, chống dò mật khẩu sẽ chặn nhầm cả loạt. Thêm vào trong khối `server` (ngay dưới `client_max_body_size`):
```nginx
    # Tin IP khách do máy LB gửi (X-Forwarded-For) — chỉ tin từ IP nội bộ của máy LB
    set_real_ip_from <IP_NOI_BO_MAY_LB>;
    real_ip_header   X-Forwarded-For;
    real_ip_recursive on;
```
Cách kiểm tra (làm sau B6.3): mở `https://moi.tandcstore.com` bằng điện thoại dùng 4G, rồi trên server:
```bash
tail -5 /var/log/nginx/access.log
```
Cột đầu tiên phải là **IP công cộng của điện thoại** (xem tại trang whatismyip trên điện thoại). Nếu là IP `10.x` của máy LB → cần đoạn cấu hình trên (hỏi bộ phận hạ tầng IP nội bộ của máy LB), rồi `nginx -t && systemctl reload nginx` và kiểm tra lại.
Bật site (**không** xoá site khác), kiểm tra cú pháp rồi nạp lại:
```bash
ln -sf /etc/nginx/sites-available/tandc /etc/nginx/sites-enabled/tandc && nginx -t && systemctl reload nginx
```
```bash
curl -sI http://moi.tandcstore.com | head -1
```

### B6.3 HTTPS
```bash
certbot --nginx -d moi.tandcstore.com
```
Chọn **có chuyển hướng HTTP → HTTPS**. Kiểm tra:
```bash
curl -s https://moi.tandcstore.com/api/health
```

### B6.4 Chạy thử chuyển dữ liệu (bản sao, chưa cần đóng băng)
Lấy **chuỗi kết nối DIRECT** (không có `-pooler`) của Neon nhánh production: Neon → Connect → bỏ chọn *Pooled*.

Dump Neon **ngay trên server** bằng Postgres 17 trong Docker (không cần cài `pg_dump`):
```bash
mkdir -p /root/migrate && cd /root/migrate && read -rs NEON_URL && export NEON_URL
```
(dán chuỗi Neon — không hiện ra màn hình — rồi Enter)
```bash
docker run --rm -e NEON_URL -v /root/migrate:/out postgres:17.6-alpine sh -c 'pg_dump "$NEON_URL" --format=custom --no-owner --no-acl -f /out/neon.dump' && ls -lh /root/migrate/neon.dump
```
Nếu server không ra được cổng 5432 của Neon: chạy cùng lệnh trên máy tính có Docker rồi `scp neon.dump vcm_aio@10.201.42.65:/tmp/` và dùng `/tmp/neon.dump`.

Restore vào DB trên server:
```bash
docker cp /root/migrate/neon.dump tandc-db-1:/tmp/neon.dump && docker exec tandc-db-1 pg_restore -U glow -d glow --clean --if-exists --no-owner --no-acl /tmp/neon.dump
```

Đối chiếu số dòng **Neon ↔ server** (hai kết quả phải giống nhau):
```bash
Q='SELECT (SELECT count(*) FROM "Order") orders, (SELECT count(*) FROM "StockLedger") ledger, (SELECT count(*) FROM "StockBalance") balance, (SELECT count(*) FROM "Batch") batches, (SELECT count(*) FROM "Product") products, (SELECT count(*) FROM "user") users, (SELECT coalesce(sum(qty),0) FROM "StockBalance") total_qty'
```
```bash
docker run --rm -e NEON_URL postgres:17.6-alpine sh -c "psql \"\$NEON_URL\" -c '$Q'"
```
```bash
docker exec tandc-db-1 psql -U glow -d glow -c "$Q"
```

Chuyển ảnh/biên lai từ Vercel Blob về ổ đĩa server — chạy thử trước:
```bash
cd /var/www/tandc && set -a && . ./.env.prod && set +a && docker run --rm --user 1001:1001 --network tandc_default -v tandc_uploads:/app/storage -e LOCAL_STORAGE_DIR=/app/storage -e DATABASE_URL="postgresql://glow:${POSTGRES_PASSWORD}@db:5432/glow" tandc-migrate node scripts/migrate-blob-to-local.mjs --dry-run
```
Xem số file sẽ chuyển → chạy lại đúng lệnh trên **bỏ `--dry-run`**. Lỗi mạng giữa chừng → chạy lại (chỉ xử lý file chưa chuyển). Tên image/mạng kiểm bằng `docker images | grep tandc` và `docker network ls | grep tandc`.

Xoá cache trong app sau khi thay dữ liệu:
```bash
docker restart tandc-app-1
```

Kiểm tra trên `https://moi.tandcstore.com`:
- [ ] Trang chủ, ảnh sản phẩm, banner hiện đủ.
- [ ] Đăng nhập admin bằng **tài khoản thật** (đi theo dữ liệu Neon), cổng CTV; mở một biên lai chuyển khoản (chỉ admin xem được).
- [ ] Đặt thử 1 đơn COD → huỷ trong admin (dữ liệu thử — sẽ bị ghi đè ở PHẦN C).

## B7. Cron + backup (làm ngay sau B6, trước PHẦN C)

### B7.1 Script đã có sẵn trong mã nguồn
```bash
mkdir -p /opt/glow && cp /var/www/tandc/ops/backup.sh /var/www/tandc/ops/restore.sh /opt/glow/ && chmod 700 /opt/glow/*.sh && touch /var/log/glow-cron.log /var/log/glow-backup.log
```
```bash
apt install -y rclone age
```

### B7.2 Khoá mã hoá backup (private key giữ NGOÀI server)
```bash
age-keygen -o /root/glow-backup.key && grep 'public key' /root/glow-backup.key
```
→ ghi `age1...` làm `AGE_RECIPIENT`.
```bash
cat /root/glow-backup.key
```
→ chép **toàn bộ** vào trình quản lý mật khẩu, rồi xoá khỏi server:
```bash
rm /root/glow-backup.key
```

### B7.3 Nơi lưu backup ngoài server
Backblaze B2 hoặc Cloudflare R2: tạo bucket `glow-backups` + key chỉ có quyền bucket đó.
```bash
rclone config
```
(tạo remote, vd tên `b2` → `RCLONE_REMOTE=b2:glow-backups`)
```bash
rclone lsd b2:
```

### B7.4 File cấu hình cron
```bash
nano /opt/glow/cron.env
```
```ini
CRON_SECRET=<giống CRON_SECRET trong /var/www/tandc/.env.prod>
DB_CONTAINER=tandc-db-1
UPLOADS_VOLUME=tandc_uploads
RCLONE_REMOTE=b2:glow-backups
AGE_RECIPIENT=age1...
```
```bash
chmod 600 /opt/glow/cron.env
```

### B7.5 Lịch chạy
```bash
crontab -e
```
Dán các dòng lệnh trong `/var/www/tandc/ops/cron.example` (giờ theo UTC — server để UTC: kiểm bằng `timedatectl`; nếu server đang để giờ khác thì giữ nguyên giờ server, chỉ cần biết lịch dịch tương ứng, **không đổi múi giờ** vì ảnh hưởng web VCM):

| Job | Lịch (giờ Yangon) |
|---|---|
| Nhả hàng giữ quá hạn | mỗi 15 phút |
| Huỷ COD chưa xác nhận | mỗi 15 phút |
| Cảnh báo tồn | 06:00 |
| Dọn dữ liệu tạm | 03:30 |
| Backup DB + ảnh | 02:30 |

### B7.6 Thử ngay
```bash
bash -c 'set -a; . /opt/glow/cron.env; curl -fsS -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/api/cron/cleanup'; echo
```
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/cron/cleanup
```
→ `401` (không có secret thì bị chặn — đúng).
```bash
bash -c 'set -a; . /opt/glow/cron.env; /opt/glow/backup.sh' && rclone ls b2:glow-backups
```

### B7.7 Khôi phục thử (mỗi tháng một lần)
Đưa private key lên tạm (`/root/glow-backup.key`), khôi phục vào DB tạm, rồi xoá key:
```bash
mkdir -p /root/restore-test && rclone copy b2:glow-backups/<db-...>.dump.age /root/restore-test/
```
```bash
docker run -d --name glow-restore-test -e POSTGRES_USER=glow -e POSTGRES_PASSWORD=x -e POSTGRES_DB=glow postgres:17.6-alpine
```
```bash
DB_CONTAINER=glow-restore-test AGE_KEY_FILE=/root/glow-backup.key /opt/glow/restore.sh /root/restore-test/<db-...>.dump.age
```
```bash
docker exec glow-restore-test psql -U glow -d glow -c 'SELECT count(*) FROM "Order";' && docker rm -f glow-restore-test && rm -f /root/glow-backup.key
```

---

# PHẦN C — Ngày chuyển chính thức (Vercel → server)

Chọn giờ ít khách (vd 22:00 Yangon). Ngừng ghi khoảng **30–60 phút**.

**Hôm trước**
- [ ] inet.vn: TTL của `@` và `www` → **300**.
- [ ] B6 và B7 đã chạy ổn, backup thử đã khôi phục được.
- [ ] Báo nhân viên giờ bảo trì: không tạo đơn, không nhập kho trong thời gian này.

**Trong giờ chuyển**
1. [ ] Admin trên **Vercel** (`tandcstore.com/admin`) → **Cài đặt → bỏ chọn "Nhận đơn trên web"** → Lưu.
2. [ ] Trên server: dump Neon **lần cuối** → restore → đối chiếu số dòng (lặp lại các lệnh ở B6.4).
3. [ ] Chạy lại script chuyển ảnh Blob (B6.4, không `--dry-run`) — chỉ xử lý ảnh mới.
4. [ ] Đổi URL gốc rồi **build lại**:
   ```bash
   cd /var/www/tandc && sed -i 's|^APP_URL=.*|APP_URL=https://tandcstore.com|' .env.prod && grep ^APP_URL .env.prod
   ```
   ```bash
   SOURCE_COMMIT=$(git rev-parse --short HEAD) docker compose -p tandc -f docker-compose.prod.yml --env-file .env.prod up -d --build
   ```
5. [ ] inet.vn: `A @` → `<IP_CONG_CONG>` (thay `76.76.21.21`); `www`: xoá CNAME Vercel, thêm `A www` → `<IP_CONG_CONG>`. Giữ nguyên bản ghi Resend + Google TXT. Chờ `nslookup tandcstore.com` ra `<IP_CONG_CONG>`.
6. [ ] Thêm tên miền chính vào Nginx (tạm thời ở HTTP để Certbot xác thực):
   ```bash
   nano /etc/nginx/sites-available/tandc
   ```
   Sửa dòng `server_name` của khối `listen 80` thành:
   ```nginx
   server_name moi.tandcstore.com tandcstore.com www.tandcstore.com;
   ```
   ```bash
   nginx -t && systemctl reload nginx && certbot --nginx -d tandcstore.com -d www.tandcstore.com
   ```
7. [ ] Chuyển `www` và `moi` về tên miền chính — thêm vào **cuối** `/etc/nginx/sites-available/tandc`:
   ```nginx
   # www → tên miền chính (chứng chỉ do Certbot cấp ở bước 6 đã gồm www)
   server {
       listen 443 ssl;
       server_name www.tandcstore.com;
       ssl_certificate     /etc/letsencrypt/live/tandcstore.com/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/tandcstore.com/privkey.pem;
       include /etc/letsencrypt/options-ssl-nginx.conf;
       return 301 https://tandcstore.com$request_uri;
   }
   ```
   và trong khối `server` chính (khối có `proxy_pass`), đổi `server_name` thành `tandcstore.com moi.tandcstore.com`. **[CẦN XÁC MINH: Certbot có thể đã tự tách/sửa khối — mở file xem trước khi sửa; mục tiêu: `tandcstore.com` proxy vào app, `www` trả 301.]**
   ```bash
   nginx -t && systemctl reload nginx
   ```
8. [ ] Kiểm tra:
   ```bash
   curl -s https://tandcstore.com/api/health
   ```
   ```bash
   curl -sI https://www.tandcstore.com | grep -i location
   ```
9. [ ] Admin trên **server** (`https://tandcstore.com/admin`) → **Cài đặt → bật lại "Nhận đơn trên web"**. Đặt thử 1 đơn COD và 1 đơn chuyển khoản (upload biên lai → duyệt) → huỷ cả hai.
10. [ ] Chạy checklist **PHẦN E**.

**Sau giờ chuyển**
- [ ] Google OAuth: xoá redirect `moi.tandcstore.com`; giữ `tandcstore.com`.
- [ ] inet.vn: xoá bản ghi `moi`; trả TTL `@`/`www` về 3600. Nginx: bỏ `moi.tandcstore.com` khỏi `server_name` (`nginx -t && systemctl reload nginx`).
- [ ] Vercel: **Domains** → gỡ `tandcstore.com`, `www`. Để project chạy thêm vài ngày phòng sự cố — **không** nhận đơn trên Vercel.
- [ ] Theo dõi 2–3 ngày đầu: `docker logs tandc-app-1 --tail 100`, `/var/log/glow-cron.log`, `/var/log/glow-backup.log`, backup có lên B2/R2 hằng đêm.

**Phương án quay lại**
- **Trong vài giờ đầu, lỗi nặng và CHƯA có đơn mới trên server:** trả DNS `@`/`www` về bản ghi Vercel (A1), gắn lại domain trên Vercel, bật lại "Nhận đơn trên web" trên Vercel.
- **Đã có đơn/nhập kho mới trên server:** **không quay lại** (mất dữ liệu mới) — sửa lỗi trên server, gửi log cho Claude.

---

# PHẦN D — Cập nhật hằng ngày (sau khi đã chuyển)

Claude làm trên nhánh `dev` → CI xanh → merge `main`. Bạn cập nhật server:

```bash
ssh vcm_aio@10.201.42.65
```
```bash
sudo su -
```

**Backup trước** (bắt buộc khi bản mới có migration DB — Claude sẽ báo):
```bash
bash -c 'set -a; . /opt/glow/cron.env; /opt/glow/backup.sh'
```

**Kéo code + build + chạy lại** (migration tự chạy trước app):
```bash
cd /var/www/tandc && git pull origin main && SOURCE_COMMIT=$(git rev-parse --short HEAD) docker compose -p tandc -f docker-compose.prod.yml --env-file .env.prod up -d --build && docker compose -p tandc ps -a
```
→ `tandc-migrate-1` Exited (0), `tandc-app-1` healthy. Trong lúc build, bản cũ vẫn phục vụ khách; chỉ gián đoạn vài giây khi đổi container.

**Kiểm tra:**
```bash
curl -s http://127.0.0.1:3000/api/health && docker logs tandc-app-1 --tail 50
```
Mở `https://tandcstore.com`, nhấn **Ctrl + Shift + R**.

**Dọn image cũ** (mỗi vài lần cập nhật, giải phóng đĩa — không đụng volume dữ liệu):
```bash
docker image prune -f
```

**Không bao giờ** đổi `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, `BETTER_AUTH_SECRET` trong `.env.prod` (đổi cái sau = đăng xuất toàn bộ người dùng). Đổi biến khác trong `.env.prod` → chạy lại lệnh build ở trên (`APP_URL` và khoá Server Action được nhúng lúc build).

**Hằng tháng:** `apt update && apt -y upgrade` (phối hợp với người quản lý web VCM vì dùng chung server), khôi phục thử backup (B7.7), `df -h` và `docker system df`.

**Sau 1–2 tuần ổn định:** báo Claude dọn code chỉ dùng cho Vercel ([DEPLOY.md §5](../DEPLOY.md)); tắt hẳn Vercel + Neon + Blob sau khi đã giữ bản backup cuối.

---

# PHẦN E — Kiểm tra sau khi deploy

Chạy lần lượt, dừng ở bước nào lỗi:

**Container còn sống?**
```bash
docker compose -p tandc ps -a
```
**App trả lời nội bộ?**
```bash
curl -s http://127.0.0.1:3000/api/health
```
**Nginx proxy đúng + HTTPS + header bảo mật?**
```bash
curl -sI https://tandcstore.com/en | grep -iE "^HTTP|strict-transport|content-security"
```
**Trang admin có CSP nonce?**
```bash
curl -sI https://tandcstore.com/admin/login | grep -i content-security | grep -o "nonce-[^']*" | head -1
```
**Cổng nội bộ không lộ ra ngoài?** (3000 chỉ `127.0.0.1`, DB không có cổng)
```bash
ss -tlnp | grep -E ':(3000|5432)\b'
```
**Web VCM vẫn chạy bình thường?**
```bash
curl -sI https://cons.viettelconstructionmyanmar.com | head -1
```
**Log không có lỗi?**
```bash
docker logs tandc-app-1 --tail 50; tail -20 /var/log/glow-cron.log; tail -20 /var/log/nginx/error.log
```

Trên trình duyệt (ẩn danh):
- [ ] Trang chủ `my`/`en`, ảnh SP, tìm kiếm, giỏ hàng.
- [ ] Đăng nhập: SĐT, email (nhận thư), Google (tới trang Google rồi quay về `/account`).
- [ ] Admin 3 vai trò; đổi mật khẩu mặc định nếu còn (`/admin/account`).
- [ ] Đặt thử đơn COD + chuyển khoản → huỷ. Tồn kho khớp số liệu trước khi chuyển.
- [ ] Cổng CTV + link `?ref=`.
- [ ] Đăng nhập sai nhiều lần từ một mạng → bị chặn tạm; mạng khác vẫn đăng nhập được (IP thật qua `X-Real-IP`).

---

# PHẦN F — Xử lý sự cố

## F.1 Nginx báo 502 Bad Gateway
App không chạy. Kiểm tra:
```bash
docker compose -p tandc ps -a && docker logs tandc-app-1 --tail 100
```
- `tandc-migrate-1` **Exited (1)** → migration lỗi, app không khởi động: xem `docker logs tandc-migrate-1`, gửi cho Claude. **Không** xoá volume.
- Thiếu biến môi trường → log báo `Biến môi trường không hợp lệ` → sửa `.env.prod`, chạy lại lệnh build.

## F.2 Build bị dừng giữa chừng
Với 48 GB RAM hiếm khi do thiếu bộ nhớ — thường là **mất kết nối ra Internet** khi tải thư viện (`npm ci`, Docker Hub, Prisma). Xem dòng lỗi cuối trong log build; chạy lại lệnh kiểm tra chiều ra ở B2; nhờ hạ tầng mở firewall (bảng B1.1). Build lại là an toàn — bản đang chạy vẫn phục vụ khách.

## F.3 Certbot không cấp được chứng chỉ
DNS chưa trỏ về `<IP_CONG_CONG>` (kiểm `nslookup` từ máy bạn), hoặc NAT cổng 80 chưa áp cho tên miền mới (hỏi bộ phận hạ tầng — NAT theo IP nên thường đã có sẵn từ web VCM).
```bash
certbot renew --dry-run
```

## F.4 Google báo `redirect_uri_mismatch`
Thiếu URI chính xác `https://tandcstore.com/api/customer-auth/callback/google` ở Google Cloud → Clients. Thêm, chờ vài phút.

## F.5 Đăng nhập xong vẫn như chưa đăng nhập / lỗi origin
Đang mở tên miền khác `APP_URL` (vd `www`, `moi`, `glow-mm.vercel.app`) hoặc chưa build lại sau khi đổi `APP_URL`. Kiểm `grep ^APP_URL /var/www/tandc/.env.prod`, chạy lại lệnh build; đảm bảo `www` chuyển 301 về `tandcstore.com`.

## F.6 Không nhận được email
Resend → Domains chưa **Verified**, hoặc thư vào Spam, hoặc sai `EMAIL_FROM`/`RESEND_API_KEY`. Xem Resend → Logs.

## F.7 Khách báo "Failed to find Server Action" / bấm nút không ăn
Vừa đổi `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, hoặc khách mở tab từ bản cũ → tải lại trang là hết. Giữ khoá cố định.

## F.8 Ảnh sản phẩm 404 sau khi chuyển
Chưa chạy script chuyển ảnh Blob, hoặc chạy không có `--user 1001:1001` (sai quyền thư mục). Chạy lại lệnh ở B6.4.

## F.9 Cron không chạy
Sai `CRON_SECRET` trong `/opt/glow/cron.env` hoặc app không ở `127.0.0.1:3000`. Xem `/var/log/glow-cron.log`, chạy tay lệnh ở B7.6.

## F.10 `git pull` báo xung đột
Có ai sửa file trực tiếp trên server.
```bash
cd /var/www/tandc && git status
```
Bỏ thay đổi trên server, lấy đúng bản GitHub:
```bash
cd /var/www/tandc && git reset --hard origin/main && git pull origin main
```
> `git reset --hard` an toàn với `.env.prod` (không được Git theo dõi) và dữ liệu (nằm trong Docker volume). **TUYỆT ĐỐI KHÔNG `git clean -fd`** — xoá mất `.env.prod`.

## F.11 Hết dung lượng đĩa
```bash
df -h / && docker system df
```
```bash
docker image prune -f && docker builder prune -f
```
**Không** dùng `docker system prune --volumes` hay `docker volume prune` — xoá dữ liệu.

## F.12a Mọi khách đều bị báo "thử quá nhiều lần" khi đăng nhập
App đang thấy mọi khách cùng một IP (IP của máy LB) → rate limit gộp chung. Làm phần *real IP* ở B6.2 và kiểm tra `access.log` như hướng dẫn ở đó.

## F.12 Web VCM bị ảnh hưởng
Gần như luôn do Nginx: khôi phục bằng cách tắt site mới rồi nạp lại:
```bash
rm /etc/nginx/sites-enabled/tandc && nginx -t && systemctl reload nginx
```
Sau đó kiểm tra lại cấu hình `tandc` trước khi bật lại.

---

# Phụ lục 1 — Bản ghi DNS ở inet.vn

| Loại | Host | Giai đoạn A (Vercel) | Sau PHẦN C (server) |
|---|---|---|---|
| A | `@` | `76.76.21.21` | `<IP_CONG_CONG>` |
| CNAME / A | `www` | CNAME `cname.vercel-dns.com` | A `<IP_CONG_CONG>` |
| A | `moi` | (thêm ở B6.1: `<IP_CONG_CONG>`) | xoá |
| TXT | `resend._domainkey` | khoá DKIM Resend | giữ |
| MX | `send` | `feedback-smtp.<region>.amazonses.com` (10) | giữ |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` | giữ |
| TXT | `_dmarc` | `v=DMARC1; p=none;` | giữ |
| TXT | `@` | `google-site-verification=...` | giữ |

Giá trị Vercel/Resend lấy theo màn hình thật **[CẦN XÁC MINH]**.

# Phụ lục 2 — Khác biệt so với web VCM XDDD trên cùng server

| Mục | VCM XDDD | T&C Cosmetics |
|---|---|---|
| Thư mục | `/var/www/vcm-xddd` | `/var/www/tandc` |
| Chạy bằng | PM2 (`vcm-xddd`), Node 20 cài trên máy | Docker Compose (project `tandc`), Node 24 **trong container** |
| Cổng | `3001` (mọi card mạng) | `127.0.0.1:3000` (chỉ nội bộ) |
| Database | PostgreSQL cài trên máy, DB `vcm_xddd` | PostgreSQL 17 **trong Docker**, volume `tandc_pgdata` (không đụng PostgreSQL của máy) |
| Build | Ở máy local, commit `dist/` | **Trên server** khi chạy `docker compose up --build` |
| Migration | Chạy tay `run-migration.js` trước restart | **Tự động** (service `migrate`) trước khi app chạy |
| File bí mật | `server/.env` | `.env.prod` ở gốc repo |
| File upload | `server/uploads/` | Docker volume `tandc_uploads` |
| Cập nhật | `git pull` + `pm2 restart` | `git pull` + `docker compose ... up -d --build` |
| HTTPS | Nginx + Certbot | **Dùng chung** Nginx + Certbot, site riêng `/etc/nginx/sites-available/tandc` |
| Backup | `pg_dump` thủ công | Tự động hằng đêm, mã hoá, đẩy ra B2/R2 (B7) |
