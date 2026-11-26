# PLAN — Web bán mỹ phẩm VN → Myanmar

## Trạng thái hiện tại — đọc đầu tiên khi mở phiên mới (cập nhật 26/11/2026, máy Việt Nam)

- **Code:** production = `main` (PR #56 deploy 25/11/2026). `dev` = `main` + tài liệu + 26/11: `db:test:fresh` nối thẳng pg (không cần Docker), đồng bộ `package-lock` (@emnapi 1.11.3), luật agent trong AGENTS.md, CLAUDE.md rút gọn đoạn deploy (chi tiết ở docs/lenh-trien-khai-tandcstore.md); **Design System** (`docs/design-system.md` + P1/P2: primitive chung ở `components/ui`, error/404 storefront + CTV, CTV 44px dưới md, test `ui-rules`) — `check` + full E2E local xanh (154), **đã merge `main` + deploy 26/11 (PR #57)**. **Không có việc code dở.** Lock mới chưa qua CI [CẦN XÁC MINH khi CI chạy].
- **Máy Việt Nam (26/11/2026):** dựng xong môi trường dev — Windows 22H2, PostgreSQL 17 cài thẳng (không Docker, xem CLAUDE.md mục Hai máy); `check`, `test:int`, `db:test:fresh` xanh.
- **Xong 25/11/2026:** P25 trợ lý AI — gói A, GĐ 5 `receive_draft` (tạo nháp một bước), B1 `data_health`, B2 đọc đơn (thông tin khách **ẩn**, phương án A), B3 `price_suggest` (chỉ tính), B4 `public:read`; dọn web C1 (skill agent), C2 (`catalog_search` theo ngôn ngữ), C4 = audit F2 (nhắc banner chưa có link), C5 = audit G1 (trang chủ bớt lặp), C6 (rà giao diện admin). Chốt: **không làm `catalog_submit`**, không cần nhắc việc hằng ngày.
- **Chờ chủ shop:** gắn link banner (Admin › Banner, nhãn "Chưa có link"); A7a model dự phòng cho OpenClaw (`agents.defaults.model.fallbacks: ["google/gemini-3.5-flash"]`, chủ shop tự chạy `openclaw config patch`); cài agent trên máy Việt Nam (repo agent, `_quan-tri/VAN-HANH.md` mục 8).
- **Design System — đã lên production 26/11 (PR #57, `release-20261126-0650`);** 6 chuỗi Myanmar mới đã được chủ shop duyệt. P3 xong trên `dev` 26/11 (tách trang SP/đơn/tồn kho thành component, gộp `Stat`, thanh mục dạng viên, một tên màu `primary`) — đã merge `main` + deploy 26/11 (PR #58, `release-20261126-1305`).
- **Telegram (26/11):** bot @TandCAdminbot nối agent `tc-cosmetics` trên gateway máy VN, chỉ chủ shop nhắn được (chi tiết `docs/ket-noi-tro-ly-ai.md` §2).
- **Chưa duyệt / để sau:** B5 Telegram chủ động, B6 agent tạo đơn nháp, C3 bỏ hay giữ 3 cờ tính năng (đợi 1–2 tháng), quy trình bàn giao hai máy (tạm dừng 25/11/2026). Nhỏ: skill agent nói đơn "chờ hàng về" là "cần chuẩn bị hàng" — chỉnh khi rảnh.
- **Hai máy (Myanmar / Việt Nam):** mỗi lúc chỉ làm trên một máy. Đầu phiên: `git status` + `git stash list` (máy đó còn việc cũ không) rồi `git pull` nhánh `dev`; cuối phiên: commit + push `dev` và cập nhật mục này. Ghi nhớ của Claude (`memory/`) **không** đồng bộ giữa máy — điều cần nhớ phải nằm trong CLAUDE.md / PLAN.md / docs. Agent OpenClaw `tc-cosmetics`: workspace ở repo private `canhhoho/tc-cosmetics-agent`; gateway + token đang chạy trên máy Myanmar; mỗi máy một token riêng.

## Cập nhật triển khai quy trình (05/11/2026)

Đã triển khai local D4.1–D4.3, D5, D6.1, D7, D8.1–D8.2 và các mục DT.3 sửa vận đơn/DT.5/DT.6, D3 hiển thị phiếu soạn/cảnh báo xuất nội bộ. Xem [bằng chứng nghiệm thu và điều kiện còn mở](docs/nghiem-thu-d4-d9.md). Chủ shop yêu cầu giữ chính sách hoa hồng hiện tại: không thêm gate COD mới. Guest COD chờ ít nhất hai tuần dữ liệu D5 thực tế; import VTP chờ file thật; tách đợt nhập/lô NSX chờ bằng chứng và quyết định. Cập nhật 18/11/2026: **đã lên production** từ 17/11/2026 (tandcstore.com, deploy tự động khi push `main`).

## Quyết định đã chốt
| # | Chủ đề | Chốt |
|---|---|---|
| 1 | Dữ liệu đầu | Import CSV/Excel (có file mẫu); tồn đầu kỳ = phiếu nhập qua ledger |
| 2 | Giá | **16/11/2026:** giá tự động tắt (`FEATURES.autoPricing=false`, giữ code). Giá bán đặt **thủ công** ở trang Giá bán: kho nhập VN = (giá mua VND lô chọn + lãi VND) ÷ tỷ giá + vận chuyển MMK + CTV MMK, làm tròn lên; kho mua MMK nhập thẳng. SP đã duyệt → giá chờ duyệt; lưu lịch sử giá. Tỷ giá nhập tay (VND/MMK); nút "Tính lại theo tỷ giá mới" (18/11) |
| 3 | Kho | N kho; **mỗi SP thuộc đúng một kho bán**, gán khi ghi sổ phiếu nhập/chuyển đầu tiên (16/11/2026). Vị trí Chờ kiểm tra vẫn dùng; Đang vận chuyển / Hải quan thuộc chuyến hàng (đang tắt) |
| 4 | Giữ hàng | Cấp biến thể; phân lô FEFO khi Đóng gói |
| 5 | Hạn dùng | **17/11/2026: tắt hoàn toàn** (`FEATURES.expiry=false`) — không chặn bán theo hạn, form không có ô hạn. Khi bật lại: ngừng bán <90 ngày, cảnh báo 180 ngày, hạn theo lô |
| 6 | Giá vốn | **16/11/2026: bỏ landed cost / phân bổ chuyến** (`FEATURES.shipments=false`). Giá vốn lô = giá mua × tỷ giá lúc ghi sổ; ghi sổ phiếu nhập VND khi chưa có tỷ giá → chặn |
| 7 | Hàng trả | Vào "Chờ kiểm tra" → nhập lại hoặc huỷ |
| 8 | Combo/Tester | Combo cố định trừ kho thành phần; tester/quà = loại tồn riêng trên cùng lô |
| 9 | COD | Gọi xác nhận; tự huỷ/nhả sau 24h (cấu hình) |
| 10 | Ship | Bảng phí theo vùng/township + mã vận đơn tay; adapter cho API hãng sau |
| 11 | Khách | Xem hàng không cần đăng nhập; **đặt hàng trên web bắt buộc tài khoản khách** (SĐT hoặc email + mật khẩu; **đăng nhập Google đã gỡ 14/11/2026**, làm lại sau); đơn ngoài web vẫn tra bằng mã đơn + SĐT, không OTP |
| 12 | Admin i18n | vi + en + my |
| 13 | Chat | FB Page + Viber; link cấu hình qua env/admin |
| 14 | Myanmar text | Bộ phát hiện Zawgyi của Google (vendored) + Rabbit + Noto Sans Myanmar tự host |
| 15 | Auth/File/CI | Better Auth + RBAC tự viết; file qua adapter (production: ổ đĩa `STORAGE_DRIVER=local`; Vercel Blob cho môi trường Vercel); GitHub Actions + deploy tự động; PWA cơ bản |
| 16 | Hoa hồng CTV | **18/11/2026:** hoa hồng bán hàng = mức MMK/sản phẩm nhập ở Giá bán × SL giữ (SP để trống = không hoa hồng); tầng trên 2% tiền hàng; giữ 7 ngày rồi mới trả |

**Kết quả xác minh:**
- `better-auth` bản mới nhất 1.7.8 → đang được phát triển, OK.
- `myanmar-tools` (npm 1.2.0, phát hành 2020) và `rabbit-node` (1.0.4, phát hành 2018, MIT) **không còn ra bản mới**. Zawgyi là chuẩn đã đóng băng nên thuật toán không cần cập nhật. Cách dùng: ghim phiên bản, bọc sau `src/lib/myanmar/`, có test riêng.
- **Cập nhật P0:** gói npm `myanmar-tools@1.2.0` bị lỗi (thiếu `build_node`) → đã đưa mã nguồn bộ phát hiện + model vào `src/lib/myanmar/vendor/` (Apache-2.0, giữ nguyên logic). `rabbit-node` dùng bình thường.

## 1. Kiến trúc
- **Next.js App Router** (TS, `output: "standalone"`), Server Components làm mặc định; mutation qua Server Actions; JS phía client tối thiểu.
- **Phân lớp:** `app/` (UI, route) → `server/<domain>/` (service + validation Zod + kiểm tra quyền) → Prisma. Logic nghiệp vụ không import gì từ Next/Vercel → test bằng Vitest được.
- **Adapters** (chọn bằng env var):
  - `storage`: `vercel-blob` | `local`
  - `payment`: `cod`, `bank-transfer` (gateway sau)
  - `shipping`: `manual` (API hãng vận chuyển sau)
- **RBAC:** `requireRole()` / `can(user, action)` gọi ở mọi Server Action và route handler. Proxy/middleware chỉ chuyển hướng, không phải lớp bảo mật.
- **Ledger tồn kho:**
  - Mọi thay đổi tồn = `StockDocument` POSTED → các dòng `StockLedger`.
  - `StockBalance` là bảng tổng hợp, cập nhật trong **cùng transaction** (khoá dòng bằng `SELECT … FOR UPDATE`, SQL Postgres chuẩn).
  - Không có API sửa số lượng trực tiếp.
- **Tiền:** MMK và VND lưu số nguyên; tỷ giá lưu `Decimal`. Thời gian lưu UTC, hiển thị Asia/Yangon hoặc Asia/Ho_Chi_Minh.
- **Cron:** `POST /api/cron/{release-reservations,cancel-unconfirmed-cod,compute-alerts}`, bảo vệ bằng header `CRON_SECRET`.
- **i18n:** next-intl. Storefront `my` (mặc định) + `en`; admin `vi` + `en` + `my`. Mọi chuỗi giao diện nằm ở `messages/`. Nội dung sản phẩm lưu trong bảng `*Translation`.
- **Hiệu năng:**
  - SSR/ISR cho catalog.
  - `next/image` + sharp → AVIF/WebP, lazy-load.
  - Font Myanmar self-host, chỉ lấy phần ký tự cần.
  - Mục tiêu JS client < 70KB gzip ở trang sản phẩm. Đo ở P2: ~159KB (gần hết là nền Next 16/React 19 + next-intl) → không đạt; xem lại nếu Slow 3G cần cải thiện.

## 2. Data model (bảng chính → quan hệ)
**Auth & hệ thống**
- `User` (nhân viên, `role`: ADMIN | WAREHOUSE_MANAGER | ORDER_STAFF)
- `Session`, `Account`, `Verification` (Better Auth)
- `AuditLog`
- `Setting` (key/value: ngưỡng hạn dùng, thời gian giữ hàng…)
- `FileObject` (key, driver, mime)

**Catalog**
- `Brand`, `Category` (cây)
- `Product`:
  - bản dịch: `ProductTranslation` (locale, name, description, usage, ingredientsText)
  - ghi chú bảo quản
  - liên kết N-N với `SkinType`, `Concern`, `Ingredient`
  - `ProductImage` → `FileObject`
- `Variant`:
  - sku, shade/size, `priceMmk`, weight, `isBundle`
  - tham số đặt lại hàng: leadTimeDays (thời gian vận chuyển VN→MM), safetyStock
- `BundleItem` (bundleVariant → componentVariant, qty)

**Giá**
- `ExchangeRate` (mmkPerVnd, effectiveAt, user)
- `PriceUpdateRun` (công thức, %lãi, trạng thái preview/applied)
- `PriceHistory` (variant, old/new, rate, run, user, at)

**Kho**
- `Warehouse`
- `Location` (type: VN_STOCK | IN_TRANSIT | CUSTOMS | MM_STOCK | QUARANTINE)
- `Batch` (variant, lotNo, mfgDate, expiryDate, unitCostVnd, landedCostVnd, rateAtReceipt, landedCostMmk)
- `InboundShipment` (chuyến VN→MM) + `ShipmentCost` (shipping/tax/fee, VND), allocationMethod
- `StockDocument` (type: RECEIVE | TRANSFER | ISSUE | ADJUST | RETURN; DRAFT/POSTED; from/to location; ref order/shipment; user) + `StockDocumentLine`
- `StockLedger` (document, batch, location, stockType SELLABLE | TESTER, qtyDelta, user, createdAt) — chỉ ghi thêm, không sửa/xoá
- `StockBalance` (batch, location, stockType → qty)
- `Reservation` (variant, order, qty, expiresAt, status ACTIVE | RELEASED | CONSUMED)

**Bán hàng**
- `Customer` (phone unique, name) + `Address` (region, township, text)
- `MmState` / `MmDistrict` / `MmTownship` (danh mục địa chỉ VTP, P15 — thay `ShippingZone` / `ShippingRate`)
- `Order`:
  - code, status, paymentMethod COD | BANK_TRANSFER, paymentStatus, subtotal, shippingFee, total, locale, codConfirmedAt
- `OrderItem` (variant, qty, unitPriceMmk)
- `OrderAllocation` (orderItem, batch, qty, unitLandedCostMmk) — tạo khi đóng gói, dùng để tính lợi nhuận
- `OrderStatusHistory`
- `PaymentProof` (file, status, reviewedBy, reviewedAt)
- `Delivery` (carrier, trackingNo)
- `Review` (product, order, rating, body, status PENDING/APPROVED)

**Trạng thái đơn:**
`PENDING → (PAYMENT_CONFIRMED | COD_CONFIRMED) → PACKING → SHIPPING → COMPLETED`, nhánh `CANCELLED` / `RETURNED`.
Bảng chuyển trạng thái hợp lệ + quyền theo vai trò nằm trong `server/orders/state-machine.ts`.

## 3. Cấu trúc thư mục
```
prisma/            schema.prisma, migrations/, seed.ts (+ dữ liệu mẫu tiếng Myanmar)
messages/          store.{my,en}.json, admin.{vi,en,my}.json
src/app/(store)/[locale]/...        storefront
src/app/admin/...                   admin (locale theo cookie, không nằm trong URL)
src/app/api/cron/*, api/files/*     route handlers
src/server/{auth,catalog,inventory,pricing,orders,customers,reports}/
src/server/adapters/{storage,payment,shipping}/
src/lib/{myanmar,money,i18n,env}.ts  (env validate bằng Zod)
src/components/{ui (shadcn),store,admin}/
tests/unit/ (Vitest)   tests/e2e/ (Playwright)
Dockerfile  docker-compose.yml  docker-compose.prod.yml  .env.example
.github/workflows/ci.yml   PLAN.md  CLAUDE.md  DEPLOY.md
```

## 4. Roadmap (dừng chờ duyệt sau mỗi phase)

Trạng thái: P0–P3 ✅ (2026-10-15/16) · P4a ✅ · P5 ✅ · P6 ✅ · P7 ✅ (2026-10-16) · P8 ✅ · P9 ✅ (2026-10-19) · P10 CTV ✅ (2026-10-26, đã lên production) · P11 CTV 2 tầng ✅ · P12 sửa UI ✅ · P13 chỉnh % hoa hồng ✅ (2026-10-27) · P14 tài khoản khách (code xong 2026-10-27) · P15 địa chỉ VTP (code xong 2026-10-28) · P16–P17 ✅ (production 2026-10-28) · P18 đổi thương hiệu T&C Cosmetics (2026-10-29) · P19 dọn dẹp + chuẩn bị server Linux (2026-10-29) · P20 cache nội dung SP storefront (2026-10-30) · P21 gộp Zod + CSP (2026-10-30) · P22 storefront tiếng Việt (2026-11-02) · P23 tỷ giá nhập qua USD (2026-11-02) · P4b chờ server + domain Myanmar.

| Phase | Nội dung | Hoàn thành khi |
|---|---|---|
| **P0 Nền tảng** ✅ | Init project, git `dev`/`main`, Prisma schema đầy đủ + seed, layout rỗng store/admin + i18n, Better Auth + RBAC, adapter storage, Docker, `.env.example`, CI, DEPLOY.md | `npm test` (lint + typecheck + vitest + e2e smoke) xanh; `docker compose up` chạy; Vercel preview + Neon hoạt động; đăng nhập theo 3 vai trò |
| **P1 Kho lõi** ✅ | CRUD catalog, import CSV, chuyến hàng + landed cost, phiếu nhận/chuyển/xuất/điều chỉnh, ledger, FEFO, tester, combo, xem tồn theo vị trí/lô | Vitest: FEFO, landed cost/FX, combo; E2E: nhận → chuyển → xuất; không có đường sửa số lượng trực tiếp |
| **P2 Bán hàng** ✅ | Storefront (danh mục, bộ lọc, trang SP có hạn dùng lô hiện tại), giỏ hàng, checkout 1 trang, **tạo đơn thủ công trong admin** (đơn từ FB/Viber), COD + chuyển khoản/upload biên lai, giữ hàng + cron, máy trạng thái đơn, duyệt thanh toán, in nhãn ship, Zawgyi trong ô tìm kiếm/form | Vitest: reservation, chuyển trạng thái; E2E: duyệt web → đơn COD, chuyển khoản → upload → duyệt; Lighthouse mobile chuẩn (Slow 4G mô phỏng) Performance ≥ 85; Slow 3G (RTT 400ms, 400 Kbps) theo dõi, ≥ 70 — `npm run perf` |
| **P3 Vận hành** ✅ | Cập nhật giá hàng loạt + lịch sử, cảnh báo (tồn thấp/cận date/gợi ý đặt hàng), dashboard (doanh thu, lợi nhuận, bán chạy, bán chậm, hàng đang vận chuyển), trả hàng, đánh giá, nút Viber/Messenger, PWA | Toàn bộ test xanh; số liệu dashboard khớp ledger trên dữ liệu seed |
| **P4a Chuẩn bị chuyển** ✅ | Đổi mật khẩu nhân viên (`/admin/account`), cờ tạm tắt nhận đơn web, script chuyển file Blob → ổ đĩa, diễn tập local bằng `docker-compose.prod.yml` (restore dump, chuyển file, backup → khôi phục) | Toàn bộ test xanh; diễn tập local đạt các mục của checklist DEPLOY §2.5 không cần server/domain |
| **P4b Lên server Myanmar** | Khi có server + domain. Theo DEPLOY.md: hardening, Coolify, domain, HTTPS, chuyển DB/file, backup | Checklist sau khi chuyển đạt; khôi phục thử từ backup thành công |
| **P5 Ảnh + dữ liệu demo** ✅ (2026-10-16) | Quản lý ảnh SP, danh mục con, header menu 2 cấp + footer + trang thông tin, `db:seed:demo` ~45 SP từ lengocanh.vn, storefront responsive tablet/desktop | Toàn bộ test xanh |
| **P6 Nội dung trang chủ** ✅ (2026-10-16) | Quản trị banner carousel, icon danh mục, bộ sưu tập sản phẩm; hiển thị trên trang chủ theo bố cục responsive đã duyệt | Toàn bộ test xanh (có E2E admin → storefront, mobile + desktop); `npm run perf`: mobile ≥ 85, desktop ≥ 90, slow-3g ≥ 70 cho trang không có banner ảnh (trang chủ có banner ảnh: chấp nhận 69, xem ghi chú P6) |
| **P7 Hoàn thiện trước khi mở bán** ✅ (2026-10-16) | SEO (metadataBase, canonical/hreflang, Open Graph, JSON-LD sản phẩm, robots.txt, sitemap.xml, noindex trang riêng tư), 404 có giao diện cho mọi đường dẫn lạ, sửa nút ngôn ngữ Myanmar, quy trình xuất/nhập bản dịch cho người bản ngữ duyệt | Toàn bộ test xanh (E2E 404, meta/JSON-LD, robots/sitemap); `npm run perf` giữ ngưỡng |
| **P8 Quản lý nhân viên** ✅ (2026-10-16) | `/admin/users` (ADMIN): tạo nhân viên + mật khẩu tạm, đổi tên/vai trò, khoá/mở khoá, đặt lại mật khẩu; khoá/đặt lại → xoá mọi phiên; tài khoản bị khoá không đăng nhập được (hook Better Auth); luôn còn ≥ 1 ADMIN; không tự khoá/tự đổi vai trò; ghi AuditLog. Không cần migration | Toàn bộ test xanh (integration + E2E tạo → đăng nhập đúng quyền → khoá → bị đăng xuất) |
| **P9 Giao diện admin + Tồn kho** ✅ (2026-10-19) | Khung admin mới (menu nhóm + icon + badge + trang đang mở, ngăn kéo trên mobile, breadcrumb) và trang Tồn kho mới (ô số tổng, tab vị trí, xem theo sản phẩm/theo lô, lọc hạn dùng/loại tồn, phân trang, trang lịch sử lô) theo mẫu `docs/mockups/p9-admin-kho.html` | Toàn bộ test xanh (unit tổng hợp tồn, integration số liệu khớp ledger, E2E mobile: menu ngăn kéo, lọc/phân trang, mở lô, lịch sử lô) |
| **P10 Cộng tác viên (CTV) + hoa hồng** (2026-10-26) | Link giới thiệu `?ref=CODE`, CTV tự lên đơn, nhân viên gán CTV; hoa hồng % theo CTV chốt trên đơn; admin quản lý CTV + ghi nhận chi trả; cổng `/ctv` cho CTV xem đơn/hoa hồng/thanh toán | Toàn bộ test xanh (unit hoa hồng, integration gắn đơn/chi trả song song/cô lập CTV, E2E link → đơn → cổng CTV, admin chi trả, tách cổng) |
| **P15 Địa chỉ VTP Myanmar** (2026-10-28) | Địa chỉ người nhận theo danh mục VTP 3 cấp (15 vùng / 74 huyện / 329 thị trấn, có mã VTP) ở checkout, sổ địa chỉ, đơn admin/CTV; SĐT phụ; bỏ phí ship (VTP thu khi giao); admin sửa tên Myanmar + bật/tắt địa bàn | Toàn bộ test xanh (unit parser danh mục, integration snapshot mã VTP/địa bàn bị tắt, E2E chọn 3 cấp → đơn hiện đủ địa chỉ + SĐT phụ) |
| **P14 Tài khoản khách** (2026-10-27) | Khách đăng ký/đăng nhập bằng Google hoặc email/mật khẩu (xác minh email, quên mật khẩu qua Resend); xem hàng không cần đăng nhập, **checkout bắt buộc đăng nhập**; khu `/account`: đơn của tôi, sổ địa chỉ (tự điền khi thanh toán), hồ sơ + đổi mật khẩu; đơn cũ đã chứng minh mã + SĐT tự gắn vào tài khoản; admin thấy tài khoản khách trên đơn | Toàn bộ test xanh (unit policy tách cổng, integration đăng ký/xác minh/tách cổng/sổ địa chỉ/nhận đơn, E2E đăng ký → xác minh → đặt hàng, quên mật khẩu, sổ địa chỉ, tách cổng) |
| **P11 CTV hai tầng** (2026-10-26) | CTV tuyển CTV qua link mời `/ctv/join?inv=CODE` → admin duyệt; cấp trên trực tiếp hưởng thêm % tầng trên (shop trả, mặc định 2%) trên đơn của người mình tuyển; trang Tuyến dưới trong cổng CTV (chỉ số tổng, không thông tin khách); admin đổi cấp trên | Toàn bộ test xanh (unit hai tầng + chống vòng, integration chốt cấp trên/chi trả theo loại/đăng ký-duyệt/chống spam, E2E đăng ký → duyệt → đăng nhập, tuyến dưới) |
| **P25 Kết nối trợ lý AI (OpenClaw)** — duyệt 2026-11-23 · **GĐ 3 trên production 2026-11-24** · **gói A** (token theo agent, nhật ký thao tác, quyền scope ∩ vai trò, nguồn phiếu) production 2026-11-25 · GĐ 5: `receive_draft` production 2026-11-25 (`catalog_submit` không làm) · gói B1 `data_health` production 2026-11-25 · gói B2 đọc đơn (ẩn thông tin khách), B3 gợi ý giá, B4 `public:read`, C2 production 2026-11-25 | Cổng MCP `POST /api/agent/mcp` cho agent quản trị: token + scope theo biến môi trường, rate limit, audit `agent.call`; GĐ 3 công cụ chỉ đọc (sản phẩm, tồn, giá, gợi ý đặt hàng, `import_preview`); GĐ 5 phiếu NHẬP nháp + gửi duyệt. Agent không ghi sổ kho, duyệt, đăng bán, đặt giá. Chi tiết: [docs/ket-noi-tro-ly-ai.md](docs/ket-noi-tro-ly-ai.md) | GĐ 3: unit + integration xanh, agent tra cứu đúng dữ liệu web. GĐ 5: full E2E xanh, phiếu nháp không đổi sổ kho |

**P9 — kế hoạch (mẫu đã duyệt 2026-10-17):**
- *Không đổi dữ liệu, không migration.* Chỉ đọc `StockBalance`/`Batch`/`Reservation`; mọi thay đổi tồn vẫn qua phiếu kho.
- **P9a Khung admin** (`src/app/admin/(panel)/layout.tsx` + client nhỏ `components/admin/admin-shell.tsx`):
  - Nhóm menu: (Tổng quan) · Bán hàng (Đơn hàng, Đánh giá) · Kho (Tồn kho, Phiếu kho, Chờ kiểm tra, Chuyến hàng, Cảnh báo) · Catalog (Sản phẩm, Danh mục, Giá & tỷ giá) · Nội dung (Banner, Bộ sưu tập) · Hệ thống (Báo cáo, Nhân viên, Cài đặt). Lọc theo quyền như cũ; nhóm rỗng ẩn.
  - Icon `lucide-react`; trang đang mở đánh dấu theo `usePathname` (khớp tiền tố dài nhất) + `aria-current`; breadcrumb "Nhóm › Mục" lấy từ mục đang mở.
  - Badge: đơn PENDING, lô chờ kiểm tra còn hàng, lô hết hạn/ngừng bán còn hàng — 3 truy vấn đếm nhẹ (`navCounts`), chỉ chạy cho nhóm có quyền.
  - Mobile (< md): menu ngăn kéo trái (nút ☰, đóng khi đổi trang / bấm nền / Esc). Header luôn có ngôn ngữ, tên nhân viên (link Tài khoản), Đăng xuất → test cũ không đổi; test bấm menu dùng helper `openAdminNav`.
- **P9b Domain** (không import Next): phần thuần ở `src/server/inventory/stock-summary.ts` (`summarizeStock`, `stockByVariantCols`), loader DB ở `src/server/inventory/overview.ts`:
  - `summarizeStock(rows, now, thresholds)` thuần → ô số tổng: bán được tại kho bán (lô còn hạn ≥ blockDays), giá trị tồn (Σ SL × landedCostMmk, đếm riêng SL chưa phân bổ), đang vận chuyển + hải quan, lô cận hạn / ngừng bán + hết hạn (lô × SL), SL theo loại vị trí cho tab.
  - `stockByVariant({ tab, q, expiry, stockType, page })`: phân trang 25 biến thể ở DB (lọc bằng quan hệ), sau đó nạp tồn của trang → cột VN / Đang VC (+ hải quan) / MM / Tester / Chờ KT / Đang giữ / **Còn bán** (`availableToSell`, dùng chung storefront) / lô hết hạn sớm nhất / giá trị; kèm danh sách lô cho dòng mở rộng. Tab "Tất cả" gồm cả biến thể hết hàng và combo (còn bán = số bộ ghép được).
  - Xem theo lô: `stockLots` (lọc tab/hạn dùng/loại tồn + phân trang); đã thay `stockOverview` cũ.
  - Bộ lọc URL `parseStockFilter` (giá trị lạ → mặc định; ô tìm qua `toUnicode`); `stockSummary`; `batchDetail` (lô + tồn theo vị trí + ledger luỹ kế).
- **P9c Trang** `/admin/inventory`: ô số tổng bấm được (lọc), tab vị trí kèm SL, ô tìm + lọc hạn dùng/loại tồn, chuyển "Theo sản phẩm / Theo lô", bảng (desktop) / thẻ (mobile), dòng mở rộng xem lô (client nhỏ), phân trang giữ bộ lọc trên URL. Nút "Tạo phiếu ▾" (`<details>`, chỉ loại phiếu có quyền). Trang mới `/admin/inventory/batches/[id]`: thông tin lô + tồn theo vị trí + lịch sử ledger (`batchHistory`).
- Chuỗi giao diện vào `messages/admin.{vi,en,my}.json` (key `my` mới vào `review-my.json`). Màu theo token, không hardcode.
- Ngoài phạm vi: form phiếu kho, dashboard biểu đồ (đợt sau nếu cần).

**P10 — quyết định (2026-10-26):**
- Gắn đơn: bấm link CTV → cookie `glow_ref` 30 ngày, ai bấm sau cùng thì tính (proxy ghi cookie rồi redirect bỏ `ref`); khách không được giảm giá. CTV tự lên đơn ở cổng CTV (nguồn AFFILIATE); nhân viên gán/đổi/bỏ CTV (nguồn STAFF, quyền `orders:assign-affiliate`), khoá khi đơn đã chi trả.
- Hoa hồng = floor(tiền hàng thực thu × % chốt trên đơn) — không tính phí ship, trừ hàng trả; % lưu phần vạn. "Chờ" khi đơn chưa xong hoặc còn trong hạn giữ (`affiliate.holdDays`, mặc định 7 ngày sau hoàn tất), "đến hạn" sau đó; huỷ/trả trước khi xong = 0. Tính lại khi xem, không lưu sẵn.
- Chi trả: admin chuyển tiền ngoài hệ thống rồi "Ghi nhận đã trả" → `AffiliatePayout` + `AffiliatePayoutLine` theo đơn (chỉ ghi thêm); trả hàng sau khi đã chi → số âm, trừ vào lần chi sau. Khoá dòng CTV khi ghi để không trùng.
- CTV là user Better Auth role AFFILIATE (không thuộc ROLES nhân viên → không vào /admin); admin tạo tài khoản; đăng nhập email + mật khẩu ở `/ctv/login` (đăng nhập nhầm cổng bị từ chối). Cổng CTV mặc định tiếng Myanmar (cookie `CTV_LOCALE`), xem đủ tên/SĐT/địa chỉ khách trong đơn của mình, không thấy giá vốn/kho, không tra cứu khách theo SĐT.
- Báo cáo: thêm hoa hồng CTV (theo ngày hoàn tất) + lợi nhuận sau hoa hồng. Seed: CTV mẫu `ctv@glow.local` (mã MAUNG).

**P18 — đổi thương hiệu (2026-10-29):** "Glow VN" → **T&C Cosmetics**. Chỉ đổi phần hiển thị (header/footer, metadata, manifest, email, admin, cổng CTV, nhãn in, icon + ảnh OG logo tạm chữ "T&C"); mọi ngôn ngữ (cả Myanmar) viết Latin. Giữ định danh kỹ thuật `glow` (cookie, DB, repo, email nội bộ) và URL `glow-mm.vercel.app` tới khi có tên miền riêng. Ngoài code: đổi tên app trên màn hình xin quyền Google OAuth; rà dữ liệu đã nhập trên production; kiểm tra nhãn hiệu tại Myanmar **[CẦN XÁC MINH]**.

**P19 — dọn dẹp + chuẩn bị server Linux (2026-10-29):** chỉ phần cần thiết + dọn nhẹ, giữ code Vercel tới khi chuyển xong (danh sách xoá sau ở DEPLOY.md §5). Bảo mật: key `/api/files` phải chuẩn (chặn `./proofs/…`), IP thật qua `x-real-ip`, rate limit nguyên tử. DB: pool rõ ràng, trang chủ bỏ transaction chỉ đọc, migration `p19_indexes` (chỉ CREATE INDEX). Cron `cleanup` + lỗi cron trả 500. Docker: compose đủ biến email/Google/pool, cổng 3000 chỉ localhost, volume cache ảnh, khoá Server Action cố định, `.dockerignore` bỏ `.claude`. next.config: Permissions-Policy, HSTS khi https, cache icon/OG. Không làm đợt này: gộp schema Zod trùng lặp, cache storefront bằng `"use cache"`, CSP, log có cấu trúc.

**P20 — cache nội dung SP storefront (2026-10-30):** nội dung SP (tên, giá, ảnh, danh mục, bộ sưu tập, đánh giá đã duyệt, sitemap) cache bằng `"use cache"` + `cacheLife("hours")`, xoá bằng `updateTag` khi admin sửa (thêm cho ảnh SP, tạo thương hiệu, áp giá hàng loạt, duyệt đánh giá — `REVIEWS_TAG` mới). Tồn kho + lịch bộ sưu tập luôn tính lúc request; trang chủ tính tồn một lần cho mọi dải. Đo local (build standalone, 51 SP demo, 10 kết nối): trang chủ p50 861 → 255 ms, ~11 → 20 req/s; trang SP p50 477 → 322 ms; danh mục 497 → 303 ms; sau khi cache mỗi lượt tải chỉ còn 9–14 câu SQL (chủ yếu tính tồn). Giữ cấu trúc trang render theo request (không đổi giao diện). Chưa làm: gộp schema Zod, CSP.

**P21 — gộp schema Zod + CSP (2026-10-30):** khối Zod lặp (id, chữ Myanmar, SĐT, email, slug, mật khẩu + khớp mật khẩu, locale, hướng di chuyển) gộp vào `src/lib/schemas.ts`, giữ nguyên câu báo lỗi; ghi chú sổ địa chỉ nâng 300 → 500 như đơn hàng (trước đó lưu địa chỉ sau đặt hàng có thể âm thầm lỗi). CSP kết hợp: admin + cổng CTV dùng nonce mỗi request + `'strict-dynamic'` (chặn script chèn vào trang); storefront dùng `'unsafe-inline'` để giữ static shell (P20) nhưng vẫn chặn script/khung/form/plugin từ domain lạ. E2E `csp.spec` đi qua các trang chính, yêu cầu 0 vi phạm.

**P22 — tiếng Việt cho storefront (2026-11-02):** thêm locale `vi` (`/vi/...`, `messages/store.vi.json`), **giữ `my` mặc định** và ưu tiên Myanmar + English: menu ngôn ngữ thả xuống (`<details>`, không cần JS) xếp မြန်မာ → English → Tiếng Việt, `x-default` = my, không tự đoán ngôn ngữ trình duyệt. **Chỉ dịch giao diện**: không có ô nhập nội dung SP/danh mục/bộ sưu tập tiếng Việt — `pick()` fallback `locale → en → my`, nên /vi hiện tên/mô tả English (tên SP chốt vào đơn đặt từ /vi cũng là English). Tìm không dấu: `normalizeForSearch` bỏ dấu Latin (U+0300–036F, đ→d), migration `p22_search_fold` bỏ dấu `searchText` cũ. Banner chọn được "Tiếng Việt". Email khách vẫn my/en (`User.locale` mặc định "vi" của nhân viên/CTV không phản ánh lựa chọn của khách). Địa danh VTP trên /vi = tên English.

**P23 — tỷ giá nhập qua USD (2026-11-02):** trang Giá & tỷ giá nhập **1 USD = ? MMK** và **1 USD = ? VND** (bỏ ô nhập thẳng MMK/VND); hệ thống tự tính và hiện hai chiều (1 MMK = ? VND, 1 VND = ? MMK) ngay khi gõ. `ExchangeRate` thêm `mmkPerUsd`/`vndPerUsd` (Decimal(14,2), migration `p23_rate_usd`, dòng cũ để null); `mmkPerVnd` vẫn lưu (tính sẵn 6 số lẻ) cho chỗ cũ. Công thức diễn đạt theo VND/MMK: giá = vốn VND ÷ (VND cho 1 MMK) × (1 + %lãi), làm tròn lên — `suggestPrice`/`vndToMmk` dùng `rateFraction` (tỷ lệ mmkPerUsd/vndPerUsd chính xác bằng BigInt, không qua số làm tròn); tỷ giá cũ vẫn tính theo `mmkPerVnd`. Ô nhập bỏ dấu phẩy phân cách nghìn; dấu chấm = thập phân.

**Tên miền + server (2026-10-30):** tên miền chính `tandcstore.com` (mua và quản lý DNS tại inet.vn; `www` chuyển về apex). Server Ubuntu `10.201.42.65` (SSH `vcm_aio`), **dùng chung với web VCM XDDD** (Nginx + Certbot trên 80/443, PM2 cổng 3001, PostgreSQL hệ thống) → không dùng Coolify; app chạy bằng Docker Compose (project `tandc`, `/var/www/tandc`, `127.0.0.1:3000`) sau Nginx dùng chung, IP công cộng = IP của web VCM (đã NAT). Tài khoản khách: SĐT + mật khẩu (chính) + Google (giữ), **không dùng email** (`EMAIL_DRIVER=none`, không Resend) — quên mật khẩu: khách nhắn shop, nhân viên đặt lại ở `/admin/customer-accounts`. Lộ trình (chốt lại 2026-10-30, server đã sẵn sàng): **đi thẳng lên server**, bỏ giai đoạn Vercel — trỏ tandcstore.com về server ngay, chạy thử trên chính tên miền này với "Nhận đơn trên web" tắt; ngày chuyển = tắt nhận đơn Vercel → chép dữ liệu Neon/Blob lần cuối → bật nhận đơn trên server → chuyển hướng glow-mm.vercel.app sang tandcstore.com (Claude làm). Danh sách lệnh: `docs/lenh-trien-khai-tandcstore.md`. Runbook: `docs/huong-dan-trien-khai-tandcstore.md`.

**P17 — quyết định (2026-10-28):** Khách đăng ký / đăng nhập bằng SĐT + mật khẩu, không OTP (chưa có dịch vụ SMS **[CẦN XÁC MINH]**). SĐT chưa xác minh → không dùng để gắn đơn cũ, không tự lấy lại mật khẩu: khách nhắn shop, admin đặt mật khẩu tạm ở "Tài khoản khách" (`users:manage`), có khoá/mở khoá. Giới hạn: 10 đăng ký / giờ / IP; đăng nhập 20 lần / phút / IP và 10 lần / 10 phút / SĐT.

**P16 — quyết định (2026-10-28):** CTV đăng nhập storefront bằng chính tài khoản CTV (email/mật khẩu hoặc Google cùng email; email CTV do admin nhập/duyệt coi như đã xác minh). Đơn CTV đặt trên web (mua cho mình hoặc đặt hộ khách) tự gắn CTV đó, nguồn "CTV tự lên đơn", tính doanh thu + hoa hồng như đơn bán; bỏ qua cookie link giới thiệu của CTV khác. Nhân viên không dùng email nhân viên để mua trên storefront.

**P15 — quyết định (2026-10-28):**
- Địa chỉ theo file VTP OMS (`vtp_myanmar_receiver_address.md`): Liên bang/Vùng → Huyện → Thị trấn (form VTP ghi ô 3 là "Ward" nhưng dữ liệu là Township). Lưu cả tên tiếng Anh + mã VTP; tên Myanmar là bản nháp **[CẦN XÁC MINH]**.
- Phí ship do đơn vị vận chuyển thu trực tiếp khi giao → đơn web/admin/CTV chỉ tính tiền hàng; đơn cũ giữ phí đã chốt.
- 1 SĐT phụ tuỳ chọn cho người nhận; tra đơn vẫn chỉ theo SĐT chính.
- Xuất/đẩy đơn sang VTP OMS: để sau (cần mẫu file import hoặc API key VTP **[CẦN XÁC MINH]**).

**P14 — quyết định (2026-10-27):**
- Đăng nhập: Google + email/mật khẩu. Email gửi qua Resend (xác minh email bắt buộc, quên mật khẩu). Chưa có tên miền → production tạm chỉ Google (`EMAIL_DRIVER=none` ẩn email); có tên miền thì đặt biến Resend là bật **[CẦN XÁC MINH: tên miền]**.
- Instance Better Auth riêng cho khách (`/api/customer-auth`, cookie `glow-customer`, phiên 30 ngày); nhân viên/CTV không đăng nhập được ở đó và ngược lại; Google không liên kết được vào tài khoản nhân viên/CTV.
- Checkout bắt buộc đăng nhập; đơn gắn `Order.accountId`. Đơn ngoài web (Facebook/Viber/nhân viên/CTV) vẫn tra bằng mã + SĐT; tra được (hoặc đơn trong cookie trình duyệt) thì tự gắn vào tài khoản khi đăng nhập. Không gắn đơn theo SĐT đơn thuần (không OTP).
- Sổ địa chỉ tối đa 10, địa chỉ mặc định tự điền khi thanh toán. Đăng xuất xoá cookie nhớ đơn (máy dùng chung).
- Facebook login có thể cần ở Myanmar **[CẦN XÁC MINH]** — thêm sau vào `socialProviders`.

**P11 — quyết định (2026-10-26):**
- 2 tầng: người bán nhận % của mình như P10; cấp trên trực tiếp nhận thêm `affiliate.uplineRateBp` (mặc định 2%) tiền hàng thực thu — shop trả, không trừ vào người bán; không hưởng tiếp xuống tầng dưới nữa. Cấp trên + % chốt vào đơn lúc gắn CTV (`Order.uplineAffiliateId/uplineRateBp`); cấp trên bị khoá → đơn mới không tính.
- Chi trả tách loại dòng `AffiliatePayoutLine.kind` (SALE | UPLINE); một lần chi gồm cả hai loại của CTV đó, kể cả số âm.
- Mọi CTV có link mời; người mới tự đăng ký (mật khẩu tự đặt, băm sẵn trong `AffiliateApplication`) → admin duyệt (nhập mã + %, mặc định `affiliate.defaultRateBp`) → gắn dưới người mời. Chống spam: honeypot, ≤ 20 đơn chờ / người mời, ≤ 5 đơn / giờ / IP.
- Cấp trên chỉ thấy số tổng của tuyến dưới (không tên/SĐT/địa chỉ khách). Chỉ admin đổi cấp trên (chặn vòng), áp cho đơn mới.
- [CẦN XÁC MINH] Quy định Myanmar về bán hàng đa cấp / trực tiếp trước khi mở cho CTV dùng. Thiết kế: không phí tham gia, không thưởng cho việc tuyển, chỉ trả trên doanh số thật, giới hạn 2 tầng.
- Seed: CTV cấp dưới `ctv2@glow.local` (mã LINN) dưới MAUNG.

**P8 — quyết định (2026-10-16):** không gửi email (chưa có dịch vụ mail), admin tự báo mật khẩu tạm, nhân viên đổi ở `/admin/account`. Bỏ ô "ngôn ngữ" khi tạo nhân viên vì ngôn ngữ admin lấy theo cookie từng trình duyệt (`User.locale` chưa dùng). Ngoài phạm vi: bắt buộc đổi mật khẩu lần đầu (cần cột mới), 2FA, trang xem AuditLog.

**P3 — quyết định đã chốt (2026-10-15):**
- Thêm trang Cài đặt (ngưỡng, giờ giữ hàng, COD, làm tròn giá, hướng dẫn chuyển khoản); quản lý Nhân viên để sau.
- Vốn VND để tính giá = lô nhập gần nhất (`landedCostVnd`, chưa phân bổ thì `unitCostVnd`); combo = tổng thành phần. Áp dụng đúng bản xem trước (`PriceRunLine`).
- Trả hàng một phần theo dòng → về đúng lô đã xuất, vào "Chờ kiểm tra" → nhập lại kho bán hoặc huỷ; ghi nhận hoàn tiền thủ công.
- Doanh thu = tiền hàng đơn COMPLETED theo ngày hoàn tất (giờ Yangon), trừ hàng trả; lợi nhuận = doanh thu − giá vốn lô đã xuất; phí ship tách riêng.

**P6 — Nội dung trang chủ: quyết định đã chốt (2026-10-16)**

Đợt trước đã làm storefront responsive theo bố cục lengocanh.vn (nhánh `claude/storefront-desktop`), nhưng banner, icon nhóm hàng và các dải "chủ đề" vẫn là phần giữ chỗ. P6 thêm phần quản trị để admin tự cập nhật nội dung trang chủ. Không đụng tới kho, giá hay đơn hàng.

- **Banner:** carousel vuốt được bằng CSS scroll-snap (chạy cả khi chưa tải JS), kèm client component nhỏ (~1–2KB) để tự chuyển sau 5s, có chấm tròn và mũi tên trên desktop.
  - Dừng tự chuyển khi người dùng chạm/rê chuột, khi `prefers-reduced-motion`, hoặc khi carousel ra khỏi màn hình.
  - Mỗi banner gồm: ảnh desktop 3:1 + ảnh mobile 3:2 (không bắt buộc), ngôn ngữ (my / en / cả hai), link đích, ngày bắt đầu/kết thúc, bật/tắt, thứ tự.
- **Icon danh mục:** upload ảnh vuông PNG/WebP/JPG. Không nhận SVG vì rủi ro XSS. Danh mục chưa có icon thì hiện chữ cái đầu như hiện tại.
  - Thêm trang quản lý danh mục: đổi tên my/en, danh mục cha, thứ tự, icon.
- **Bộ sưu tập:** admin chọn tay sản phẩm và xếp thứ tự. Mỗi bộ có tên my/en, lịch hiển thị, bật/tắt, cờ "hiện trên trang chủ".
  - Trang chủ xếp theo thứ tự: banner → nhóm hàng → các bộ sưu tập → SP mới → dải theo danh mục.
  - "Xem thêm" mở `/[locale]/collection/<slug>`.
  - Bộ sưu tập chỉ gom sản phẩm, không đổi giá. Giá gạch ngang và mã giảm giá vẫn ngoài phạm vi.
- **Quyền:** thêm `content:manage` (ADMIN) cho banner và bộ sưu tập. Icon và quản lý danh mục dùng `catalog:manage` sẵn có.

**P6 — chi tiết**

*Dữ liệu (một migration, chỉ PostgreSQL chuẩn):*
- `Banner`:
  - `desktopFileId` → `FileObject`, `mobileFileId?` → `FileObject`
  - `alt`, `locale?` (null = cả hai), `href?`
  - `sortOrder`, `active`, `startAt?`, `endAt?`, `createdAt/updatedAt`
- `Category.iconFileId?` → `FileObject`.
- `Collection`:
  - `slug @unique`, `sortOrder`, `active`, `showOnHome`, `startAt?`, `endAt?`
  - `CollectionTranslation` (locale, name), `CollectionItem` (collectionId, productId, sortOrder; khoá chính ghép)
- Thời gian lưu UTC. Admin nhập và hiển thị theo giờ Yangon.
- `href` chỉ nhận đường dẫn nội bộ (`/…`) hoặc `https://`.

*Domain (`src/server/content/`, `src/server/catalog/`, không import Next):*
- Tách phần kiểm tra ảnh trong `catalog/images.ts` (magic bytes, ≤ 5MB, chỉ JPG/PNG/WebP, dọn file mồ côi khi lỗi DB) thành helper dùng chung. Banner và icon dùng lại helper này.
- `banners.ts`: tạo/sửa/xoá/sắp xếp/bật-tắt; `activeBanners(locale, now)`.
- `collections.ts`:
  - tạo/sửa, thêm/bỏ/sắp xếp SP (khoá dòng như ảnh SP)
  - `homeCollections(locale, now)`, `collectionProducts(slug, locale)`; chỉ lấy SP đã đăng và có biến thể active, dùng chung điều kiện với `listStoreProducts`
- `categories` admin: `updateCategory`, `setCategoryIcon` / `removeCategoryIcon`; `listRootCategories` trả thêm `iconUrl`.
- Mọi thay đổi ghi `AuditLog`. Action admin validate bằng Zod + `requirePermission`, rồi gọi `updateTag`:
  - `HOME_TAG` cho banner/bộ sưu tập
  - `CATALOG_TAG` cho danh mục

*Admin (chuỗi trong `messages/admin.{vi,en,my}.json`):*
- `/admin/content/banners`: danh sách có ảnh thu nhỏ; form tạo/sửa (2 ô ảnh, ngôn ngữ, link, lịch, bật/tắt); lên/xuống thứ tự.
- `/admin/content/collections`: danh sách → trang sửa gồm tên, slug, lịch, cờ trang chủ, ô tìm SP để thêm, danh sách SP lên/xuống/bỏ.
- `/admin/categories`: cây danh mục; sửa tên/cha/thứ tự; upload/xoá icon. Form "Danh mục mới" ở trang Sản phẩm chuyển sang trang này.
- Thêm vào menu admin, chỉ hiện với vai trò có quyền.

*Storefront:*
- `HomeBanner` (server):
  - Dùng `"use cache"` + `cacheTag(HOME_TAG)`; lọc theo lịch lúc request.
  - Ảnh dùng `<picture>` + `getImageProps` (art direction desktop/mobile); ảnh đầu `priority`, các ảnh sau lazy.
  - Không có banner thì dùng banner CSS hiện tại.
- `BannerCarousel` (client nhỏ): tự chuyển, chấm tròn, mũi tên.
- Ô nhóm hàng hiện icon (`next/image`, 64px).
- Dải bộ sưu tập (`StoreSection` + `ProductRail`) đứng trước dải danh mục. Thêm trang `/[locale]/collection/[slug]` (breadcrumb + lưới).
- Proxy 404: `store-slugs.ts` thêm loại `collection` (chỉ bộ đang bật và trong lịch).

*Thứ tự làm (commit sau mỗi bước, dừng chờ duyệt sau P6):*
1. **P6a** Schema + migration (`npm run db:migrate`, không reset) + domain + integration test:
   - lịch hiển thị, ngôn ngữ, thứ tự
   - SP ẩn không lọt vào bộ sưu tập
   - file mồ côi bị dọn khi lỗi
   - từ chối SVG / `href` `javascript:`
2. **P6b** Ba màn hình admin + E2E: admin tạo banner (ảnh fixture), danh mục có icon, bộ sưu tập 2 SP.
3. **P6c** Storefront (carousel, icon, dải + trang bộ sưu tập, proxy 404) + E2E mobile/desktop:
   - banner hiện và tự chuyển
   - không cuộn ngang
   - `/en/collection/khong-co` trả 404
   - Kèm `npm run perf`. Ảnh banner thành LCP nên ảnh mobile cần ≤ ~60KB (AVIF/WebP 750w). Nếu slow-3g < 70 thì xem lại trước khi xong.

*Hiệu năng (đã chốt 2026-10-16):*
- Đo trên DB có 1 banner ảnh: mobile 94 / 98 / 96 (trang chủ / SP / danh mục), desktop 100; slow-3g trang chủ **69**, SP 71, danh mục 71.
- Ảnh LCP mobile chỉ ~14KB (AVIF/WebP 750w, `fetchpriority=high`, có trong HTML ban đầu). Phần tụt chủ yếu do mô phỏng 400 Kbps tính chung ~160KB JS nền của Next/React; trang chủ không banner vốn đã ~70.
- Quyết định: ngưỡng slow-3g chỉ để **theo dõi**. Chấp nhận trang chủ có banner ảnh ở mức 69; vẫn giữ **≥ 70** cho trang không có banner ảnh (`npm run perf` đo trên seed không có banner nên cổng này không đổi). Ảnh banner nên nén tốt (ảnh mobile ≤ ~60KB) để không tụt thêm.

*Rủi ro / cần xác minh:*
- Nút "Lên/Xuống" đủ dùng khi số lượng ít. Kéo-thả để sau.
- Seed-demo (đang làm ở phiên khác) có thể thêm banner/icon mẫu sau khi P6a xong.
- Chuỗi tiếng Myanmar mới cần người bản ngữ duyệt **[CẦN XÁC MINH]**.

**P7 — Hoàn thiện trước khi mở bán: quyết định (2026-10-16)**
- URL gốc lấy từ `APP_URL` lúc build (Docker: build arg) qua `src/lib/site.ts`, không qua `env()` (build không có secret).
- 404 cho đường dẫn lạ: proxy rewrite sang `/<locale>/404` (trang tĩnh, HTTP 404 thật, có header/footer) theo danh sách dạng route `isKnownStorePath`; không dùng `globalNotFound` (còn experimental). Unit test quét `src/app/[locale]` để danh sách không lệch route.
- Bản dịch: `npm run i18n:export` ra CSV (Excel) cho người bản ngữ, `npm run i18n:import` ghi lại cột `my` (giữ biến ICU, chuyển Zawgyi → Unicode); key cần duyệt liệt kê trong `messages/review-my.json`.
- Ngoài phạm vi: mã giảm giá, tài khoản khách (đã làm ở P14), Telegram, Search Console/Analytics (cần tài khoản + domain, làm ở P4b) **[CẦN XÁC MINH]**.

## 5. Giao diện
- **Storefront:** tươi sáng, hồng đào. Màu chính `#E8657A`, màu phụ xanh lá nhạt `#7FB89A`, nền kem `#FFF8F5`, chữ `#2B2B2B`. Mobile-first, nút bấm cao ít nhất 44px.
- **Admin:** shadcn mặc định (trung tính, có dark mode), màu nhấn = màu thương hiệu.
- **Design token:** màu khai báo bằng biến CSS trong `globals.css`, nên đổi thương hiệu chỉ cần sửa 1 chỗ. Logo chữ tạm cho đến khi có logo thật.
- **Mẫu đã duyệt:** 3 màn hình mobile (trang chủ, trang sản phẩm, thanh toán) với chữ Myanmar thật. Layout ở Bước 4 dựng theo mẫu này.
- **Ngoài phạm vi hiện tại:** mã giảm giá, báo đơn mới qua Telegram, in phiếu kho, xuất Excel, nhà cung cấp/PO, quét mã vạch, đối soát COD, blog → xem lại sau P4.

