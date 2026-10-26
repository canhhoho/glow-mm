# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Web bán mỹ phẩm B2C nhập từ Việt Nam, bán tại Myanmar. Kế hoạch chi tiết: [PLAN.md](PLAN.md). Triển khai: [DEPLOY.md](DEPLOY.md).

## Cách làm việc
- Trả lời bằng **tiếng Việt**, ngắn gọn.
- Làm theo phase trong PLAN.md; **dừng chờ duyệt** sau mỗi phase/bước lớn.
- Điểm chưa rõ → hỏi dạng lựa chọn, có đề xuất khuyến nghị. Thông tin về dịch vụ/luật/thư viện Myanmar chưa kiểm chứng → ghi **[CẦN XÁC MINH]**, không tự giả định.
- Đổi stack/kiến trúc chỉ khi có lý do rõ ràng và được duyệt.

## Stack
Next.js App Router (TS, `output: "standalone"`) · Tailwind + shadcn/ui · PostgreSQL + Prisma · Better Auth + RBAC tự viết · next-intl · PWA · Vitest · Playwright · npm · Node 24 LTS (ghim trong `.nvmrc`, Dockerfile).
Next.js 16 có API mới (proxy thay middleware, Cache Components bật) → đọc `node_modules/next/dist/docs/` trước khi viết code Next (xem AGENTS.md).

## Quy tắc bắt buộc
**Portability (Vercel/Neon ↔ server Myanmar/Coolify, cùng một code)**
- Chỉ dùng PostgreSQL chuẩn qua Prisma; không dùng tính năng riêng của nhà cung cấp.
- Không dùng tính năng chỉ có trên Vercel trong logic lõi. Lưu file qua adapter `STORAGE_DRIVER=vercel-blob|local`.
- Tác vụ định kỳ = route `GET/POST /api/cron/<job>`, header `Authorization: Bearer <CRON_SECRET>` (Vercel Cron gửi sẵn).
- Mọi URL/cấu hình lấy từ env (validate bằng Zod ở `src/lib/env.ts`). Thêm biến mới → cập nhật `.env.example` kèm ghi chú theo môi trường. **Không commit secret.**

**Kho (ưu tiên cao nhất)**
- Tồn kho chỉ thay đổi qua `StockDocument` → `StockLedger` (ghi thêm, không sửa/xoá) + cập nhật `StockBalance` trong **cùng transaction**, khoá dòng bằng `SELECT … FOR UPDATE`. Không bao giờ sửa số lượng trực tiếp.
- Xuất hàng theo FEFO; không bán lô có hạn dùng dưới ngưỡng cấu hình (mặc định 90 ngày).
- Giữ hàng ở cấp biến thể; phân lô khi đóng gói. Combo trừ kho từng thành phần. Tester/quà là `stockType=TESTER`, không bán được.
- Landed cost tính theo lô, lưu tỷ giá VND/MMK tại thời điểm nhập.

**Code**
- Logic nghiệp vụ nằm ở `src/server/<domain>/`, không import Next/Vercel → test được bằng Vitest.
- Mọi Server Action/route handler: validate input (Zod) + kiểm tra quyền phía server (`requirePermission` trong `src/server/auth/session.ts`, bảng quyền ở `roles.ts`). Middleware không phải lớp bảo mật.
- Chuyển trạng thái đơn chỉ qua `src/server/orders/state-machine.ts`.
- Tiền là số nguyên (MMK, VND); tỷ giá là `Decimal`. Thời gian lưu UTC; hiển thị theo Asia/Yangon hoặc Asia/Ho_Chi_Minh.
- Không viết cứng chuỗi giao diện: storefront `messages/store.{my,en}.json` (mặc định `my`); admin `messages/admin.{vi,en,my}.json`.
- Chữ Myanmar dùng Unicode. Input tìm kiếm/form đi qua `src/lib/myanmar` (phát hiện + chuyển Zawgyi → Unicode).
- Storefront: ưu tiên Server Components, JS client tối thiểu, `next/image` (AVIF/WebP, lazy). Phải dùng được trên Slow 3G.
- Admin: URL `/admin/...`, locale lấy từ cookie `ADMIN_LOCALE`; storefront: `/` (my) và `/en`.
- Màu dùng design token trong `globals.css` (màu chính `#E8657A`, phụ `#7FB89A`, nền `#FFF8F5`); không hardcode màu trong component.

## Kiến trúc
- **Route:** storefront `src/app/[locale]/`; admin `src/app/admin/(panel)` (+ `(print)`, `login`); cổng CTV `src/app/ctv/(portal)` + `login` (P10); API `src/app/api/{auth/[...all],cron/[job],files/[...key],health}`. `src/proxy.ts` = next-intl + rewrite slug lạ → `/{locale}/404` (không áp cho admin/api); `?ref=CODE` → cookie CTV rồi redirect; `/ctv` bỏ qua next-intl, gắn header để i18n chọn ngôn ngữ cổng CTV.
- **Luồng ghi:** form → `src/server/<domain>/actions.ts` (file `"use server"` duy nhất của domain) → `requirePermission` → hàm domain (tự parse Zod, schema nằm trong file domain) → trả `{ error }` hoặc `revalidatePath`/`updateTag`. Trang admin dùng `requirePagePermission` (redirect).
- **Auth:** Better Auth chỉ cho nhân viên (`server/auth/auth.ts`, tắt đăng ký, phiên 12h). Khách không đăng nhập — nhận diện bằng SĐT + cookie mã đơn. RBAC thuần `roles.ts`: `can(role, perm)`, vai trò `ADMIN`/`WAREHOUSE_MANAGER`/`ORDER_STAFF`. CTV = role `AFFILIATE` (ngoài ROLES): `requireAffiliate()` → `affiliateId` từ phiên, mọi truy vấn cổng CTV lọc theo nó; hoa hồng thuần ở `affiliates/commission.ts` (2 tầng P11: `splitCommissions` tách SALE / UPLINE theo `AffiliatePayoutLine.kind`).
- **Cache (`cacheComponents`):** `"use cache"` + `cacheTag` chỉ ở menu danh mục và banner trang chủ (`CATALOG_TAG`, `HOME_TAG`); action admin gọi `updateTag` (không dùng `revalidateTag`). `instant = false` ở layout admin và các trang slug storefront.
- **Kho/đơn:** `inventory/documents.ts` (DRAFT → POSTED) → `inventory/ledger.ts` `applyMoves` = nơi duy nhất ghi `StockBalance` (cấm tồn âm). `fefo.ts`, `orders/state-machine.ts`, `alerts/compute.ts` là hàm thuần; `orders/transitions.ts` khoá đơn `FOR UPDATE`, nhận `Actor` (user/system).
- **Hạ tầng:** `env()` validate lazy (`src/lib/env.ts`); `src/lib/db.ts` dùng PrismaPg, client sinh ở `src/generated/prisma`; migrate/seed dùng `DIRECT_DATABASE_URL || DATABASE_URL` (`prisma.config.ts`). `storage()` ở `src/server/adapters/storage`. Cron: map `JOBS` trong `api/cron/[job]`, lịch ở `vercel.json`.
- **i18n:** storefront `my` (mặc định) + `en`, `localePrefix: "as-needed"`. Thêm/sửa chuỗi `my` → thêm key vào `messages/review-my.json` (danh sách chờ người bản ngữ duyệt); `npm run i18n:export` / `i18n:import -- file.csv` trao đổi qua CSV.
- **Test:** `tests/unit` (logic thuần, `server-only` alias rỗng) · `tests/integration` (DB `glow_test`, chạy tuần tự, fixture ở `fixtures.ts`) · `tests/e2e` (1 worker, build standalone cổng 3100, global setup = migrate + seed + xoá `rateLimit`; project `mobile` Pixel 7 và `desktop` chỉ chạy `*.desktop.spec.ts`; helper `login`, `openAdminNav`). CI `.github/workflows/ci.yml` chạy `npm test` với Postgres 17.

## Lệnh
```bash
npm install
docker compose up -d     # Postgres dev ở localhost:15432 (DB glow + glow_test)
cp .env.example .env     # rồi sửa secret
npm run db:migrate       # prisma migrate dev (tạo/áp migration)
npm run db:seed          # dữ liệu mẫu (có tiếng Myanmar), tài khoản *@glow.local
npm run db:seed:demo     # + ~45 SP demo từ lengocanh.vn kèm ảnh (chỉ DB dev; ảnh vào ./storage, không commit; --dry-run, --no-images)
npm run db:seed:placeholders  # ảnh minh hoạ tự vẽ (SP/banner/icon) cho Preview — không bản quyền; Blob cần --yes (xem DEPLOY.md §1.3)
npm run seed:preview     # Windows: một lệnh nạp SP demo + ảnh minh hoạ vào Neon preview + Blob (hỏi ẩn chuỗi kết nối/token)
npm run dev              # http://localhost:3000 (storefront) · /admin
npm test                 # TẤT CẢ: lint + typecheck + vitest + playwright (DB glow_test, cổng 3100)
npm run test:unit        # chỉ Vitest unit
npm run test:int         # chỉ Vitest integration (DB glow_test, cần docker)
npm run test:e2e         # chỉ Playwright (build standalone rồi chạy)
# Một test riêng lẻ:
npx vitest run tests/unit/money.test.ts
npx vitest run -c vitest.integration.config.mts tests/integration/orders.test.ts
npx playwright test tests/e2e/smoke.spec.ts --project=mobile   # file *.desktop.spec.ts → --project=desktop
npm run perf             # Lighthouse mobile (cần server production ở cổng 3100, xem scripts/lighthouse.mjs)
docker compose -p glow-prod -f docker-compose.prod.yml up --build   # thử bản giống production (cần .env.prod)
```
- `prisma migrate reset` bị Prisma chặn khi AI chạy → không tự chạy; E2E chỉ dùng `migrate deploy` + seed (không xoá dữ liệu).
- Tài khoản seed: `admin@` / `kho@` / `donhang@glow.local` (admin), `ctv@glow.local` (cổng `/ctv`, mã MAUNG) và `ctv2@glow.local` (mã LINN, tuyến dưới của MAUNG), mật khẩu = `SEED_STAFF_PASSWORD` trong `.env`.
- Grep bỏ qua `.claude/worktrees/` (bản sao cũ). Khối hướng dẫn trong AGENTS.md do `next dev` tự ghi lại — không sửa tay.

## Git
- Làm việc trên `dev`; `main` chỉ chứa code đã test. Merge vào `main` khi `npm test` và CI xanh.
- Commit sau mỗi bước hoàn thành.
