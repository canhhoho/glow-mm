# PLAN — Web bán mỹ phẩm VN → Myanmar

## Quyết định đã chốt
| # | Chủ đề | Chốt |
|---|---|---|
| 1 | Dữ liệu đầu | Import CSV/Excel (có file mẫu); tồn đầu kỳ = phiếu nhập qua ledger |
| 2 | Giá | Tỷ giá nhập tay; giá = vốn VND × tỷ giá × (1+%lãi), làm tròn 100 MMK, xem trước → áp dụng; lưu lịch sử |
| 3 | Kho | 1 kho VN + 1 kho MM + vị trí ảo Đang vận chuyển / Hải quan / Chờ kiểm tra; hỗ trợ N kho |
| 4 | Giữ hàng | Cấp biến thể; phân lô FEFO khi Đóng gói |
| 5 | Hạn dùng | Ngừng bán <90 ngày, cảnh báo 180 ngày (cấu hình) |
| 6 | Landed cost | Phân bổ theo giá trị mua (chọn được theo số lượng) |
| 7 | Hàng trả | Vào "Chờ kiểm tra" → nhập lại hoặc huỷ |
| 8 | Combo/Tester | Combo cố định trừ kho thành phần; tester/quà = loại tồn riêng trên cùng lô |
| 9 | COD | Gọi xác nhận; tự huỷ/nhả sau 24h (cấu hình) |
| 10 | Ship | Bảng phí theo vùng/township + mã vận đơn tay; adapter cho API hãng sau |
| 11 | Khách | Định danh SĐT, không OTP; tra đơn = mã đơn + SĐT |
| 12 | Admin i18n | vi + en + my |
| 13 | Chat | FB Page + Viber; link cấu hình qua env/admin |
| 14 | Myanmar text | Bộ phát hiện Zawgyi của Google (vendored) + Rabbit + Noto Sans Myanmar tự host |
| 15 | Auth/File/CI | Better Auth + RBAC tự viết; Vercel Blob ↔ ổ đĩa; GitHub Actions; PWA cơ bản |

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
- `ShippingZone` / `ShippingRate`
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

Trạng thái: P0 ✅ (2026-10-15) · P1 ✅ (2026-10-15) · P2 ✅ (2026-10-15) · P3 ✅ (2026-10-16) · P4a ✅ (2026-10-16) · tiếp theo P4b khi có server + domain Myanmar.

| Phase | Nội dung | Hoàn thành khi |
|---|---|---|
| **P0 Nền tảng** ✅ | Init project, git `dev`/`main`, Prisma schema đầy đủ + seed, layout rỗng store/admin + i18n, Better Auth + RBAC, adapter storage, Docker, `.env.example`, CI, DEPLOY.md | `npm test` (lint + typecheck + vitest + e2e smoke) xanh; `docker compose up` chạy; Vercel preview + Neon hoạt động; đăng nhập theo 3 vai trò |
| **P1 Kho lõi** ✅ | CRUD catalog, import CSV, chuyến hàng + landed cost, phiếu nhận/chuyển/xuất/điều chỉnh, ledger, FEFO, tester, combo, xem tồn theo vị trí/lô | Vitest: FEFO, landed cost/FX, combo; E2E: nhận → chuyển → xuất; không có đường sửa số lượng trực tiếp |
| **P2 Bán hàng** ✅ | Storefront (danh mục, bộ lọc, trang SP có hạn dùng lô hiện tại), giỏ hàng, checkout 1 trang, **tạo đơn thủ công trong admin** (đơn từ FB/Viber), COD + chuyển khoản/upload biên lai, giữ hàng + cron, máy trạng thái đơn, duyệt thanh toán, in nhãn ship, Zawgyi trong ô tìm kiếm/form | Vitest: reservation, chuyển trạng thái; E2E: duyệt web → đơn COD, chuyển khoản → upload → duyệt; Lighthouse mobile chuẩn (Slow 4G mô phỏng) Performance ≥ 85; Slow 3G (RTT 400ms, 400 Kbps) theo dõi, ≥ 70 — `npm run perf` |
| **P3 Vận hành** ✅ | Cập nhật giá hàng loạt + lịch sử, cảnh báo (tồn thấp/cận date/gợi ý đặt hàng), dashboard (doanh thu, lợi nhuận, bán chạy, bán chậm, hàng đang vận chuyển), trả hàng, đánh giá, nút Viber/Messenger, PWA | Toàn bộ test xanh; số liệu dashboard khớp ledger trên dữ liệu seed |
| **P4a Chuẩn bị chuyển** ✅ | Đổi mật khẩu nhân viên (`/admin/account`), cờ tạm tắt nhận đơn web, script chuyển file Blob → ổ đĩa, diễn tập local bằng `docker-compose.prod.yml` (restore dump, chuyển file, backup → khôi phục) | Toàn bộ test xanh; diễn tập local đạt các mục của checklist DEPLOY §2.5 không cần server/domain |
| **P4b Lên server Myanmar** | Khi có server + domain. Theo DEPLOY.md: hardening, Coolify, domain, HTTPS, chuyển DB/file, backup | Checklist sau khi chuyển đạt; khôi phục thử từ backup thành công |
| **P6 Nội dung trang chủ** (đang làm: P6a ✅) | Quản trị banner carousel, icon danh mục, bộ sưu tập sản phẩm; hiển thị trên trang chủ theo bố cục responsive đã duyệt | Toàn bộ test xanh (có E2E admin → storefront, mobile + desktop); `npm run perf` vẫn đạt mobile ≥ 85, slow-3g ≥ 70, desktop ≥ 90 khi trang chủ có banner ảnh |

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

*Rủi ro / cần xác minh:*
- Nút "Lên/Xuống" đủ dùng khi số lượng ít. Kéo-thả để sau.
- Seed-demo (đang làm ở phiên khác) có thể thêm banner/icon mẫu sau khi P6a xong.
- Chuỗi tiếng Myanmar mới cần người bản ngữ duyệt **[CẦN XÁC MINH]**.

## 5. Giao diện
- **Storefront:** tươi sáng, hồng đào. Màu chính `#E8657A`, màu phụ xanh lá nhạt `#7FB89A`, nền kem `#FFF8F5`, chữ `#2B2B2B`. Mobile-first, nút bấm cao ít nhất 44px.
- **Admin:** shadcn mặc định (trung tính, có dark mode), màu nhấn = màu thương hiệu.
- **Design token:** màu khai báo bằng biến CSS trong `globals.css`, nên đổi thương hiệu chỉ cần sửa 1 chỗ. Logo chữ tạm cho đến khi có logo thật.
- **Mẫu đã duyệt:** 3 màn hình mobile (trang chủ, trang sản phẩm, thanh toán) với chữ Myanmar thật. Layout ở Bước 4 dựng theo mẫu này.
- **Ngoài phạm vi hiện tại:** mã giảm giá, báo đơn mới qua Telegram, in phiếu kho, xuất Excel, nhà cung cấp/PO, quét mã vạch, đối soát COD, blog → xem lại sau P4.

