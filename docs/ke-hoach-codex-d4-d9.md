# Bàn giao cho Codex: kế hoạch chi tiết D4 → D9 (T&C Cosmetics)

## Context
Chủ shop đang thực hiện `docs/ke-hoach-toi-uu-quy-trinh-ban-hang.md` (kế hoạch tổng). Claude đã làm xong DQ, D0, DT (một phần), D1, D2, D3-lite và push `dev = 2761bf1`; Claude sắp hết token nên phần còn lại giao cho Codex. Tài liệu này là bản giao việc tự đủ: hiện trạng, quy ước làm việc, từng đợt D4 → D9 (việc, file, quyết định, test nghiệm thu) và các việc còn dở.

---

## 0. Hiện trạng (05/11/2026)
- Nhánh `dev` = `2761bf1` đã push; **CI chưa kiểm**; `main` và server tandcstore.com **chưa cập nhật**. Có 3 migration mới chưa lên production: `20261105090000_estimated_inventory_cost`, `20261105120000_d1_price_provenance`, `20261105150000_d3_order_pick` → backup trước khi cập nhật server (runbook `docs/lenh-trien-khai-tandcstore.md`, PHẦN 4).
- Đã xong (chi tiết trong kế hoạch tổng, mục "Trạng thái" từng đợt):
  - DQ: chặn giá ≤ 0 (`price_missing`), form checkout gửi qua `onSubmit`, nguồn giá chỉ từ phiếu RECEIVE POSTED.
  - D0: `/admin/reports/data-health` + `GET /api/admin/reports/data-health` (`src/server/reports/data-health.ts`).
  - DT.2: thao tác hàng loạt đơn (`src/server/orders/bulk.ts`, `components/admin/bulk-order-bar.tsx`), in nhãn hàng loạt, phiếu lấy hàng gộp.
  - D1: provenance + fingerprint + hạn preview + áp từng dòng (`src/server/pricing/cost.ts`, `runs.ts`).
  - D2: readiness (`src/server/catalog/readiness-rules.ts`, `readiness.ts`) — thiếu ảnh chỉ cảnh báo; SP đang hiển thị chỉ chặn giá ≤ 0 / hết biến thể.
  - D3-lite: `OrderPick` manifest (`src/server/orders/picking.ts`), "Chốt lô & In", bàn giao xuất đúng lô; setting `orders.requirePickList` (mặc định tắt).
- Việc đầu tiên của Codex: xem CI của `2761bf1` (GitHub Actions repo `canhhoho/glow-mm`), sửa nếu đỏ, rồi mới làm D4.

## 1. Quy ước bắt buộc (đọc `CLAUDE.md`, `AGENTS.md` trước)
- Trả lời/ghi chú tiếng Việt; dừng chờ chủ shop duyệt sau mỗi đợt; điểm chưa rõ → hỏi dạng lựa chọn có khuyến nghị; thông tin Myanmar chưa kiểm chứng ghi **[CẦN XÁC MINH]**.
- Next.js 16 (proxy thay middleware, Cache Components): đọc `node_modules/next/dist/docs/` trước khi viết code Next.
- Luồng ghi: form → `src/server/<domain>/actions.ts` (`"use server"`) → `requirePermission` → hàm domain parse Zod. Logic domain không import Next. Đổi dữ liệu khách thấy → `updateTag(CATALOG_TAG|HOME_TAG|…)`.
- Kho: chỉ đổi tồn qua `StockDocument` → `inventory/ledger.ts applyMoves`; trạng thái đơn chỉ qua `orders/state-machine.ts` + `transitions.ts`. Tiền là số nguyên MMK/VND.
- Chuỗi giao diện: `messages/admin.{vi,en,my}.json`, `messages/store.{my,en,vi}.json` cùng bộ key (unit test `messages-parity`). Mỗi key `my` mới → thêm vào `messages/review-my.json` (mảng `store`/`admin`, giữ sắp xếp). Sửa JSON bằng script: `json.load` → sửa → `json.dumps(obj, ensure_ascii=False, indent=2) + "\n"` (file round-trip đúng định dạng này).
- `OrderError` code mới (`src/server/orders/errors.ts`) phải có câu dịch `Orders.err.<code>` (admin) và `Checkout.err.<code>` (store) nếu khách có thể gặp.
- Migration: `prisma migrate dev` không chạy được non-interactive → sửa `prisma/schema.prisma`, tạo thư mục `prisma/migrations/<timestamp>_<tên>/migration.sql` bằng `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` (bỏ dòng "Loaded Prisma config"), thêm SQL backfill nếu cần, rồi `npx prisma migrate deploy` + `npx prisma generate`. **Không chạy `prisma migrate reset`**, không chạy `npx prisma format`/`prettier` (định dạng lại cả file).
- Một số file dùng CRLF (vd `src/server/pricing/*.ts`) → giữ nguyên kiểu xuống dòng khi sửa.
- Commit sau mỗi bước, message tiếng Việt dạng `feat(D4): …`, cuối message `Co-Authored-By` theo công cụ đang dùng. Không commit `scripts/github-release.mjs` (file có dùng thông tin đăng nhập GitHub, để ngoài git).

## 2. Cách chạy test (đã kiểm chứng trên máy này)
- `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run test:int` (DB `glow_test`, chạy tuần tự; DB tích luỹ dữ liệu → so **số đếm trước/sau** thay vì số tuyệt đối; fixture `tests/integration/fixtures.ts`: `makeFixture`, `saleFixture`, `orderInput`, `admin`).
- E2E nhanh: `npm run build`, rồi mở terminal riêng: `$env:PORT='3100'; $env:EMAIL_OUTBOX_DIR='<đường dẫn tuyệt đối>\storage-test\outbox'; node --env-file=.env.test scripts/start-standalone.mjs`; gọi `http://localhost:3100/api/health` cho server "ấm" (lần đăng nhập đầu trên server nguội hay quá 5s); rồi `npx playwright test <spec> --project=mobile` (spec `*.desktop.spec.ts` → `--project=desktop`). Playwright tự dùng lại server đang chạy.
- E2E bấm `window.print()`: ghi đè `window.print = () => {}` trước khi bấm. Dialog `confirm` → `page.once("dialog", d => d.accept())`.
- Đọc mật khẩu seed chỉ qua helper (`tests/e2e/helpers.ts login`), không in ra.

---

## 3. D4 — Tiền COD, chi phí bán, hoa hồng (ưu tiên kế tiếp)
Hiện trạng code: `src/server/orders/cod.ts` (`remitCod` một lần, phải `received + fee = totalMmk`, chỉ đơn COMPLETED + PAID + không hoàn hàng; `outstandingCod`); trang `admin/(panel)/orders/cod/page.tsx` (nhãn chờ/ngoại lệ); báo cáo `src/server/reports/queries.ts` (`salesReport` có `profitAfterCommission`, chưa trừ `codCarrierFeeMmk`), `reports/profit.ts`; hoa hồng `src/server/affiliates/commission.ts` (đến hạn sau `completedAt + affiliate.holdDays`, bù trừ âm khi hoàn sau chi), `affiliates.ts` (`dueRows`, chi trả yêu cầu tổng ròng > 0); người trả cước VTP chỉ chọn lúc xuất Excel (`components/admin/vtp-export-form.tsx`, `orders/vtp-data.ts`).

### D4.1 Hàng đợi COD (mở rộng trang có sẵn)
- `orders/cod/page.tsx`: thêm cột số ngày từ `codCollectedAt`, số phải thu, hãng/mã vận đơn; lọc Chờ / Ngoại lệ; tổng theo nhóm tuổi nợ (dùng lại logic `baseline().cod.buckets` trong `reports/data-health.ts`).
- **Đóng ngoại lệ** (đơn có hoàn hàng/hoàn tiền/chưa đủ điều kiện `remitCod`): thêm `settleCodException` trong `cod.ts`, quyền `orders:reconcile-cod` (ADMIN): nhập `receivedMmk`, `feeMmk`, `adjustmentMmk` (≥ 0, phần không thu được do hoàn hàng/hoàn tiền), `reference`, `note` bắt buộc; ràng buộc `received + fee + adjustment = totalMmk`; ghi `codRemittedAt/codRemittedMmk/codCarrierFeeMmk/codRemittanceRef` + cột mới `codAdjustmentMmk Int?`, `codSettlementNote String?` (migration); audit `order.cod-exception`. Không tự suy số tiền hãng còn nợ. **[CẦN DUYỆT với chủ shop]** công thức trên trước khi code.
### D4.2 Người trả cước VTP lưu trên đơn
- Migration: `enum ShippingPayer { RECEIVER SENDER }`, `Order.shippingPayer ShippingPayer @default(RECEIVER)`.
- Chọn ở form tạo đơn admin/CTV (`orders/orders.ts createOrder` nhận thêm trường, mặc định RECEIVER; khách web luôn RECEIVER); sửa được khi đơn còn ở bước chuẩn bị giao (action mới, audit). VTP export lấy mặc định từ đơn (vẫn cho đổi hàng loạt trên form xuất). Trang đơn + nhãn in hiện "Cửa hàng trả cước" khi SENDER.
### D4.3 Báo cáo lợi nhuận 3 mức
- `reports/queries.ts salesReport` + `reports/page.tsx`: (1) lợi nhuận gộp = doanh thu thuần − giá vốn chụp; (2) sau hoa hồng (đã có); (3) **sau chi phí bán đã ghi nhận** = (2) − `codCarrierFeeMmk` của các đơn trong kỳ (theo kỳ hoàn tất) − cước cửa hàng trả (chỉ khi có số liệu thật; chưa có thì không trừ, ghi chú). Không gọi mức 3 là "lãi ròng".
- Hiển thị kèm: số đơn COD hoàn tất trong kỳ chưa đối soát (phí chưa biết), giữ cảnh báo vốn tạm/thiếu. Không đọc cột xem trước `selling_fee_mmk` của import làm chi phí thật.
### D4.4 Điều kiện chi hoa hồng CTV
- Setting bool mới `affiliate.requireCodRemitted` (mặc định **tắt**, thêm vào `BOOL_DEFAULTS` trong `src/server/settings.ts` + trang Cài đặt như `orders.requirePickList`). Bật → đơn COD chỉ đến hạn khi `codRemittedAt != null` và qua hạn chờ; chuyển khoản cần `paymentStatus = PAID` + hạn chờ.
- Áp cùng một hàm điều kiện ở `commission.ts` (thuần, unit test) và mọi nơi dùng: `dueRows` admin, cổng CTV (`affiliates/portal*`), xem trước chi, transaction ghi chi. Bù trừ âm khi hoàn sau chi giữ nguyên.
- Vấn đề đã biết: chi yêu cầu tổng ròng > 0 (`affiliates.ts`) → khi gate giữ khoản dương, khoản âm có thể chặn chi. Đề xuất: khoản âm chuyển sang kỳ sau nếu làm tổng ≤ 0 **[CẦN DUYỆT]**. Admin xem "hoa hồng đang giữ vì chưa đối soát".
### Test nghiệm thu D4
- COD 100,000 về 97,000 phí 3,000 → doanh thu không tăng 97,000, mức 3 trừ 3,000 đúng một lần.
- Đơn hoàn một phần: không `remitCod` được; `settleCodException` với adjustment đúng → đóng; sai tổng → lỗi.
- Bật `affiliate.requireCodRemitted`: COD chưa về không vào `dueRows`; sau đối soát + hạn chờ thì vào; đơn đã chi rồi hoàn vẫn có dòng âm.
- shippingPayer mặc định RECEIVER, export VTP lấy đúng; E2E trang COD + báo cáo.

## 4. D5 — Đo hành vi bằng bảng sự kiện tự ghi (không GA4)
Quyết định đã chốt: tự ghi vào Postgres, không thêm script ngoài, **CSP giữ nguyên** (`src/lib/csp.ts`).
- Model `AnalyticsEvent { id, name String, occurredAt DateTime, sessionId String (ngẫu nhiên, không định danh), locale String?, device String? ("mobile"|"desktop"), path String? (bỏ query), orderId String?, dedupeKey String? @unique, props Json? (≤ 2KB), @@index([name, occurredAt]) }`.
- Route `POST /api/events` (`src/app/api/events/route.ts`): Zod (danh sách tên cho phép), `hitRateLimit` (`src/server/rate-limit.ts`) theo IP `clientIp()`, bỏ bot (user-agent), không nhận PII (không tên, SĐT, email, địa chỉ). Client gửi bằng `navigator.sendBeacon`, mã phiên lưu `sessionStorage` (try/catch).
- Sự kiện client (theo tên GA4): `view_item_list`, `select_item`, `view_item`, `add_to_cart`, `view_cart`, `begin_checkout`, `login_required` (gặp yêu cầu đăng nhập), `login_success`. Một client component nhỏ trong storefront layout + gọi tại nút thêm giỏ/checkout; JS tối thiểu (Slow 3G).
- Sự kiện server (ghi trong hàm domain, không qua trình duyệt): `purchase` trong `createOrder` (dedupeKey `purchase:<orderId>` → không nhân đôi khi tải lại `/order/{code}?placed=1`), `order_confirmed`, `order_shipped`, `order_completed`, `refund` (trả hàng) trong `transitions.ts` / `returns.ts`. Giá trị MMK.
- Web Vitals: `useReportWebVitals` (đọc docs Next) → cùng route, tên `web_vital` + props {name, value, page type}.
- Dọn: job `cleanup` trong `src/app/api/cron/[job]` xoá sự kiện cũ hơn `ANALYTICS_RETENTION_DAYS` (env mới, mặc định 180; validate ở `src/lib/env.ts`, ghi `.env.example`). Env `ANALYTICS_ENABLED` (mặc định true) tắt toàn bộ.
- Báo cáo: tab mới trong Báo cáo (`ReportsTabs` ở `components/admin/reports-tabs.tsx`): phễu theo phiên (xem SP → thêm giỏ → checkout → gặp đăng nhập → tạo đơn → xác nhận → giao thành công), tách mobile/desktop; p75 LCP/INP/CLS theo loại trang.
- **[CẦN XÁC MINH]** quy định dữ liệu cá nhân Myanmar trước khi lưu dài hạn.
- Test: route từ chối PII/tên lạ/vượt rate limit; purchase không nhân đôi; E2E một hành trình thử ra đủ sự kiện; unit test tổng hợp phễu.

## 5. D6 — Giảm trở ngại đặt hàng (chỉ làm sau khi D5 chạy ≥ 2 tuần có số liệu)
- D6.1 (làm được ngay sau D5): lỗi gắn đúng ô (trả `fieldErrors` từ `placeOrderAction` trong `src/server/cart/actions.ts`, hiện dưới từng ô trong `components/store/checkout-form.tsx`, cuộn tới lỗi đầu); lỗi hết hàng/đổi giá nêu SKU + nút về giỏ; gần nút đặt hàng: tiền hàng, "phí giao VTP thu khi nhận hàng", cách thanh toán, liên hệ Viber/Messenger (`components/store/contact-links.tsx`); trang sau đặt (`[locale]/order/[code]`) ghi rõ "Đã tạo đơn — chờ xác nhận", tách khỏi trạng thái đã thanh toán. Messages 3 ngôn ngữ store.
- D6.2 guest COD: cờ `store.guestCodEnabled` (bool setting, mặc định tắt). Bật → `/checkout` không bắt đăng nhập **chỉ với COD**: bỏ `checkout` khỏi danh sách chặn của proxy (`src/server/auth/session-cookie.ts customerLoginRedirectFor`) và để trang/action tự quyết theo cờ (proxy không đọc DB). Tạo đơn `accountId = null`, dùng `rememberOrder` (cookie mã+SĐT, đã có) để xem đơn; `hitRateLimit` riêng cho đặt guest; idempotency giữ nguyên; CTV đăng nhập vẫn được gán; link giới thiệu giữ attribution (`referralFromCookie`). Không tự gắn đơn vào tài khoản SĐT chưa xác minh (chỉ `claimOrders` hiện có). Sau đặt mời tạo tài khoản. Chuyển khoản vẫn bắt đăng nhập.
- Đánh giá bằng số liệu D5: tỷ lệ tạo đơn, xác nhận được, giao thành công, huỷ, đơn trùng — không kết luận chỉ bằng số đơn tạo.

## 6. D7 — Danh sách hàng, trang SP, hiệu năng
- `src/server/catalog/store-queries.ts`: bỏ `take 60` + sort JS (`sortCards`). Sort giá theo **giá thấp nhất của biến thể active** bằng SQL chuẩn (Prisma `$queryRaw` có tham số hoặc aggregate), thứ tự phụ ổn định (id); lọc danh mục/thương hiệu/tag/từ khoá áp trước đếm + phân trang (`?page=` hoặc "tải thêm"), trả tổng thật (trang danh mục đang hiện `products.length`). URL giữ bộ lọc/sort/trang. Nội dung cache như cũ (`cached.ts`), tồn vẫn `withStock` theo request; không cache vô hạn từng tổ hợp tìm kiếm.
- Bộ sưu tập (`server/content/collections.ts loadCollectionRow`) đang không giới hạn → phân trang/giới hạn.
- Gallery trang SP (`[locale]/p/[slug]/page.tsx`): client component nhỏ — bấm thumbnail đổi ảnh lớn, bàn phím + vuốt điện thoại, `next/image`.
- Đo LCP/INP/CLS trước/sau (`npm run perf` + số liệu D5). Test: fixture > 60 SP, SP rẻ nhất tạo sớm vẫn đứng đầu khi sort tăng, không trùng/mất qua trang, back/forward giữ trạng thái; sửa giá xong khách thấy đúng (updateTag).

## 7. D8 — Chuyến hàng & đợt nhập
- `src/server/inventory/landed-cost.ts` + `shipments.ts`: thêm `BY_WEIGHT` (enum allocation method, migration) — trọng số = SL RECEIVE đã POSTED × `Variant.weightGrams`; thiếu khối lượng → liệt kê SKU, không tự đổi sang chia theo SL; giữ BY_VALUE/BY_QTY cho chuyến cũ; xử lý phần làm tròn rõ ràng (cộng dồn sai số vào lô cuối, hiển thị).
- Trạng thái phân bổ: lưu lần phân bổ (thời điểm, người, phương pháp, fingerprint đầu vào: chi phí, phương pháp, lô, SL nhập, khối lượng, tỷ giá) → hiện Chưa phân bổ / Đã phân bổ / Cần phân bổ lại; không tự tính lại, không hồi tố snapshot đơn đã xuất.
- Gắn lô chưa có chuyến vào chuyến (thao tác rõ, quyền `shipment:manage`, audit); lô thuộc chuyến khác → chặn.
- `inventory/documents.ts`: khi phiếu nhập dùng lại lô cũ mà `shipmentId` khác → chặn (hiện đang bỏ qua; D0 đã có mục cảnh báo `lotShipmentMismatch`).
- D8.3 (tách mã đợt nhập khỏi số lô NSX) **chỉ làm nếu** báo cáo D0 trên production cho thấy cần — hỏi chủ shop trước.

## 8. D9 — Nghiệm thu toàn tuyến & bàn giao
- Chạy `npm test` đầy đủ + CI xanh; UAT theo bảng T01–T21 (mục 15 kế hoạch tổng) trên DB thử.
- Cập nhật `CLAUDE.md` (mục Kiến trúc: readiness, picking, data-health, bulk, analytics), `PLAN.md`/`DEPLOY.md` các điểm đổi, runbook cập nhật server (backup → migrate deploy các migration mới → kiểm cron/log → tải mốc JSON D0 lưu lại).
- Sau cập nhật production: tải mốc D0 (`/admin/reports/data-health`, nút Tải mốc JSON) làm baseline; so lại sau 2–4 tuần.

## 9. Việc còn dở từ các đợt trước (làm xen khi phù hợp)
- DT.3 mã vận đơn: cho sửa sau bàn giao (action + audit trên `Delivery`); nhập hàng loạt từ file VTP — **cần file mẫu VTP thật** [CẦN XÁC MINH].
- DT.4 đối soát COD từ file VTP (xem trước → xác nhận, mỗi dòng qua `remitCod`) — cần file mẫu.
- DT.5 nút "Tính giá SKU vừa nhập" sau ghi sổ phiếu RECEIVE: thêm phạm vi `variantIds` vào `previewSchema` (`pricing/runs.ts`), link từ trang phiếu.
- DT.6 danh sách đơn: lọc ngày + kho, phân trang (đang giới hạn 200 ở `orders/admin-queries.ts`), ô dashboard "đang giao quá N ngày" (`reports/queries.ts workQueue`).
- D3: hiện phiếu soạn (lô đã chốt, thời điểm) trên trang chi tiết đơn; xuất nội bộ tránh lô đang nằm trên phiếu chưa bàn giao (hoặc cảnh báo).
- D2: cảnh báo "lãi sau hoa hồng thấp / giá biến động lớn".
- Đã biết: Prisma 7 đọc quan hệ lồng nhau trong transaction tạo cảnh báo pg "client.query() already executing" (vô hại hiện tại) — không cần sửa, theo dõi khi nâng pg@9.

## Thứ tự đề xuất
1. Kiểm/sửa CI `2761bf1` → 2. D4 (D4.2 → D4.3 → D4.1 sau khi duyệt công thức → D4.4 sau khi duyệt chính sách) → 3. D5 → 4. DT.5, DT.6, D3 hiển thị → 5. D7 → 6. D8 → 7. D6 (khi có số liệu D5) → 8. D9. Mỗi đợt: test + commit + cập nhật mục "Trạng thái" trong kế hoạch tổng + dừng chờ duyệt.
