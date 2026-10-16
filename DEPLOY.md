# DEPLOY — Triển khai Glow VN

Cùng một code chạy ở 2 môi trường. Mọi khác biệt nằm trong biến môi trường (xem `.env.example`).

| | Testing | Production (sau) |
|---|---|---|
| App | Vercel (functions `sin1` Singapore) | Server Myanmar, Coolify + Docker |
| DB | Neon Singapore (2 DB: preview, main) | PostgreSQL 17 trong Docker |
| File | Vercel Blob (`STORAGE_DRIVER=vercel-blob`) | Ổ đĩa/volume (`STORAGE_DRIVER=local`) |
| Cron | Vercel Cron (`vercel.json`) | crontab / Coolify Scheduled Tasks (`ops/cron.example`) |
| Deploy từ | `main` → Production, nhánh khác → Preview | `main` |

> Các mục ghi **[CẦN XÁC MINH]** là giao diện/chính sách của dịch vụ bên ngoài có thể đã đổi. Kiểm tra tài liệu chính thức trước khi làm.

---

## 1. Testing: GitHub + Vercel + Neon

### 1.1 GitHub
1. Tạo repo **private**, rồi push:
   ```bash
   git remote add origin git@github.com:<org>/<repo>.git
   git push -u origin main dev
   ```
2. Settings → Branches → bảo vệ `main`:
   - bắt buộc PR;
   - bắt buộc check **CI / test** đạt;
   - cấm push thẳng.
3. Quy trình: làm trên `dev` → PR `dev → main` → CI xanh → merge.

### 1.2 Neon (Singapore)
1. Tạo project với region **AWS ap-southeast-1 (Singapore)** và Postgres **17**.
2. Tạo 2 branch/database:
   - branch mặc định (Neon đặt tên `production`) → cho Vercel Production;
   - `preview` (Create child branch, **Auto-delete: Never**) → cho Vercel Preview.
3. Mỗi branch lấy 2 chuỗi kết nối:
   - **Pooled** (host có `-pooler`) → `DATABASE_URL`;
   - **Direct** (không có `-pooler`) → `DIRECT_DATABASE_URL`, dùng cho `prisma migrate`.
   - Cả hai phải có `?sslmode=require`.
   - Ô Value trên Vercel phải là **nguyên chuỗi** bắt đầu bằng `postgresql://` (chuỗi đã chứa mật khẩu), không phải chỉ mật khẩu, không có `psql`, dấu nháy hay xuống dòng. Sai định dạng → build lỗi `P1013`.
4. Không bật tính năng riêng của Neon trong code (đã tuân thủ: chỉ dùng Prisma + Postgres chuẩn).

### 1.3 Vercel
1. Import repo → Framework **Next.js**.
   - Build Command để mặc định: Vercel tự chạy `npm run vercel-build` = `prisma migrate deploy && next build`.
2. Region functions = `sin1`, đã khai báo sẵn trong `vercel.json`.
3. Storage → tạo **Blob store** → Connect vào project; Vercel tự thêm `BLOB_READ_WRITE_TOKEN`.
4. Settings → Environment Variables, đặt **riêng cho Production và Preview**:

   | Biến | Production | Preview |
   |---|---|---|
   | `DATABASE_URL` | Neon `main` pooled | Neon `preview` pooled |
   | `DIRECT_DATABASE_URL` | Neon `main` direct | Neon `preview` direct |
   | `APP_URL` | `https://<project>.vercel.app` | URL preview cố định (vd alias nhánh `dev`) |
   | `BETTER_AUTH_SECRET` | `openssl rand -base64 32` | giá trị khác |
   | `CRON_SECRET` | ngẫu nhiên ≥ 16 ký tự | giá trị khác |
   | `STORAGE_DRIVER` | `vercel-blob` | `vercel-blob` |

   - Secret chỉ dùng ký tự ASCII (dùng lệnh tạo ngẫu nhiên). Có chữ tiếng Việt có dấu trong `CRON_SECRET` → build lỗi ngay ("not valid in HTTP headers").
   - Biến Preview chọn **Preview Branches → `dev`** (bỏ tick Production) để mỗi bộ biến chỉ áp cho đúng môi trường.
   | `FB_PAGE_USERNAME`, `VIBER_CHAT_URI` | tuỳ chọn | tuỳ chọn |

5. **Cron:** `vercel.json` khai báo 3 job, đều chạy 1 lần/ngày, vì gói Hobby chỉ cho cron hằng ngày **[CẦN XÁC MINH theo gói hiện tại]**.
   - Vercel tự gửi `Authorization: Bearer $CRON_SECRET`.
   - Gói Pro có thể đổi lịch sang mỗi 15 phút.
6. **Seed dữ liệu mẫu** (chỉ cho Preview, chạy từ máy local). Không chạy seed trên Production thật. Tạo admin thật bằng cách seed **một lần** với `SEED_STAFF_PASSWORD` mạnh, rồi đổi mật khẩu.
   ```bash
   DATABASE_URL="<neon preview direct>" SEED_STAFF_PASSWORD="<mật khẩu mạnh>" npm run db:seed
   ```
7. **Kiểm tra sau deploy:**
   - `GET /api/health` trả `{"ok":true}`;
   - `/` hiển thị tiếng Myanmar;
   - đăng nhập `/admin` được.

---

## 2. Chuyển sang server Myanmar (Coolify + Docker)

### 2.1 Chuẩn bị server
- **Cấu hình khuyến nghị:** Ubuntu Server 24.04 LTS, ≥ 2 vCPU, 4 GB RAM, ≥ 40 GB SSD, IP tĩnh.
- Làm **§4 Hardening** trước khi cài bất cứ thứ gì.
- **Cài Coolify** theo lệnh trên trang chính thức coolify.io/docs **[CẦN XÁC MINH lệnh hiện tại]**. Sau khi cài:
  - vào UI ở cổng `8000` qua SSH tunnel (`ssh -L 8000:localhost:8000 user@server`);
  - tạo tài khoản admin;
  - **không mở cổng 8000 ra Internet**.
- **Kết nối mạng [CẦN XÁC MINH]:** server phải ra Internet được (GitHub, Docker Hub, npm registry, Let's Encrypt). Ở Myanmar có thể bị chặn hoặc chậm.

### 2.2 Tạo ứng dụng trong Coolify
1. Sources → thêm **GitHub App** (repo private).
2. New Resource → **Docker Compose** → chọn repo, branch `main`, file `docker-compose.prod.yml`.
   - File này gồm `db` (Postgres 17), `migrate` (`prisma migrate deploy`, chạy xong thì thoát) và `app` (Next standalone, user không phải root).
3. Environment Variables (nhập trong Coolify):
   - `POSTGRES_PASSWORD` (mạnh);
   - `APP_URL=https://<domain>`;
   - `BETTER_AUTH_SECRET`, `CRON_SECRET` (giá trị **mới**, khác Vercel);
   - `FB_PAGE_USERNAME`, `VIBER_CHAT_URI`.
4. Persistent storage:
   - volume `pgdata` (DB) và `uploads` (`/app/storage`) đã khai báo sẵn;
   - ghi lại **tên volume thật** mà Coolify tạo (`docker volume ls`) để dùng cho backup.
5. Deploy. Kiểm tra `docker ps`: `app` ở trạng thái healthy, `migrate` exited (0).

### 2.3 Domain + HTTPS
1. DNS: bản ghi `A` của `<domain>` (và `www` nếu cần) trỏ về IP server.
2. Coolify → service `app` → Domains: `https://<domain>`. Coolify (Traefik) tự xin chứng chỉ Let's Encrypt; cần cổng 80/443 mở.
3. Cập nhật `APP_URL=https://<domain>` → Redeploy.
4. Bỏ `ports: "3000:3000"` của `app` nếu Coolify định tuyến qua proxy nội bộ, để không lộ cổng 3000 **[CẦN XÁC MINH theo cách Coolify xử lý compose]**.

### 2.4 Chuyển dữ liệu từ Neon
Làm trong giờ thấp điểm, khoảng 15–30 phút ngừng ghi dữ liệu.

1. **Đóng băng ghi:**
   - thông báo cho nhân viên;
   - tạm tắt checkout: admin Vercel → **Cài đặt → bỏ chọn "Nhận đơn trên web"** → Lưu. Khách vẫn xem hàng, trang thanh toán báo tạm ngừng; đơn tạo tay trong admin không bị chặn. Cài đặt nằm trong DB nên được chuyển sang server cùng dữ liệu → **bật lại trên server mới** sau khi kiểm tra xong.
2. **Dump từ Neon**, chạy ở máy có `pg_dump` 17:
   ```bash
   pg_dump "<neon main DIRECT url>" --format=custom --no-owner --no-acl -f glow-neon.dump
   ```
3. **Chép lên server và restore** vào DB mới (DB trống, đã chạy migrate):
   ```bash
   scp glow-neon.dump user@server:/tmp/
   docker cp /tmp/glow-neon.dump <db-container>:/tmp/
   docker exec <db-container> pg_restore -U glow -d glow --clean --if-exists --no-owner --no-acl /tmp/glow-neon.dump
   ```
4. **Đối chiếu số dòng** các bảng chính (`Order`, `StockLedger`, `StockBalance`, `Batch`, `Product`) giữa Neon và server:
   ```sql
   SELECT 'Order', count(*) FROM "Order" UNION ALL SELECT 'StockLedger', count(*) FROM "StockLedger";
   ```
5. **Chuyển file** Vercel Blob → ổ đĩa bằng `scripts/migrate-blob-to-local.mjs` (có sẵn trong image `migrator`):
   - Script tải từng `FileObject` có `driver=VERCEL_BLOB` về volume `uploads` rồi cập nhật `driver=LOCAL`, `url=/api/files/<key>`. Chạy lại an toàn (chỉ xử lý dòng chưa chuyển); còn lỗi → exit code 1, chạy lại.
   - Chạy **sau khi** `app` đã khởi động ít nhất một lần (volume `uploads` được tạo với quyền của user `nextjs`), và chạy bằng `--user 1001:1001` để app ghi tiếp được vào các thư mục script tạo:
     ```bash
     docker run --rm --user 1001:1001 --network <mạng compose>        -v <volume uploads>:/app/storage -e LOCAL_STORAGE_DIR=/app/storage        -e DATABASE_URL=postgresql://glow:<POSTGRES_PASSWORD>@db:5432/glow        <image migrate> node scripts/migrate-blob-to-local.mjs --dry-run   # bỏ --dry-run để chạy thật
     ```
     Tên mạng/volume/image xem bằng `docker network ls`, `docker volume ls`, `docker image ls` **[CẦN XÁC MINH tên do Coolify đặt]**.
   - Kiểm tra vài ảnh sản phẩm và biên lai.
6. **Cron:**
   - copy `ops/cron.example` vào crontab (hoặc Coolify → Scheduled Tasks);
   - tạo `/opt/glow/cron.env` (chmod 600).
7. **Chuyển DNS/thông báo** domain mới. Giữ Vercel ở chế độ chỉ đọc vài ngày rồi tắt.

### 2.5 Checklist sau khi chuyển
- [ ] `https://<domain>/api/health` → `{"ok":true}`, chứng chỉ HTTPS hợp lệ.
- [ ] Storefront `/` (Myanmar) và `/en` hiển thị đúng; ảnh sản phẩm tải được.
- [ ] Đăng nhập admin bằng cả 3 vai trò; đổi mật khẩu mặc định (bấm tên mình ở góc trên → `/admin/account`).
- [ ] Cài đặt → bật lại "Nhận đơn trên web".
- [ ] Tồn kho trùng khớp: tổng `StockBalance` theo biến thể = số liệu trước khi chuyển.
- [ ] Đặt thử 1 đơn COD và 1 đơn chuyển khoản (upload biên lai → duyệt) rồi huỷ.
- [ ] Gọi tay từng cron với `CRON_SECRET` → 200; không có secret → 401.
- [ ] Backup đầu tiên chạy thành công, file có trên off-site (§3).
- [ ] **Khôi phục thử** backup đó vào một DB tạm (§3.3) → OK.
- [ ] Firewall chỉ mở 22/80/443 (`sudo ufw status`), không lộ cổng DB/3000/8000.

---

## 3. Backup hằng ngày ra off-site + khôi phục

**Nguyên tắc:**
- Backup **DB + file upload**, mã hoá trước khi rời server (`age`).
- Lưu **ngoài Myanmar**, vd Backblaze B2, Cloudflare R2 hoặc S3 Singapore.
- Lưu 7 ngày ở local, 30 ngày ở off-site.
- **[CẦN XÁC MINH]** quy định lưu trữ dữ liệu khách hàng ra nước ngoài theo luật Myanmar hiện hành.

### 3.1 Cài đặt (một lần)
```bash
sudo apt install -y rclone age
age-keygen -o ~/glow-backup.key        # GIỮ private key ở nơi an toàn NGOÀI server (password manager)
grep 'public key' ~/glow-backup.key    # → AGE_RECIPIENT=age1...
rclone config                          # tạo remote, vd tên "b2" → RCLONE_REMOTE=b2:glow-backups
sudo mkdir -p /opt/glow && sudo cp ops/backup.sh ops/restore.sh /opt/glow/ && sudo chmod 700 /opt/glow/*.sh
```

`/opt/glow/cron.env` (chmod 600):
```
CRON_SECRET=...
APP_URL=https://<domain>
DB_CONTAINER=<tên container postgres, xem docker ps>
UPLOADS_VOLUME=<tên volume uploads, xem docker volume ls>
RCLONE_REMOTE=b2:glow-backups
AGE_RECIPIENT=age1...
```

Sau khi cài, **xoá private key khỏi server**: server chỉ cần public key để mã hoá.

### 3.2 Lịch chạy
- `ops/cron.example`: backup lúc 02:30 giờ Yangon. Log ghi ở `/var/log/glow-backup.log`.
- Coolify cũng có backup S3 cho DB do Coolify quản lý. Có thể bật thêm, nhưng script trên là nguồn chính, vì nó backup cả file upload.

### 3.3 Khôi phục
1. Tải bản cần khôi phục: `rclone copy b2:glow-backups/db-<stamp>.dump.age .` (kèm `uploads-<stamp>.tar.gz.age` nếu cần).
2. Đưa private key lên tạm thời (`AGE_KEY_FILE`).
3. **Khôi phục thử** (khuyến nghị mỗi tháng), vào một DB tạm:
   ```bash
   docker run -d --name glow-restore-test -e POSTGRES_USER=glow -e POSTGRES_PASSWORD=x -e POSTGRES_DB=glow postgres:17.6-alpine
   DB_CONTAINER=glow-restore-test AGE_KEY_FILE=./glow-backup.key /opt/glow/restore.sh db-<stamp>.dump.age
   docker exec glow-restore-test psql -U glow -d glow -c 'SELECT count(*) FROM "Order";'
   docker rm -f glow-restore-test
   ```
4. **Khôi phục thật:**
   - dừng service `app` trong Coolify;
   - chạy `restore.sh` với `DB_CONTAINER` thật (và `UPLOADS_VOLUME`);
   - Start `app` lại → kiểm tra theo checklist §2.5.
5. Xoá private key khỏi server sau khi xong.

---

## 4. Hardening server cơ bản (Ubuntu 24.04)

```bash
# Người dùng riêng + SSH key (chạy với root lần đầu)
adduser deploy && usermod -aG sudo deploy
mkdir -p /home/deploy/.ssh && cp ~/.ssh/authorized_keys /home/deploy/.ssh/ && chown -R deploy:deploy /home/deploy/.ssh && chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys
```
→ Mở cửa sổ SSH mới bằng `deploy` + key và **xác nhận vào được** trước khi làm bước tiếp theo.

```bash
# Chỉ cho đăng nhập bằng SSH key, cấm root
sudo tee /etc/ssh/sshd_config.d/99-hardening.conf >/dev/null <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
EOF
sudo sshd -t && sudo systemctl reload ssh

# Firewall: chỉ SSH + HTTP/HTTPS
sudo ufw default deny incoming && sudo ufw default allow outgoing
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
sudo ufw enable

# Cập nhật bảo mật tự động + chặn dò mật khẩu
sudo apt update && sudo apt -y upgrade
sudo apt install -y unattended-upgrades fail2ban
sudo dpkg-reconfigure -plow unattended-upgrades
sudo systemctl enable --now fail2ban

# Múi giờ UTC (lịch cron trong ops/cron.example tính theo UTC), đồng bộ giờ
sudo timedatectl set-timezone UTC && timedatectl status
```

**Lưu ý:**
- **Docker bỏ qua ufw** với cổng đã publish (`ports:`). Vì vậy không publish cổng Postgres, chỉ để proxy Coolify nhận 80/443. Kiểm tra bằng `sudo ss -tlnp`.
- Giới hạn log Docker trong `/etc/docker/daemon.json`, rồi `sudo systemctl restart docker`:
  ```json
  {"log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"3"}}
  ```
- **Coolify UI:** chỉ truy cập qua SSH tunnel; bật 2FA cho tài khoản admin Coolify.
- **Hằng tháng:**
  - `sudo apt upgrade`;
  - cập nhật Coolify;
  - khôi phục thử backup (§3.3);
  - xem `/var/log/glow-backup.log`.
