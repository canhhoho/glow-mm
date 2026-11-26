# CLAUDE.md

Web bán mỹ phẩm B2C **T&C Cosmetics** (tên cũ Glow VN) nhập từ Việt Nam, bán tại Myanmar. File này chỉ giữ quy tắc phải nhớ mọi phiên; chi tiết nằm ở tài liệu bên dưới — đọc đúng mục khi cần, đừng đọc cả.

| Cần gì | Đọc |
|---|---|
| Kiến trúc, quy tắc kho/giá/nhập hàng chi tiết, hạ tầng, i18n, auth, cache | [docs/kien-truc.md](docs/kien-truc.md) |
| Sửa giá/kho/đơn/hoa hồng: điểm vào, hàm domain, nơi đọc/ghi | [docs/ban-do-nghiep-vu-admin.md](docs/ban-do-nghiep-vu-admin.md) |
| Hướng dẫn người dùng (admin / CTV) | [docs/huong-dan-van-hanh-admin.md](docs/huong-dan-van-hanh-admin.md), [docs/huong-dan-cong-ctv.md](docs/huong-dan-cong-ctv.md) |
| Triển khai server `10.201.42.65` (tandcstore.com, Docker Compose, **không** Coolify) | [docs/lenh-trien-khai-tandcstore.md](docs/lenh-trien-khai-tandcstore.md), [docs/huong-dan-trien-khai-tandcstore.md](docs/huong-dan-trien-khai-tandcstore.md), [DEPLOY.md](DEPLOY.md) (§2 Coolify chỉ là lịch sử) |
| **Trạng thái hiện tại, việc dở, bước tiếp theo** (đọc đầu phiên) · kế hoạch / phase | [PLAN.md](PLAN.md) mục đầu |
| Trợ lý AI (OpenClaw, cổng MCP, token, công cụ) | [docs/ket-noi-tro-ly-ai.md](docs/ket-noi-tro-ly-ai.md); workspace agent: repo private `canhhoho/tc-cosmetics-agent` |

## Cách làm việc
- Trả lời **tiếng Việt**, dễ hiểu, ngắn gọn. Điều chưa xác minh (luật/dịch vụ/thư viện Myanmar, hành vi chưa chạy thử) ghi **[CẦN XÁC MINH]**, không tự giả định.
- **Tự thực hiện trong phạm vi đã duyệt**, gồm tự kiểm tra và sửa lỗi do thay đổi của mình. Không hỏi từng chi tiết. Yêu cầu mới, rõ ràng của người dùng **thay thế** quyết định cũ — làm theo, ghi một dòng cập nhật vào đúng tài liệu nguồn nếu đáng lưu.
- **Chỉ hỏi khi** thiếu thông tin ảnh hưởng nghiệp vụ, dữ liệu hoặc phạm vi; hỏi dạng lựa chọn, có đề xuất khuyến nghị. Chỉ **dừng chờ duyệt** ở ranh giới phase/bước lớn trong PLAN.md hoặc khi chạm mục "Cần được phép" dưới đây. Đổi stack/kiến trúc chỉ khi có lý do rõ và được duyệt. Không tự chốt nghiệp vụ chưa được duyệt.
- **Truy vết trước khi sửa nghiệp vụ:** liệt kê điểm vào và nơi đọc/ghi — trang chính/con, form, Excel, thao tác hàng loạt, API/server action, hàm domain, DB, cache, web khách — bằng bản đồ nghiệp vụ + grep mọi đường ghi cột/hàm đó. Sửa nhất quán cả chuỗi, không chỉ vá một màn hình; cập nhật bản đồ trong cùng commit.
- **Tái sử dụng:** mỗi nghiệp vụ có **một trang chính + một hàm domain**; trang/nút khác chỉ là lối tắt gọi action/hàm sẵn có (giữ lối tắt hữu ích). Không chép form/schema/công thức/component — dùng lại.
- **Tiếp tục sau gián đoạn:** trước khi chạy lại, xem `git status` + `git log`, log/kết quả test gần nhất và tác vụ nền đang chạy; không chạy lại thứ đã xong.
- **Hai máy (Myanmar / Việt Nam), mỗi lúc một máy:** đầu phiên `git status` + `git stash list` rồi `git pull` `dev`; cuối phiên push `dev` + cập nhật mục "Trạng thái hiện tại" ở đầu PLAN.md (chỉ khi người dùng yêu cầu push). Ghi nhớ của Claude không đồng bộ giữa máy → quy tắc lâu dài ghi vào file này. **Máy VN** (26/11/2026): không có Docker (DISM của Windows hỏng, không bật được WSL2) → PostgreSQL 17 cài thẳng (dịch vụ `postgresql-x64-17`, cổng 15432, user/DB như docker-compose); bỏ qua `docker compose`. npm 11.19 ở máy này chặn script cài đặt → sau `npm ci`/`npm install` chạy `npx prisma generate`.
- **Worktree:** không tạo junction/symlink `node_modules` vào worktree (`git worktree remove --force` từng xoá sạch `node_modules` chính). Cần so sánh bản cũ: worktree có `npm ci` riêng hoặc `git stash`.
- **Tài liệu:** mỗi thông tin một nguồn; giữ ngắn; không tạo bản `v01/v02`; không cập nhật nhiều file cho việc nhỏ. Hành vi đổi → cập nhật hướng dẫn vận hành + bản đồ nghiệp vụ; quyết định/bàn giao đáng lưu → thêm vào `docs/kien-truc.md` (hoặc PLAN.md nếu là phase). Tài liệu cũ **không** đúng hơn code đã kiểm chứng.
- **Báo cáo test** luôn đủ 4 dòng: Đạt / Lỗi / Bỏ qua / Không chạy (kèm lý do); phần chỉ suy luận ghi rõ "chưa chạy".

## Cần được phép (không tự làm)
- Push/merge `main` (**= deploy production tự động**, xem bên dưới), gắn tag release, deploy, SSH tới server (Claude **không** deploy). Push `dev`/mở PR chỉ khi người dùng yêu cầu.
- Xoá/reset dữ liệu vận hành: `npm run db:reset`, `prisma migrate reset` (Prisma cũng chặn khi AI chạy), migration phá huỷ, dọn `backups/`, `storage/`.
- Sửa `docker-compose.prod.yml`, `Dockerfile`, `ops/*`, `.github/workflows/*`, cấu hình Nginx.
- In/commit secret hoặc nội dung `.env*`. Test chỉ dùng giá trị `.env.test`.
- **Trước mọi thao tác ghi DB:** xác minh `DATABASE_URL` trỏ vào DB dev/test/tạm (không phải dữ liệu thật). Test integration/E2E chạy trên DB test (`glow_test`, hoặc DB tạm do mình tạo); script có `--apply` (vd `db:backfill-lot-cost`) chạy thử trước, người dùng tự `--apply` sau khi sao lưu.

## Stack
Next.js App Router (TS, `output: "standalone"`) · Tailwind + shadcn/ui · PostgreSQL + Prisma · Better Auth + RBAC tự viết · next-intl · PWA · Vitest · Playwright · npm · Node 24 (`.nvmrc`).
Next.js 16 có API mới (proxy thay middleware, Cache Components bật) → đọc `node_modules/next/dist/docs/` trước khi viết code Next (xem `AGENTS.md`; khối trong đó do `next dev` tự ghi, không sửa tay).

## Lệnh (đã kiểm với `package.json`)
```bash
npm install && docker compose up -d   # Postgres dev localhost:15432 (DB glow + glow_test)
cp .env.example .env                  # sửa secret; không commit
npm run db:migrate                    # prisma migrate dev; db:deploy = migrate deploy
npm run db:seed                       # dữ liệu mẫu + tài khoản *@glow.local (db:seed:demo / db:seed:placeholders: chỉ DB dev)
npm run dev                           # http://localhost:3000 (storefront) · /admin
npm run check                         # NHANH: lint + typecheck + vitest unit — mặc định sau mỗi thay đổi
npm run test:int                      # vitest integration (DB glow_test, cần Postgres localhost:15432)
npm run test:e2e                      # Playwright (build standalone, cổng 3100); npm test = tất cả
npm run db:test:fresh                 # xoá + tạo lại glow_test (chỉ localhost:15432/glow_test, nối thẳng pg — có/không Docker đều chạy) rồi migrate + seed
npm run test:e2e:fresh                # làm sạch glow_test rồi chạy E2E — dùng cho full E2E trên máy (glow_test tích luỹ dữ liệu làm E2E timeout)
npm run data:check                    # kiểm dữ liệu; db:backfill-lot-cost: bổ sung giá vốn lô cũ (mặc định chạy thử)
npm run i18n:export | i18n:import -- file.csv    # trao đổi bản dịch my qua CSV
npx vitest run tests/unit/money.test.ts          # một test riêng
npx vitest run -c vitest.integration.config.mts tests/integration/orders.test.ts
npx playwright test tests/e2e/smoke.spec.ts --project=mobile   # *.desktop.spec.ts → --project=desktop
```
Tài khoản seed: `admin@` / `kho@` / `donhang@glow.local` (admin), `ctv@glow.local` (cổng `/ctv`), `khach@glow.local` (khách `/login`); mật khẩu = `SEED_STAFF_PASSWORD` trong `.env`. Email dev ở `./storage/outbox/*.json`. Grep bỏ qua `.claude/worktrees/`.

## Quy tắc bất biến (chi tiết: docs/kien-truc.md)
**Portability (server riêng Docker Compose; Vercel/Neon đã bỏ hẳn 19/11/2026):** chỉ PostgreSQL chuẩn qua Prisma; không gắn code vào một nhà cung cấp; file qua adapter `STORAGE_DRIVER` (hiện chỉ `local`); việc định kỳ = `GET/POST /api/cron/<job>` với `Authorization: Bearer <CRON_SECRET>`; mọi URL/cấu hình từ env (Zod ở `src/lib/env.ts`) — thêm biến thì cập nhật `.env.example`.

**Kho (ưu tiên cao nhất):**
- Tồn kho chỉ đổi qua `StockDocument` → `StockLedger` (chỉ ghi thêm) + `StockBalance` trong **cùng transaction**, khoá `SELECT … FOR UPDATE`; DB chặn tồn âm và sửa/xoá ledger. Không bao giờ sửa số lượng trực tiếp.
- Xuất theo FEFO. **Hạn dùng — cờ `FEATURES.expiry = false` (17/11/2026): TẮT hoàn toàn.** FEFO/khả dụng không chặn theo hạn (kể cả lô đã hết hạn), form nhập/phiếu kho không có ô hạn (lô mới = không hạn; có ngày nếu dán/Excel có ngày), ẩn tab/ô cảnh báo hạn và cài đặt hạn, Excel bỏ qua kiểm hạn. Khi bật lại: không bán lô dưới ngưỡng (mặc định 90 ngày), hạn theo **lô** (`DATED`/`NONE`/`UNKNOWN`). Mọi truy vấn khả dụng dùng chung `inventory/fefo.ts` (`isBatchUsable`/`sellableBatchWhere`/`blockedBatchWhere`). Cờ này **đổi hành vi nghiệp vụ** nên hàm thuần `fefo.ts`/`alerts/compute.ts` có kiểm cờ (ngoại lệ có chủ ý); chặn thao tác "Xác nhận hạn" nằm ở action (`resolveBatchExpiryAction`), không trong hàm domain (seed/script import `documents.ts` ngoài Next). Test quy tắc khi bật: `vi.mock("@/lib/features", …)` với `tests/support/expiry-on.ts`; hành vi tắt: `tests/integration/expiry-off.test.ts`.
- **Giá vốn lô = giá mua × tỷ giá lúc ghi sổ**; không còn phí đưa về kho. Ghi sổ phiếu nhập VND khi chưa có tỷ giá → chặn.
- Mỗi SP thuộc đúng **một kho bán**, gán khi ghi sổ phiếu nhập/chuyển đầu tiên. Phiếu nhập nháp: mỗi SP một kho, lưu thì tự tách mỗi kho một phiếu (`saveReceiveDrafts`).
- Cờ tính năng `lib/features.ts`: `autoPricing=false`, `shipments=false`, `expiry=false` — đang **tắt** (ẩn UI + chặn action, giữ code/bảng); giá bán chỉ đặt **thủ công** ở trang Giá bán. Bật lại bằng đổi cờ.

**Code:**
- Logic nghiệp vụ ở `src/server/<domain>/`, không import Next (test được bằng Vitest). Luồng ghi: form → `actions.ts` ("use server") → `requirePermission` → hàm domain (tự parse Zod). Mọi action/route handler phải validate Zod + kiểm quyền phía server (middleware/proxy không phải lớp bảo mật).
- Đơn chỉ đổi trạng thái qua `orders/state-machine.ts`. Tiền là số nguyên (MMK, VND); tỷ giá `Decimal`; thời gian lưu UTC.
- Chuỗi giao diện không viết cứng: storefront `messages/store.{my,en,vi}.json`, admin `messages/admin.{vi,en,my}.json` (test parity ép cùng key); thêm/sửa chuỗi `my` → thêm key vào `messages/review-my.json`. Chữ Myanmar dùng Unicode, input qua `src/lib/myanmar`.
- Storefront: Server Components, JS client tối thiểu, dùng được trên Slow 3G. Admin `/admin/...` (locale cookie `ADMIN_LOCALE`). Màu dùng token trong `globals.css`, không hardcode.
- Cache: action admin đổi dữ liệu khách thấy phải `updateTag` đúng tag; tồn kho không cache. Thêm script/ảnh/kết nối ngoài → sửa `buildCsp` (`src/lib/csp.ts`) và chạy `tests/e2e/csp.spec.ts`.
- Tiền tố kỹ thuật `glow` (cookie, header, DB, `*@glow.local`…) **cố ý giữ** — đổi sẽ đăng xuất khách/mất link CTV.

## Kiểm thử & triển khai
- **Mức ảnh hưởng quyết định bộ test:** thay đổi local → `npm run check` + test bị ảnh hưởng (integration khi đụng DB/transaction; chỉ spec Playwright liên quan). **Không** tự chạy full E2E sau thay đổi UI nhỏ; **không** chạy lại bộ đã xanh trên cùng code.
- Component/layout dùng chung (`src/components/*`, layout, `globals.css`, `messages/*`, `proxy.ts`, `lib/csp.ts`): grep nơi import → chạy spec mọi trang bị ảnh hưởng (mobile + desktop nếu có).
- **Đổi UI → xem trực quan** (preview/screenshot hoặc spec có kiểm hiển thị), không chỉ dựa vào type/lint.
- **Full E2E** (`npm test`; hoặc job `e2e` CI chạy tay/PR vào `main`/hằng tuần) bắt buộc trước khi merge `main`/phát hành và cho thay đổi rủi ro cao: kho/ledger/FEFO, state-machine đơn, checkout, auth/RBAC/rate limit, migration Prisma, CSP/proxy, env. **Full E2E xanh ở local (DB trắng, mobile + desktop, báo cáo 4 dòng) được coi là đạt — không đợi thêm job `e2e` của CI.**
- Không có staging. **Push `main` = deploy production tự động** (CI `check`+`e2e` → tag `release-*` → `ops/tandc-deploy`; chi tiết + rollback `rollback_tag`: [docs/lenh-trien-khai-tandcstore.md](docs/lenh-trien-khai-tandcstore.md)). Chỉ sửa tài liệu (`docs/**`, `*.md` gốc, `README.md`) → không check/e2e/deploy; merge PR có cây code giống hệt đầu PR đã xanh → bỏ chạy lại, deploy ngay. Không tự rollback. Sửa `ops/tandc-deploy`/`ops/sudoers-tandc-deploy` phải cài lại tay trên server.

## Git
- Làm việc trên `dev`; `main` chỉ chứa code đã test; merge `main` khi `check` xanh và đã có full E2E xanh (mục trên). Commit sau mỗi bước hoàn thành, kèm dòng `Co-Authored-By` theo hướng dẫn của hệ thống.

## Còn mâu thuẫn / chưa xác minh (17/11/2026)
- `outputs/` (đề xuất menu, QA) chưa vào git; `docs/kien-truc.md` chỉ được đối chiếu code ở ba điểm đã ghi ở đầu file.
- `npm run db:reset` (`migrate reset --force`) tồn tại trong `package.json` — chỉ dùng khi người dùng cho phép, trên DB tạm.
