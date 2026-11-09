# DEPLOY — Triển khai T&C Cosmetics

Cùng một code chạy ở 2 môi trường. Mọi khác biệt nằm trong biến môi trường (xem `.env.example`).

Đợt quy trình 05/11/2026 có migration D1/D3/D4/D5/D8. Trước phát hành cần CI, backup/khôi phục thử và nghiệm thu; các lệnh cập nhật server nằm ở PHẦN 4 của `docs/lenh-trien-khai-tandcstore.md`. Analytics nội bộ mặc định bật (`ANALYTICS_ENABLED=true`, `ANALYTICS_RETENTION_DAYS=180`), cần cron `cleanup`; tắt thu thập không xóa lịch sử, cleanup vẫn áp thời hạn. Xem `docs/nghiem-thu-d4-d9.md` để biết mục còn mở; chưa có tuyên bố đã triển khai production.

> **Làm theo từng bước cho tên miền `tandcstore.com` + server `10.201.42.65`:** [docs/huong-dan-trien-khai-tandcstore.md](docs/huong-dan-trien-khai-tandcstore.md). Server đó đang chạy web VCM với Nginx trên 80/443 → **không cài Coolify** (Traefik sẽ chiếm 80/443); chạy `docker-compose.prod.yml` (project `tandc`) sau Nginx dùng chung. File này là tài liệu tham khảo chi tiết.

| | Testing | Production (sau) |
|---|---|---|
| App | Vercel (functions `sin1` Singapore) | Server `10.201.42.65` (dùng chung với web VCM): **Docker Compose + Nginx/Certbot sẵn có** — xem runbook. Coolify (§2) chỉ dùng khi có server riêng biệt |
| DB | Neon Singapore (2 DB: preview, main) | PostgreSQL 17 trong Docker |
| File | Vercel Blob (`STORAGE_DRIVER=vercel-blob`) | Ổ đĩa/volume (`STORAGE_DRIVER=local`) |
| Cron | Vercel Cron (`vercel.json`) | crontab trên host (`ops/cron.example`) |
| Deploy từ | `main` → Production, nhánh khác → Preview | tag `release-YYYYMMDD-HHMM` trên `main` (CI đầy đủ xanh), người dùng chạy tay `ops/deploy.sh` → tự smoke `ops/smoke.sh`; rollback = deploy tag trước (runbook F.13) |

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
   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | OAuth client (xem §1.4) | để trống (URL preview không khớp redirect) |
   | `EMAIL_DRIVER` | `none` tới khi có tên miền, sau đó `resend` | `none` |
   | `RESEND_API_KEY`, `EMAIL_FROM` | khi `EMAIL_DRIVER=resend` | — |

5. **Cron:** `vercel.json` khai báo 3 job, đều chạy 1 lần/ngày, vì gói Hobby chỉ cho cron hằng ngày **[CẦN XÁC MINH theo gói hiện tại]**.
   - Vercel tự gửi `Authorization: Bearer $CRON_SECRET`.
   - Gói Pro có thể đổi lịch sang mỗi 15 phút.
6. **Seed dữ liệu mẫu** (chỉ cho Preview, chạy từ máy local). Không chạy seed trên Production thật. Tạo admin thật bằng cách seed **một lần** với `SEED_STAFF_PASSWORD` mạnh, rồi đổi mật khẩu.
   ```bash
   DATABASE_URL="<neon preview direct>" SEED_STAFF_PASSWORD="<mật khẩu mạnh>" npm run db:seed
   ```
   - `npm run db:seed:demo` (SP demo lấy từ lengocanh.vn) **không** dùng cho Production. Trên Preview chỉ chạy với `--no-images`: ảnh mẫu thuộc bản quyền shop/thương hiệu, không đưa lên Vercel Blob public.
   - Muốn Preview có ảnh: dùng **ảnh minh hoạ tự vẽ** (nền màu thương hiệu + tên SP + nhãn DEMO, không dính bản quyền). Script tạo ảnh cho SP chưa có ảnh, 2 banner (nếu chưa có banner) và icon danh mục gốc. Chạy lại an toàn.
   - **Windows (PowerShell) — một lệnh:** `npm run seed:preview`. Script hỏi ẩn chuỗi Neon preview (direct) + token Blob, chặn chuỗi localhost/pooled, chạy SP demo `--no-images` → chạy thử ảnh → hỏi gõ `YES` → tạo ảnh lên Blob; xong trả lại biến môi trường như cũ.
   - Linux/macOS (bash) — từng bước; với Blob phải thêm `--yes` sau khi kiểm tra DB đích in ra màn hình:
     ```bash
     DATABASE_URL="<neon preview direct>" npm run db:seed:demo -- --no-images
     DATABASE_URL="<neon preview direct>" STORAGE_DRIVER=vercel-blob BLOB_READ_WRITE_TOKEN="<token Blob của Preview>" npm run db:seed:placeholders -- --dry-run
     DATABASE_URL="<neon preview direct>" STORAGE_DRIVER=vercel-blob BLOB_READ_WRITE_TOKEN="<token Blob của Preview>" npm run db:seed:placeholders -- --yes
     ```
     Trang chủ/catalog được cache theo tag, nên ảnh có thể chậm vài phút mới hiện (hoặc redeploy). Khi bán thật: xoá ảnh DEMO trong admin, thay bằng ảnh shop tự chụp hoặc ảnh có giấy phép.
7. **Kiểm tra sau deploy:**
   - `GET /api/health` trả `{"ok":true}`;
   - `/` hiển thị tiếng Myanmar;
   - đăng nhập `/admin` được;
   - `/login` có nút Google (nếu đã đặt biến), đăng nhập → `/account`.

### 1.4 Đăng nhập khách: Google OAuth + email (P14)
Khách bắt buộc có tài khoản khi đặt hàng. Đăng ký/đăng nhập bằng **SĐT + mật khẩu luôn bật** (P17); Google và email là tuỳ chọn, bật khi đặt biến bên dưới.

**Google OAuth client** (Google Cloud Console, tài khoản Google của shop):
1. Tạo project (vd `glow-vn`) → **APIs & Services → OAuth consent screen**:
   - User type **External**; tên app "T&C Cosmetics", email hỗ trợ, logo (tuỳ chọn), link chính sách bảo mật `https://<domain>/info/privacy`.
   - Scopes: `openid`, `email`, `profile` (mặc định, không cần duyệt thêm).
   - **Publish app** (chuyển khỏi chế độ Testing, nếu không chỉ tài khoản test mới đăng nhập được).
2. **Credentials → Create credentials → OAuth client ID → Web application**:
   - Authorized JavaScript origins: `https://glow-mm.vercel.app`, `http://localhost:3000`.
   - Authorized redirect URIs (khớp tuyệt đối, kể cả `https`):
     - `https://glow-mm.vercel.app/api/customer-auth/callback/google`
     - `http://localhost:3000/api/customer-auth/callback/google`
     - sau này thêm `https://<domain Myanmar>/api/customer-auth/callback/google`.
3. Chép Client ID + Client secret → Vercel (Production) `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` → Redeploy. Local: thêm vào `.env`. Không commit.
4. Kiểm tra: `/login` có nút "Google ဖြင့် ဆက်လုပ်မည်" → đăng nhập → về `/account`. Tài khoản Google trùng email nhân viên/CTV bị từ chối (đúng thiết kế).

**Email (Resend)** — cần tên miền riêng, `*.vercel.app` không gửi được **[CẦN XÁC MINH: tên miền]**:
1. resend.com → Domains → thêm tên miền → thêm bản ghi DNS (SPF, DKIM, tuỳ chọn DMARC) → chờ Verified.
2. API Keys → tạo key quyền "Sending access".
3. Đặt `EMAIL_DRIVER=resend`, `RESEND_API_KEY`, `EMAIL_FROM="T&C Cosmetics <no-reply@<tên miền>>"` → Redeploy. Trang đăng nhập hiện thêm form email, đăng ký, quên mật khẩu.
4. Local/dev dùng `EMAIL_DRIVER=outbox`: email ghi ra `./storage/outbox/*.json` (mở file để lấy link xác minh).

---

## 2. Chuyển sang server riêng (Coolify + Docker)

> Mục này mô tả cách dùng **Coolify trên một server riêng biệt**. Server hiện có (`10.201.42.65`, dùng chung với web VCM) dùng **Docker Compose + Nginx** theo [docs/huong-dan-trien-khai-tandcstore.md](docs/huong-dan-trien-khai-tandcstore.md) (PHẦN B–D). Các phần chuyển dữ liệu (§2.4), checklist (§2.5), backup (§3) dùng chung cho cả hai cách.

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
   - `APP_URL=https://<domain>` (dùng cả lúc build qua build arg cho canonical/Open Graph — đổi domain thì phải **build lại**, không chỉ restart);
   - `BETTER_AUTH_SECRET`, `CRON_SECRET` (giá trị **mới**, khác Vercel);
   - `FB_PAGE_USERNAME`, `VIBER_CHAT_URI`;
   - `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` (`openssl rand -base64 32`, **giữ cố định** — đổi thì tab khách đang mở lỗi gửi form sau deploy). Dùng lúc build: trong Coolify đánh dấu là biến build **[CẦN XÁC MINH tên tuỳ chọn trong Coolify]**;
   - `DATABASE_POOL_MAX` (mặc định 20 trong compose);
   - tuỳ chọn: `EMAIL_DRIVER=resend` + `RESEND_API_KEY` + `EMAIL_FROM`; `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` (§1.4).
   - `NEXT_DEPLOYMENT_ID` lấy từ `SOURCE_COMMIT` mà Coolify truyền lúc build **[CẦN XÁC MINH]**; không có thì chỉ tắt tính năng tự tải lại khi có bản mới.
4. Persistent storage:
   - volume `pgdata` (DB), `uploads` (`/app/storage`) và `next-cache` (cache ảnh `/_next/image`) đã khai báo sẵn. Dùng **named volume** như compose; nếu Coolify đổi sang thư mục host thì phải `chown 1001:1001` thư mục đó, nếu không app không ghi được file;
   - ghi lại **tên volume thật** mà Coolify tạo (`docker volume ls`) để dùng cho backup.
5. Deploy. Kiểm tra `docker ps`: `app` ở trạng thái healthy, `migrate` exited (0).

### 2.3 Domain + HTTPS
1. DNS: bản ghi `A` của `<domain>` (và `www` nếu cần) trỏ về IP server.
2. Coolify → service `app` → Domains: `https://<domain>`. Coolify (Traefik) tự xin chứng chỉ Let's Encrypt; cần cổng 80/443 mở.
3. Cập nhật `APP_URL=https://<domain>` → Redeploy (build lại image để metadata SEO dùng domain mới). Kiểm tra `https://<domain>/robots.txt` và `/sitemap.xml` trỏ đúng domain.
4. Compose chỉ mở `127.0.0.1:3000` (cho crontab trên host gọi `/api/cron`); khách vào qua Traefik của Coolify. Kiểm tra từ máy khác: `curl http://<IP server>:3000` phải **không** kết nối được. Coolify có thể tự bỏ/ghi đè `ports` **[CẦN XÁC MINH]** → khi đó cron dùng `docker exec <app> wget -qO- …` (xem ghi chú đầu `ops/cron.example`).

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
   - copy `ops/cron.example` vào crontab của root (`sudo crontab -e`) — gồm 4 job app (giữ hàng, COD, cảnh báo, `cleanup` dọn rate limit/phiên hết hạn) + backup;
   - tạo `/opt/glow/cron.env` (chmod 600, §3.1);
   - lỗi cron ghi ở `/var/log/glow-cron.log`.
   - Tài khoản nhân viên/CTV/khách và cài đặt đi theo bản dump Neon — **không chạy `db:seed` trên server** (seed tạo dữ liệu mẫu).
7. **Chuyển DNS/thông báo** domain mới. Giữ Vercel ở chế độ chỉ đọc vài ngày rồi tắt.

### 2.5 Checklist sau khi chuyển
- [ ] `https://<domain>/api/health` → `{"ok":true}`, chứng chỉ HTTPS hợp lệ.
- [ ] Storefront `/` (Myanmar) và `/en` hiển thị đúng; ảnh sản phẩm tải được.
- [ ] Đăng nhập admin bằng cả 3 vai trò; đổi mật khẩu mặc định (bấm tên mình ở góc trên → `/admin/account`).
- [ ] Cài đặt → bật lại "Nhận đơn trên web".
- [ ] Google OAuth: thêm redirect URI của domain mới (§1.4); `EMAIL_DRIVER=resend` + DNS Resend cho domain; thử đăng ký email + quên mật khẩu + đăng nhập Google.
- [ ] Tồn kho trùng khớp: tổng `StockBalance` theo biến thể = số liệu trước khi chuyển.
- [ ] Đặt thử 1 đơn COD và 1 đơn chuyển khoản (upload biên lai → duyệt) rồi huỷ.
- [ ] Gọi tay từng cron (kể cả `cleanup`) với `CRON_SECRET` qua `http://127.0.0.1:3000` → 200; không có secret → 401.
- [ ] `curl -sI https://<domain>/` có `Strict-Transport-Security`, `Permissions-Policy`, `Content-Security-Policy` (có `upgrade-insecure-requests`); `curl -sI https://<domain>/admin/login` có CSP chứa `'nonce-…'`; bấm "Đăng nhập Google" trên `/login` phải tới được trang Google (CSP `form-action` không chặn); `curl -sI https://<domain>/icons/icon-192.png` có `Cache-Control: public, max-age=86400…`.
- [ ] Đăng nhập sai mật khẩu nhiều lần từ 2 mạng khác nhau: chỉ mạng bị dò mới bị chặn (rate limit theo IP thật qua `x-real-ip`).
- [ ] Backup đầu tiên chạy thành công, file có trên off-site (§3).
- [ ] **Khôi phục thử** backup đó vào một DB tạm (§3.3) → OK.
- [ ] Firewall chỉ mở 22/80/443 (`sudo ufw status`), không lộ cổng DB/3000/8000.

---

### 2.6 Diễn tập local trước khi chuyển (đã làm 2026-10-16: P4a, P7)
Chạy lại khi đổi `Dockerfile`, `docker-compose.prod.yml`, `ops/*.sh` hoặc script chuyển file. Kết quả lần đầu: **tất cả đạt**.

| Bước | Cách làm | Kết quả |
|---|---|---|
| Dựng stack | `docker compose -p glow-prod -f docker-compose.prod.yml --env-file <file secret riêng> up -d --build` | app healthy, `migrate` exit 0, `/api/health` OK |
| Chuyển DB | `pg_dump` DB dev (thay cho Neon) → `pg_restore --clean --if-exists` vào DB đã migrate | số dòng `Order`/`StockLedger`/`StockBalance`/`Batch`/`Product`/`user` và tồn theo từng SKU khớp |
| Chuyển file | 3 dòng `FileObject` VERCEL_BLOB (2 ảnh, 1 biên lai PRIVATE) trỏ tới server HTTP giả trong mạng compose → chạy lệnh §2.4 bước 5 | dry-run → 3/3 → chạy lại 0; tắt server giả vẫn xem được ảnh (`/_next/image` ra AVIF); biên lai: chưa đăng nhập 404, admin 200; app (`nextjs`) ghi được vào thư mục script tạo |
| Checklist §2.5 | storefront `my`/`en`, đăng nhập 3 vai trò, tắt/bật nhận đơn, đặt đơn COD rồi huỷ, đổi mật khẩu, cron có/không secret | đạt (cron 200/401) |
| Backup → khôi phục | chạy `ops/backup.sh` + `ops/restore.sh` trong container Alpine (bash, docker-cli, age, rclone; mount `/var/run/docker.sock`), `RCLONE_REMOTE` = thư mục local | DB khôi phục khớp số dòng; volume upload khôi phục khớp md5 |
| Diễn tập P7 (2026-10-16) | nhánh P5c→P7: `docker compose -p glow-p7 ... --env-file <file tạm> up -d --build` (build arg `APP_URL`); `pg_restore` dữ liệu test; admin tải ảnh SP + banner (desktop/mobile) + icon danh mục | `migrate` exit 0 (có migration P6); `/_next/image` trả `image/avif` 200 cho banner/ảnh SP/icon (**sharp chạy được trên alpine**), server không treo; canonical/og:image/robots/sitemap dùng `APP_URL`; `/en/foo`, `/en/collection/khong-co` → 404 có header; trang chủ có carousel |
| Diễn tập P19 (2026-10-29) | `docker compose -p glow-p19 ... --env-file <file tạm> up -d --build` (có `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, `SOURCE_COMMIT`) | build context ~2 MB (đã bỏ `.claude`); phát hiện + sửa `/forgot-password` đọc env lúc build (lỗi từ P14 làm hỏng `docker build`); `migrate` exit 0, app healthy; cổng chỉ `127.0.0.1:3000` (IP LAN không vào được); `Permissions-Policy`, cache icon OK; cron `cleanup` 200/401; `/api/files/.%2Fproofs…` 404; `/_next/image` AVIF, `w=3840` bị từ chối, cache ảnh còn sau restart; `data-dpl-id` đúng mã build |

**Lưu ý rút ra:**
- `docker compose` lấy giá trị `${...}` từ file `.env` cạnh compose (là `.env` của dev!) → khi thử local dùng `--env-file` trỏ tới file secret riêng. `env_file: .env.prod` chỉ nạp vào container, không dùng để thay `${...}`.
- DB không publish cổng (đúng thiết kế) → thao tác DB bằng `docker exec <db> psql/pg_restore`.
- Trên Windows Git Bash phải đặt `MSYS_NO_PATHCONV=1`, nếu không đường dẫn trong container (`/tmp/...`) bị đổi thành đường dẫn Windows. Trên server Linux không gặp.
- `restore.sh` hỏi `YES` từ stdin → chạy tự động được bằng `echo YES | ...`; chỉ làm vậy với DB tạm.

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
sudo rclone config                     # tạo remote dưới root (cron chạy bằng root), vd tên "b2" → RCLONE_REMOTE=b2:glow-backups
sudo mkdir -p /opt/glow && sudo cp ops/backup.sh ops/restore.sh /opt/glow/ && sudo chmod 700 /opt/glow/*.sh
```

`/opt/glow/cron.env` (chmod 600):
```
CRON_SECRET=...
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
   sudo DB_CONTAINER=glow-restore-test AGE_KEY_FILE=./glow-backup.key /opt/glow/restore.sh db-<stamp>.dump.age
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

---

## 5. Dọn sau khi tắt hẳn Vercel (P19 ghi lại, chưa làm)
Chỉ làm khi đã chuyển xong dữ liệu (§2.4) và không còn dùng Vercel Preview:
- Storage: `src/server/adapters/storage/vercel-blob.ts`, nhánh `vercel-blob` trong `storage/index.ts` + `env.ts`, gói `@vercel/blob`, `images.remotePatterns` trong `next.config.ts`.
- Script chuyển file: `scripts/migrate-blob-to-local.mjs`, dòng `COPY` trong `Dockerfile` (stage `migrator`), test `tests/integration/files.test.ts` (giữ phần test `LocalDiskStorage`).
- Neon: `@neondatabase/serverless`, `@prisma/adapter-neon`, nhánh `SEED_VIA_WEBSOCKET` trong `prisma/seed.ts`.
- Preview: `scripts/seed-preview.ps1` + `npm run seed:preview`, `scripts/seed-placeholders.ts` + `scripts/lib/placeholder-art.ts` + test, `npm run db:seed:placeholders`.
- Vercel: `vercel.json`, script `vercel-build`, mục §1 của file này; pattern `sharp-win32` trong `outputFileTracingIncludes` (chỉ cần khi build trên Windows).
