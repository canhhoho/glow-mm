# Hướng dẫn đưa T&C Cosmetics lên tandcstore.com và server riêng

Runbook làm theo từng bước. Tài liệu tham khảo chi tiết: [DEPLOY.md](../DEPLOY.md). Đánh dấu `[x]` khi xong từng ô.

| | Giá trị |
|---|---|
| Tên miền chính | `tandcstore.com` (`www.tandcstore.com` tự chuyển về) |
| Nơi quản lý DNS | inet.vn |
| Server | Ubuntu, IP nội bộ `10.201.42.65`, IP công khai: `<IP_CONG_KHAI>` (điền vào) |
| Repo | `github.com/canhhoho/glow-mm` (private), deploy từ nhánh `main` |
| Đang chạy | Vercel `glow-mm.vercel.app` + Neon (DB) + Vercel Blob (ảnh) |

**Lộ trình 2 giai đoạn**
- **A — làm ngay (1–2 giờ, chủ yếu chờ DNS):** tandcstore.com chạy trên Vercel hiện tại, bật email và cập nhật đăng nhập Google. Khách dùng tên miền mới từ hôm nay.
- **B — khi server sẵn sàng:**
  - dựng server, chạy thử trên `moi.tandcstore.com`;
  - chọn một ngày chuyển dữ liệu rồi đổi DNS sang server;
  - khách không phải đổi gì.

> **Quy ước**
> - `<...>` là chỗ cần điền.
> - **[CẦN XÁC MINH]** là giao diện hoặc chính sách của dịch vụ ngoài có thể đã đổi: làm theo màn hình thật.
> - **Không dán secret** (mật khẩu, token, khoá) vào chat hay vào git. Sinh secret bằng `openssl rand -base64 32`; trên Windows dùng Git Bash, hoặc chạy lệnh trên server.

---

## 0. Chuẩn bị

- [ ] Tài khoản đăng nhập được:
  - inet.vn (DNS);
  - Vercel (team "cavaho", project `glow-mm`);
  - Google Cloud (OAuth client hiện có);
  - [resend.com](https://resend.com) (tạo mới nếu chưa có);
  - GitHub;
  - nơi lưu backup ngoài server: Backblaze B2 hoặc Cloudflare R2 (giai đoạn B).
- [ ] **IP công khai của server.** SSH vào server rồi chạy:
  ```bash
  ip -4 addr | grep inet          # thấy 10.201.42.65 = IP nội bộ
  curl -4 -s ifconfig.me; echo    # IP mà Internet nhìn thấy → ghi vào <IP_CONG_KHAI>
  ```
  - Nếu IP công khai **khác** `10.201.42.65` thì server nằm sau router/NAT. Nhờ bộ phận mạng **chuyển cổng (port forward) TCP 80 và 443** từ `<IP_CONG_KHAI>` về `10.201.42.65`.
  - **Không** cần mở cổng 22 (SSH), 3000, 5432, 8000 ra Internet.
- [ ] Kiểm tra cổng từ **mạng ngoài**, ví dụ từ điện thoại dùng 4G hoặc trang kiểm tra cổng online, sau khi Coolify đã chạy ở bước B2:
  ```bash
  nc -vz <IP_CONG_KHAI> 80
  nc -vz <IP_CONG_KHAI> 443
  ```

---

## Giai đoạn A — tandcstore.com trên Vercel

### A1. Gắn tên miền vào Vercel
- [ ] Vercel → project `glow-mm` → **Settings → Domains → Add**:
  - `tandcstore.com`, chọn làm tên miền chính (Production);
  - `www.tandcstore.com`, chọn **Redirect to `tandcstore.com`** (308).
- [ ] Ghi lại các bản ghi DNS Vercel yêu cầu. Thường là **[CẦN XÁC MINH theo màn hình Vercel]**:

  | Loại | Tên (Host) | Giá trị |
  |---|---|---|
  | A | `@` | `76.76.21.21` |
  | CNAME | `www` | `cname.vercel-dns.com` |

### A2. Tạo bản ghi ở inet.vn
- [ ] inet.vn → Quản lý tên miền → `tandcstore.com` → **Quản lý DNS** **[CẦN XÁC MINH tên menu]**.
- [ ] Xoá bản ghi `A @` và `www` mặc định (trang đỗ của nhà đăng ký) nếu có.
- [ ] Thêm đúng các bản ghi ở A1, đặt **TTL 300**.
- [ ] Chờ 5–30 phút rồi kiểm tra:
  ```bash
  nslookup tandcstore.com
  nslookup www.tandcstore.com
  ```
- [ ] Vercel → Domains: cả hai hiện **Valid Configuration**, HTTPS tự cấp.

### A3. Đổi URL gốc của app
- [ ] Vercel → **Settings → Environment Variables** → `APP_URL` (môi trường **Production**): `https://tandcstore.com`.
- [ ] **Deployments → Redeploy** bản Production mới nhất.
  - Bắt buộc build lại: canonical, sitemap, Open Graph và phiên đăng nhập (Better Auth) đều dùng `APP_URL`.
- [ ] Vercel → Domains → `glow-mm.vercel.app` → chọn **Redirect to `tandcstore.com`** **[CẦN XÁC MINH Vercel cho phép với tên miền .vercel.app]**.
  - Link cũ (kể cả link CTV `?ref=MAUNG`) tự chuyển sang tên miền mới.
  - Đăng nhập chỉ hoạt động trên `APP_URL`.
  - Nếu Vercel không cho chuyển hướng tên miền `.vercel.app`, báo Claude thêm chuyển hướng trong code.

### A4. Đăng nhập Google
- [ ] Google Cloud Console → **Google Auth Platform → Clients** → client web hiện có → thêm (giữ nguyên URI cũ):
  - Authorized JavaScript origins: `https://tandcstore.com`
  - Authorized redirect URIs: `https://tandcstore.com/api/customer-auth/callback/google`
  - Bấm **Save**. Thay đổi có thể mất vài phút mới có hiệu lực.
- [ ] **Branding**:
  - Authorized domains: thêm `tandcstore.com`;
  - App home page: `https://tandcstore.com`;
  - Privacy policy: `https://tandcstore.com/info/privacy`;
  - Terms of service: để trống (web chưa có trang điều khoản; các trang thông tin hiện có là about, shipping, payment, returns, privacy).
- [ ] **Xác minh sở hữu tên miền:** [Google Search Console](https://search.google.com/search-console) → Add property → **Domain** `tandcstore.com` → Google đưa một bản ghi **TXT** → thêm ở inet.vn (Host `@`) → Verify.
- [ ] Quay lại **Verification Center / Branding → Verify branding**.
  - Sau khi Google duyệt, màn hình đăng nhập Google hiện tên "T&C Cosmetics" thay vì tên miền **[CẦN XÁC MINH thời gian duyệt]**.
  - Trong lúc chờ duyệt, đăng nhập Google vẫn chạy bình thường.

### A5. Email (Resend)
Bật đăng ký/đăng nhập bằng email, cùng chức năng quên mật khẩu.
- [ ] resend.com → **Domains → Add Domain** → `tandcstore.com`, region gần nhất (vd Tokyo/Singapore) **[CẦN XÁC MINH]**.
- [ ] Chép **từng bản ghi** Resend hiển thị vào inet.vn. Thường gồm **[CẦN XÁC MINH theo màn hình Resend]**:

  | Loại | Tên (Host) | Giá trị |
  |---|---|---|
  | TXT | `resend._domainkey` | `p=MIGf...` (khoá DKIM dài) |
  | MX | `send` | `feedback-smtp.<region>.amazonses.com`, ưu tiên 10 |
  | TXT | `send` | `v=spf1 include:amazonses.com ~all` |

- [ ] Thêm DMARC (khuyến nghị): TXT, Host `_dmarc`, giá trị `v=DMARC1; p=none;`.
- [ ] Nếu tên miền **đã có email khác** (vd hộp thư inet): **không xoá** MX/SPF cũ ở `@`. Các bản ghi Resend nằm ở `send` và `resend._domainkey` nên không đụng nhau.
- [ ] Chờ Resend báo **Verified** (vài phút tới vài giờ).
- [ ] Resend → **API Keys → Create** (quyền *Sending access*, chỉ domain `tandcstore.com`) → chép key, chỉ hiện một lần.
- [ ] Vercel → Environment Variables (Production):
  - `EMAIL_DRIVER` = `resend`
  - `RESEND_API_KEY` = key vừa tạo
  - `EMAIL_FROM` = `T&C Cosmetics <no-reply@tandcstore.com>`
- [ ] **Redeploy.**

### A6. Kiểm tra giai đoạn A
Mở bằng **cửa sổ ẩn danh**:
- [ ] `https://tandcstore.com` hiện trang chủ tiếng Myanmar, ổ khoá HTTPS hợp lệ.
- [ ] `https://www.tandcstore.com` và `https://glow-mm.vercel.app` chuyển về `https://tandcstore.com`.
- [ ] `https://tandcstore.com/sitemap.xml` và `/robots.txt` chỉ chứa `tandcstore.com`.
- [ ] `/en/login`:
  - đăng nhập **Google** → về `/en/account`;
  - đăng ký bằng **email** → nhận thư xác minh (kiểm tra cả Spam);
  - **quên mật khẩu** → nhận link.
- [ ] Đăng nhập SĐT + mật khẩu vẫn chạy.
- [ ] `/admin` (cả 3 vai trò) và cổng `/ctv` đăng nhập được.
- [ ] Link CTV `https://tandcstore.com/?ref=<mã CTV>` → đặt thử đơn → đơn gắn đúng CTV (rồi huỷ).
- [ ] Từ máy có `curl`:
  ```bash
  curl -sI https://tandcstore.com/en | grep -iE "strict-transport|content-security"
  ```
  Phải có `Strict-Transport-Security` và CSP chứa `upgrade-insecure-requests`.
- [ ] Search Console → **Sitemaps** → gửi `https://tandcstore.com/sitemap.xml`.
- [ ] Cập nhật link ở Facebook page, Viber, danh thiếp sang `tandcstore.com`.

---

## Giai đoạn B — chuyển sang server riêng

Thứ tự: **B1 → B2 → B3** (chạy thử, khách không bị ảnh hưởng), **B5** (cron + backup), rồi chọn ngày làm **B4** (chuyển chính thức).

### B1. Bảo mật server (chạy một lần)
SSH vào server bằng tài khoản có `sudo`:
```bash
# Người dùng riêng cho vận hành + SSH key (bỏ qua nếu đã có user sudo dùng key)
sudo adduser deploy && sudo usermod -aG sudo deploy
sudo mkdir -p /home/deploy/.ssh && sudo cp ~/.ssh/authorized_keys /home/deploy/.ssh/
sudo chown -R deploy:deploy /home/deploy/.ssh && sudo chmod 700 /home/deploy/.ssh && sudo chmod 600 /home/deploy/.ssh/authorized_keys
```
→ Mở **cửa sổ SSH mới** bằng `ssh deploy@10.201.42.65` và **xác nhận vào được** rồi mới làm tiếp.
```bash
# Chỉ đăng nhập bằng SSH key, cấm root
sudo tee /etc/ssh/sshd_config.d/99-hardening.conf >/dev/null <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
EOF
sudo sshd -t && sudo systemctl reload ssh

# Firewall: SSH chỉ từ mạng nội bộ; web 80/443 từ mọi nơi
sudo ufw default deny incoming && sudo ufw default allow outgoing
sudo ufw allow from 10.0.0.0/8 to any port 22 proto tcp
sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
sudo ufw enable && sudo ufw status

# Cập nhật bảo mật tự động + chặn dò mật khẩu + múi giờ UTC (lịch cron tính theo UTC)
sudo apt update && sudo apt -y upgrade
sudo apt install -y unattended-upgrades fail2ban rclone age
sudo dpkg-reconfigure -plow unattended-upgrades
sudo systemctl enable --now fail2ban
sudo timedatectl set-timezone UTC
```
- Nếu bạn SSH từ **ngoài** mạng nội bộ (qua Internet) thì thay dòng `ufw allow from 10.0.0.0/8 …` bằng `sudo ufw allow OpenSSH`.
- **Docker bỏ qua ufw** với cổng đã publish. App chỉ publish `127.0.0.1:3000` và Postgres không publish, nên an toàn. Kiểm tra sau B3 bằng `sudo ss -tlnp`.

### B2. Cài Docker + Coolify
```bash
# Script chính thức cài Docker + Coolify [CẦN XÁC MINH lệnh hiện tại tại https://coolify.io/docs]
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash
```
- [ ] Giới hạn dung lượng log Docker:
  ```bash
  echo '{"log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"3"}}' | sudo tee /etc/docker/daemon.json
  sudo systemctl restart docker
  ```
  Nếu file `daemon.json` đã có nội dung do Coolify tạo thì **gộp tay** thay vì ghi đè.
- [ ] Vào giao diện Coolify **qua SSH tunnel**. Không mở cổng 8000 ra ngoài.
  ```bash
  ssh -L 8000:localhost:8000 deploy@10.201.42.65   # chạy trên máy tính của bạn
  ```
  → mở `http://localhost:8000` → tạo tài khoản admin → **bật 2FA**.
- [ ] Kiểm tra server ra Internet được (cần cho build):
  ```bash
  curl -sI https://github.com https://registry.npmjs.org https://registry-1.docker.io/v2/ | grep HTTP
  ```

### B3. Chạy thử trên `moi.tandcstore.com`
Khách vẫn dùng Vercel. Mục đích là chạy thật toàn bộ trên server với bản sao dữ liệu.

**B3.1 DNS**
- [ ] inet.vn: thêm `A`, Host `moi`, giá trị `<IP_CONG_KHAI>`, TTL 300.

**B3.2 Tạo ứng dụng trong Coolify**
- [ ] **Sources → GitHub App** → cài vào repo `canhhoho/glow-mm`.
- [ ] **Projects → New → Resource → Docker Compose** → repo `glow-mm`, branch `main`, file `docker-compose.prod.yml`.
- [ ] Service `app` → **Domains**: `https://moi.tandcstore.com`; cổng nội bộ `3000`.
- [ ] **Environment Variables** (sinh secret trên server bằng `openssl rand -base64 32`):

  | Biến | Giá trị | Ghi chú |
  |---|---|---|
  | `POSTGRES_PASSWORD` | ngẫu nhiên, mạnh | Mật khẩu DB trong Docker. **Lưu vào trình quản lý mật khẩu.** |
  | `APP_URL` | `https://moi.tandcstore.com` | Dùng **cả lúc build**. Đổi ở B4. |
  | `BETTER_AUTH_SECRET` | ngẫu nhiên | **Mới**, khác Vercel. Khách phải đăng nhập lại trên server (bình thường). |
  | `CRON_SECRET` | ngẫu nhiên (chỉ chữ/số ASCII) | Dùng cho crontab ở B5. |
  | `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | `openssl rand -base64 32` | **Biến build**. Tạo **một lần, giữ mãi**; đổi thì tab khách đang mở sẽ lỗi khi gửi form. |
  | `DATABASE_POOL_MAX` | `20` | |
  | `FB_PAGE_USERNAME`, `VIBER_CHAT_URI` | như trên Vercel | Tuỳ chọn. |
  | `EMAIL_DRIVER`, `RESEND_API_KEY`, `EMAIL_FROM` | như trên Vercel (A5) | |
  | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | như trên Vercel | Muốn thử Google trên `moi` thì thêm tạm redirect `https://moi.tandcstore.com/api/customer-auth/callback/google` ở Google (xoá ở B4). |

  - `APP_URL` và `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` phải có **lúc build**: trong Coolify đánh dấu **Build Variable / Available at Buildtime** **[CẦN XÁC MINH tên tuỳ chọn]**.
  - `NEXT_DEPLOYMENT_ID` lấy tự động từ `SOURCE_COMMIT` nếu Coolify truyền **[CẦN XÁC MINH]**. Không có cũng không sao.
- [ ] **Deploy.** Lần đầu build mất 5–10 phút. Xem log trong Coolify.
- [ ] Kiểm tra trên server:
  ```bash
  docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
  ```
  - `migrate` ở trạng thái **Exited (0)**;
  - `app` **healthy**, cổng `127.0.0.1:3000->3000`;
  - `db` healthy, không có cổng publish.
  ```bash
  curl -s https://moi.tandcstore.com/api/health   # {"ok":true}
  sudo ss -tlnp | grep -E ':(3000|5432|8000)\b'   # chỉ 127.0.0.1 hoặc không có
  ```

**B3.3 Ghi lại tên do Coolify đặt** (dùng cho các bước sau):
```bash
docker ps --format '{{.Names}}' | grep -E 'db|app'      # → <DB_CONTAINER>, <APP_CONTAINER>
docker volume ls --format '{{.Name}}' | grep -E 'uploads|pgdata|next-cache'   # → <UPLOADS_VOLUME>
docker network ls --format '{{.Name}}'                   # mạng chứa db/app → <NETWORK>
docker images --format '{{.Repository}}:{{.Tag}}' | grep -i migrate           # → <MIGRATE_IMAGE>
```

**B3.4 Chạy thử chuyển dữ liệu** (bản sao, không cần đóng băng)
- [ ] Lấy **chuỗi kết nối DIRECT** (không có `-pooler`) của Neon nhánh production: Neon → Connect → bỏ chọn Pooled.
- [ ] Dump Neon **ngay trên server** bằng Postgres 17 trong Docker (không cần cài pg_dump):
  ```bash
  mkdir -p ~/migrate && cd ~/migrate
  read -rs NEON_URL && export NEON_URL     # dán chuỗi Neon (không hiện ra màn hình), Enter
  docker run --rm -e NEON_URL -v "$PWD":/out postgres:17.6-alpine \
    sh -c 'pg_dump "$NEON_URL" --format=custom --no-owner --no-acl -f /out/neon.dump'
  ls -lh neon.dump
  ```
  - Nếu server không ra được cổng 5432 của Neon: chạy cùng lệnh trên máy tính có Docker, rồi `scp neon.dump deploy@10.201.42.65:~/migrate/`.
- [ ] Restore vào DB trên server (DB đã được `migrate` tạo bảng):
  ```bash
  docker cp neon.dump <DB_CONTAINER>:/tmp/neon.dump
  docker exec <DB_CONTAINER> pg_restore -U glow -d glow --clean --if-exists --no-owner --no-acl /tmp/neon.dump
  ```
- [ ] Đối chiếu số dòng **Neon ↔ server** (hai kết quả phải giống nhau):
  ```bash
  Q='SELECT (SELECT count(*) FROM "Order") orders, (SELECT count(*) FROM "StockLedger") ledger, (SELECT count(*) FROM "StockBalance") balance, (SELECT count(*) FROM "Batch") batches, (SELECT count(*) FROM "Product") products, (SELECT count(*) FROM "user") users, (SELECT coalesce(sum(qty),0) FROM "StockBalance") total_qty'
  docker run --rm -e NEON_URL postgres:17.6-alpine sh -c "psql \"\$NEON_URL\" -c '$Q'"
  docker exec <DB_CONTAINER> psql -U glow -d glow -c "$Q"
  ```
- [ ] Chuyển ảnh/biên lai từ Vercel Blob về ổ đĩa server. Chạy **sau khi app đã khởi động ít nhất một lần**, chạy thử trước rồi chạy thật:
  ```bash
  read -rs PGPW && export PGPW              # dán POSTGRES_PASSWORD
  docker run --rm --user 1001:1001 --network <NETWORK> \
    -v <UPLOADS_VOLUME>:/app/storage -e LOCAL_STORAGE_DIR=/app/storage \
    -e DATABASE_URL="postgresql://glow:$PGPW@db:5432/glow" \
    <MIGRATE_IMAGE> node scripts/migrate-blob-to-local.mjs --dry-run
  # Xem số file sẽ chuyển → chạy lại lệnh trên KHÔNG có --dry-run. Lỗi mạng → chạy lại (chỉ xử lý file chưa chuyển).
  ```
  - Host `db` là tên service trong compose. Nếu Coolify đổi tên thì dùng `<DB_CONTAINER>`.
- [ ] Khởi động lại app (Coolify → Restart) để xoá cache, rồi kiểm tra trên `https://moi.tandcstore.com`:
  - trang chủ, ảnh SP, banner;
  - đăng nhập admin (tài khoản thật đi theo dữ liệu Neon);
  - cổng CTV;
  - xem một biên lai chuyển khoản (chỉ admin xem được).
- [ ] Đặt thử 1 đơn COD trên `moi` → huỷ trong admin. Đây là dữ liệu chạy thử; ở B4 DB sẽ bị ghi đè bằng bản Neon mới nhất.

### B5. Cron + backup (làm ngay sau B3, trước B4)
**B5.1 Chép script lên server.** Repo private, nên chép từ máy tính của bạn, trong thư mục code:
```bash
scp ops/backup.sh ops/restore.sh ops/cron.example deploy@10.201.42.65:/tmp/
```
Trên server:
```bash
sudo mkdir -p /opt/glow && sudo mv /tmp/backup.sh /tmp/restore.sh /opt/glow/ && sudo chmod 700 /opt/glow/*.sh
sudo touch /var/log/glow-cron.log /var/log/glow-backup.log
```

**B5.2 Khoá mã hoá backup** (giữ private key **ngoài** server):
```bash
age-keygen -o ~/glow-backup.key
grep 'public key' ~/glow-backup.key        # → AGE_RECIPIENT=age1...
cat ~/glow-backup.key                      # chép TOÀN BỘ vào trình quản lý mật khẩu
rm ~/glow-backup.key                       # server chỉ cần public key
```

**B5.3 Nơi lưu off-site.** Backblaze B2 hoặc Cloudflare R2, tạo bucket `glow-backups` và key chỉ có quyền bucket đó:
```bash
sudo rclone config       # tạo remote, vd tên "b2" → RCLONE_REMOTE=b2:glow-backups (chạy bằng root vì cron chạy root)
sudo rclone lsd b2:      # thấy bucket
```

**B5.4 File cấu hình cron:**
```bash
sudo tee /opt/glow/cron.env >/dev/null <<'EOF'
CRON_SECRET=<giống biến CRON_SECRET trong Coolify>
DB_CONTAINER=<DB_CONTAINER>
UPLOADS_VOLUME=<UPLOADS_VOLUME>
RCLONE_REMOTE=b2:glow-backups
AGE_RECIPIENT=age1...
EOF
sudo chmod 600 /opt/glow/cron.env
```
- Coolify có thể đặt lại tên container sau mỗi lần deploy **[CẦN XÁC MINH]**. Nếu `DB_CONTAINER` đổi, cập nhật file này (kiểm bằng `docker ps`).

**B5.5 Lịch chạy:** `sudo crontab -e` → dán **các dòng lệnh** trong `/tmp/cron.example` (bỏ phần chú thích cũng được). Lịch theo UTC:

| Job | Lịch |
|---|---|
| Nhả hàng giữ quá hạn | mỗi 15 phút |
| Huỷ COD chưa xác nhận | mỗi 15 phút |
| Cảnh báo tồn | 06:00 Yangon |
| Dọn dữ liệu tạm | 03:30 Yangon |
| Backup | 02:30 Yangon |

**B5.6 Thử ngay:**
```bash
sudo bash -c 'set -a; . /opt/glow/cron.env; curl -fsS -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/api/cron/cleanup'; echo
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/cron/cleanup     # 401 (không có secret)
sudo bash -c 'set -a; . /opt/glow/cron.env; /opt/glow/backup.sh' && sudo rclone ls b2:glow-backups
```

**B5.7 Khôi phục thử** (mỗi tháng một lần). Đưa private key lên tạm, khôi phục vào DB tạm, rồi xoá key:
```bash
sudo rclone copy b2:glow-backups/<db-...>.dump.age ~/restore-test/
docker run -d --name glow-restore-test -e POSTGRES_USER=glow -e POSTGRES_PASSWORD=x -e POSTGRES_DB=glow postgres:17.6-alpine
sudo DB_CONTAINER=glow-restore-test AGE_KEY_FILE=~/glow-backup.key /opt/glow/restore.sh ~/restore-test/<db-...>.dump.age
docker exec glow-restore-test psql -U glow -d glow -c 'SELECT count(*) FROM "Order";'
docker rm -f glow-restore-test && rm -f ~/glow-backup.key
```

### B4. Ngày chuyển chính thức
Chọn giờ ít khách (vd 22:00 giờ Yangon). Ngừng ghi khoảng **30–60 phút**.

**Hôm trước**
- [ ] inet.vn: TTL của `@` và `www` → **300** (để đổi IP có hiệu lực nhanh).
- [ ] B3 và B5 đã chạy ổn, backup thử đã khôi phục được.
- [ ] Báo nhân viên giờ bảo trì; không tạo đơn và không nhập kho trong thời gian này.

**Trong giờ chuyển**
1. [ ] Admin **Vercel** (`tandcstore.com/admin`) → **Cài đặt → bỏ chọn "Nhận đơn trên web"** → Lưu.
   Khách vẫn xem hàng, còn checkout báo tạm ngừng.
2. [ ] Trên server: dump Neon **lần cuối**, restore, đối chiếu số dòng (lặp lại các lệnh ở B3.4).
3. [ ] Chạy lại script chuyển ảnh Blob (chỉ xử lý ảnh mới từ lần chạy thử).
4. [ ] Coolify → service `app`:
   - **Domains** = `https://tandcstore.com,https://www.tandcstore.com`;
   - bật chuyển hướng `www` → không `www` nếu Coolify có tuỳ chọn **[CẦN XÁC MINH]**;
   - **Environment** `APP_URL=https://tandcstore.com`;
   - **Redeploy (build lại)**, chờ app healthy.
5. [ ] inet.vn:
   - `A @` → `<IP_CONG_KHAI>` (thay `76.76.21.21`);
   - `www` → xoá CNAME Vercel, thêm `A www` → `<IP_CONG_KHAI>`;
   - giữ nguyên bản ghi Resend và Google TXT.
6. [ ] Chờ DNS đổi (`nslookup tandcstore.com` ra `<IP_CONG_KHAI>`).
   - Coolify (Traefik) tự xin chứng chỉ Let's Encrypt, cần cổng 80 mở từ ngoài.
   - Kiểm tra `https://tandcstore.com/api/health` → `{"ok":true}`, ổ khoá hợp lệ.
7. [ ] Admin trên **server** → **Cài đặt → bật lại "Nhận đơn trên web"**.
8. [ ] Đặt thử 1 đơn COD và 1 đơn chuyển khoản (upload biên lai → duyệt) → huỷ cả hai.
9. [ ] Chạy checklist đầy đủ [DEPLOY.md §2.5](../DEPLOY.md):
   - header CSP/HSTS;
   - 3 vai trò admin;
   - Google + email;
   - cron 200/401;
   - firewall;
   - tồn kho khớp.

**Sau giờ chuyển**
- [ ] Google OAuth: xoá redirect `moi.tandcstore.com`; giữ `tandcstore.com`.
- [ ] inet.vn: xoá bản ghi `moi`; trả TTL `@`/`www` về 3600.
- [ ] Vercel: **Domains** → gỡ `tandcstore.com`, `www`. Để project chạy thêm vài ngày phòng sự cố, **không** dùng nhận đơn trên Vercel.
- [ ] Theo dõi 2–3 ngày đầu:
  - log app (Coolify → Logs);
  - `/var/log/glow-cron.log`, `/var/log/glow-backup.log`;
  - backup có lên B2/R2 hằng đêm.

### B6. Phương án quay lại
- **Trong vài giờ đầu, nếu lỗi nặng và CHƯA có đơn mới trên server:**
  - trả DNS `@`/`www` về bản ghi Vercel (A1);
  - gắn lại domain trên Vercel;
  - bật lại "Nhận đơn trên web" trên Vercel.
- **Đã có đơn/nhập kho mới trên server:** **không quay lại** (sẽ mất dữ liệu mới). Sửa lỗi trên server; báo Claude kèm log.

### B7. Vận hành hằng ngày sau khi chuyển
- **Cập nhật web:**
  - Claude làm trên `dev` → CI xanh → merge `main`;
  - Coolify tự build khi `main` đổi (bật **Auto Deploy**/webhook trong resource **[CẦN XÁC MINH]**), hoặc bấm **Redeploy**.
- **Không đổi** `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` và `BETTER_AUTH_SECRET`. Đổi secret thứ hai sẽ đăng xuất toàn bộ người dùng.
- **Hằng tháng:**
  - `sudo apt update && sudo apt -y upgrade`;
  - cập nhật Coolify (trong giao diện);
  - khôi phục thử backup (B5.7);
  - xem dung lượng đĩa bằng `df -h` và `docker system df`.
- **Sau 1–2 tuần ổn định:** báo Claude dọn code chỉ dùng cho Vercel ([DEPLOY.md §5](../DEPLOY.md)) và tắt hẳn project Vercel + Neon + Blob, sau khi đã có backup cuối.

---

## Phụ lục 1 — Bản ghi DNS ở inet.vn

| Loại | Host | Giai đoạn A | Sau B4 |
|---|---|---|---|
| A | `@` | `76.76.21.21` (Vercel) | `<IP_CONG_KHAI>` |
| CNAME / A | `www` | CNAME `cname.vercel-dns.com` | A `<IP_CONG_KHAI>` |
| A | `moi` | — (thêm ở B3: `<IP_CONG_KHAI>`) | xoá |
| TXT | `resend._domainkey` | khoá DKIM của Resend | giữ |
| MX | `send` | `feedback-smtp.<region>.amazonses.com` (10) | giữ |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` | giữ |
| TXT | `_dmarc` | `v=DMARC1; p=none;` | giữ |
| TXT | `@` | `google-site-verification=...` | giữ |

Giá trị Vercel/Resend lấy theo màn hình thật **[CẦN XÁC MINH]**.

## Phụ lục 2 — Lỗi hay gặp

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| Coolify báo không cấp được chứng chỉ HTTPS | DNS chưa trỏ về `<IP_CONG_KHAI>`, hoặc cổng 80 chưa mở/chuyển cổng | `nslookup`; kiểm tra cổng 80 từ mạng ngoài; xem log proxy trong Coolify |
| Google báo `redirect_uri_mismatch` | Thiếu URI đúng `https://tandcstore.com/api/customer-auth/callback/google` | Thêm ở Google Cloud → Clients; chờ vài phút |
| Đăng nhập xong vẫn như chưa đăng nhập / lỗi origin | Đang mở domain khác `APP_URL` (vd `glow-mm.vercel.app`, `www`) | Bật chuyển hướng về `tandcstore.com`; kiểm tra `APP_URL` và đã build lại |
| Không nhận được email | Resend chưa Verified; thư vào Spam; sai `EMAIL_FROM` | Resend → Domains → kiểm tra; Logs trong Resend |
| Khách báo "Failed to find Server Action" / form không gửi | Vừa đổi `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, hoặc tab mở từ bản cũ | Giữ khoá cố định; khách tải lại trang |
| Ảnh SP 404 sau khi chuyển | Chưa chạy script chuyển ảnh, hoặc volume sai quyền | Chạy lại B3.4 (script ảnh, `--user 1001:1001`) |
| Build trên Coolify lỗi khi prerender | Trang mới đọc biến môi trường lúc build | Báo Claude (quy tắc trong CLAUDE.md: `env()` phải đọc lúc chạy) |
| Cron không chạy | Sai `CRON_SECRET` trong `/opt/glow/cron.env`, hoặc app không ở `127.0.0.1:3000` | Xem `/var/log/glow-cron.log`; chạy tay lệnh ở B5.6 |
