# CLAUDE.md

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

## Lệnh
```bash
npm install
docker compose up -d     # Postgres dev ở localhost:15432 (DB glow + glow_test)
cp .env.example .env     # rồi sửa secret
npm run db:migrate       # prisma migrate dev (tạo/áp migration)
npm run db:seed          # dữ liệu mẫu (có tiếng Myanmar), tài khoản *@glow.local
npm run dev              # http://localhost:3000 (storefront) · /admin
npm test                 # TẤT CẢ: lint + typecheck + vitest + playwright (DB glow_test, cổng 3100)
npm run test:unit        # chỉ Vitest
npm run test:e2e         # chỉ Playwright (build standalone rồi chạy)
npm run perf             # Lighthouse mobile (cần server production ở cổng 3100, xem scripts/lighthouse.mjs)
docker compose -p glow-prod -f docker-compose.prod.yml up --build   # thử bản giống production (cần .env.prod)
```
- `prisma migrate reset` bị Prisma chặn khi AI chạy → không tự chạy; E2E chỉ dùng `migrate deploy` + seed (không xoá dữ liệu).

## Git
- Làm việc trên `dev`; `main` chỉ chứa code đã test. Merge vào `main` khi `npm test` và CI xanh.
- Commit sau mỗi bước hoàn thành.
