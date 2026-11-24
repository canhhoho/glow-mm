# Kết nối trợ lý AI (OpenClaw) với web — thiết kế

**Trạng thái: ĐÃ DUYỆT 23/11/2026** (5 quyết định ở §12; phase **P25** trong PLAN.md). **GĐ 3 đã code xong 24/11/2026** trên `dev` (bước 2–3 ở §11, chưa merge `main`); tiếp theo là bước 4 (chủ shop). GĐ 5 chưa làm.
Người viết thiết kế: Claude Cowork. Người làm code: Claude Code, theo CLAUDE.md. Mục ghi **[CẦN XÁC MINH]** phải kiểm khi nối thật.

## 1. Mục tiêu và phạm vi

Agent quản trị **tc-admin** (hiện là agent `tc-cosmetics` trong OpenClaw, chạy trên máy chủ shop) đọc dữ liệu thật của web và tạo **bản nháp** để chủ shop duyệt trong `/admin`.

| Trong phạm vi | Ngoài phạm vi (tài liệu riêng sau) |
|---|---|
| GĐ 3 — đọc: sản phẩm, giá bán, giá mua, tồn kho, gợi ý đặt hàng, **xem trước file nhập Excel/CSV** | Agent tư vấn khách (tc-sales), chat trên web |
| GĐ 5 — ghi nháp: xác nhận file nhập (tuỳ quyết định §12), phiếu NHẬP nháp, gửi SP chờ duyệt | Tạo đơn, chuyển trạng thái đơn, COD |
| | Đăng bài mạng xã hội, Messenger/Meta API |

## 2. Hiện trạng

- **Agent:** OpenClaw 2026.11.6 trên máy Windows của chủ shop, model `google/gemini-3.5-flash-lite`. Workspace `D:\1. CONG VIEC\4. IT\8. openclaw\tc-cosmetics`: quy tắc (`AGENTS.md`), danh mục 74 SKU chép tay (`PRODUCTS.md`, bản 23/11/2026), quy trình soạn CSV nhập hàng (`NHAP-HANG.md`).
- **Phương án tạm đang chạy:** agent soạn CSV đúng tiêu đề mẫu "Nhập Excel" → chủ shop tự tải lên `/admin/products/import`. Điểm yếu: agent đối chiếu SKU bằng `PRODUCTS.md` (cũ dần), không biết kho/giá thật; lỗi lệch kho làm giá VND bị hiểu là MMK mà web không báo (dòng có SKU, bỏ trống Kho bán → giá mua ghi theo tiền của kho hiện tại của SP).
- **Web đã có đủ hàm domain** (xem `docs/ban-do-nghiep-vu-admin.md`): `previewCatalogImport` / `commitCatalogImport`, `saveReceiveDrafts` (phiếu nháp, tách theo kho), `submitProducts`, `stockSummary`, `availableToSell`, `loadVariantStock`, `listProductsPage`, `productReadinessView`. **Chưa có** cổng cho máy gọi vào: mọi action dựa trên phiên đăng nhập (`requirePermission` → cookie Better Auth).

## 3. Nguyên tắc

1. **Không tạo đường ghi mới.** Mỗi công cụ của agent gọi đúng một hàm domain đã có (theo bản đồ nghiệp vụ). Không chép schema/công thức.
2. **Agent không bao giờ:** ghi sổ phiếu kho (`postDocument`), duyệt SP (`reviewProducts`/`approveSubmitted`/`saveAndApprove`), đăng/ẩn SP (`setProductsPublished`), đặt giá bán (`applyManualPricing`, `writeLivePrice`), xoá/ngừng KD, tạo hay chuyển trạng thái đơn, sửa tài khoản/cài đặt.
3. **Mọi thao tác ghi** đi qua hàm domain với `userId` của một tài khoản nhân viên riêng ("Trợ lý AI") → AuditLog sẵn có ghi đúng người; cộng thêm một dòng audit `agent.call` ở lớp API (§8).
4. **Kiểm quyền phía server ở lớp API** (hàm domain không tự kiểm quyền — hiện action làm việc đó). Token → tập *scope*; công cụ nào thiếu scope → 403.
5. Validate Zod mọi input; tồn kho không cache; tiền là số nguyên; thời gian UTC.
6. Tắt được ngay: thiếu biến môi trường token → toàn bộ cổng trả 404.

## 4. Kiến trúc (Q1 đã chốt: A)

| | A. MCP trong web (khuyến nghị) | B. REST trong web + MCP cục bộ |
|---|---|---|
| Mô tả | Route `POST /api/agent/mcp` nói giao thức MCP (Streamable HTTP, JSON-RPC). OpenClaw khai báo đây là một MCP server từ xa, gửi header `Authorization: Bearer <token>` | Web có các route REST `/api/agent/<tool>`; một script MCP nhỏ chạy trên máy chủ shop, chuyển lời gọi MCP sang REST |
| Ưu | Một nơi định nghĩa công cụ (cạnh hàm domain), một lần deploy, test bằng Vitest | REST dễ thử bằng curl; không phụ thuộc OpenClaw hỗ trợ MCP từ xa |
| Nhược | Cần thư viện MCP hoặc tự viết JSON-RPC tối giản; **[CẦN XÁC MINH]** OpenClaw 2026.11 hỗ trợ MCP server qua HTTP có header tuỳ chỉnh và khoá cấu hình tương ứng | Thêm một tiến trình phải cài/giữ chạy trên máy Windows; hai nơi định nghĩa công cụ |

Khuyến nghị **A**. Nếu bước xác minh cho thấy OpenClaw không gọi được MCP HTTP có header → chuyển **B** (lớp REST vẫn dùng nguyên §6–§8).

**Kết quả xác minh bước 1 (23/11/2026, theo tài liệu OpenClaw — chưa chạy thử thật):**
- OpenClaw khai báo MCP server trong `mcp.servers.<tên>` với `url`, `transport: "streamable-http"`, `headers`, `connectionTimeoutMs`, `requestTimeoutMs`, `toolFilter { include, exclude }`. → **Phương án A khả thi.**
- Token đặt bằng tham chiếu biến môi trường, không ghi thẳng vào file cấu hình: `"headers": { "Authorization": "Bearer ${TANDC_AGENT_TOKEN}" }`. Biến này phải có trong môi trường của tiến trình gateway trên máy Windows (gateway chạy qua `~/.openclaw/gateway.cmd` / Windows Task "OpenClaw Gateway"). `openclaw mcp doctor` cảnh báo nếu header chứa token viết thẳng.
- Dự kiến cấu hình phía OpenClaw:

```json
"mcp": { "servers": { "tandc": {
  "url": "https://tandcstore.com/api/agent/mcp",
  "transport": "streamable-http",
  "headers": { "Authorization": "Bearer ${TANDC_AGENT_TOKEN}" },
  "requestTimeoutMs": 60000
} } }
```

- **[CẦN XÁC MINH khi nối thật]:** (1) `mcp.servers` áp dụng cho mọi agent — chưa thấy cách giới hạn server cho riêng một agent. Agent `main` (Kirin, đang gắn Telegram) có thể thấy công cụ `tandc`; phải chặn bằng tool policy của agent `main` và chạy thử. (2) Tên công cụ MCP trong `tools.allow` (dạng `<server>__<tool>` mới được nêu cho runtime claude-cli). Cho tới khi xác minh xong, token web chỉ mang scope đọc (§5).
Đã làm: lớp JSON-RPC tự viết (`initialize`, `ping`, `tools/list`, `tools/call`; thông báo → 202), **không thêm dependency**. Mỗi yêu cầu trả một JSON (`application/json`), không mở luồng SSE — Streamable HTTP cho phép. Không hỗ trợ gửi theo lô (batch). `GET` → 405.

Hạ tầng: web chạy trên server `10.201.42.65` sau Nginx dùng chung; agent gọi qua `https://tandcstore.com/api/agent/...`. Route nằm dưới `/api` nên `proxy.ts` hiện bỏ qua (matcher loại `api`) — đúng ý, kiểm quyền nằm trong route. **[CẦN XÁC MINH]** Nginx không chặn/giới hạn body cho đường dẫn này (file nhập tối đa 2 MB).

## 5. Xác thực và phân quyền

**GĐ 3–5 (đề xuất, quyết định Q3):** theo mẫu `CRON_SECRET`.

| Biến môi trường (thêm vào `src/lib/env.ts` + `.env.example`) | Ý nghĩa |
|---|---|
| `AGENT_ADMIN_TOKEN` | Bí mật ≥ 32 ký tự, sinh bằng `openssl rand -base64 32`; chặn giá trị mẫu ở production như `CRON_SECRET` |
| `AGENT_ADMIN_USER_ID` | Id tài khoản nhân viên "Trợ lý AI" dùng làm `userId` cho hàm domain và audit |
| `AGENT_ADMIN_SCOPES` | Danh sách scope, mặc định chỉ đọc: `catalog:read,stock:read,pricing:read,import:preview` |

- So token bằng `timingSafeEqual` (dùng lại cách của `src/server/cron/auth.ts`).
- Tài khoản "Trợ lý AI": tạo ở `/admin/users`, **khoá đăng nhập** (không dùng để vào /admin) — lớp API chỉ cần `userId` hợp lệ. Vai trò để hiển thị: quyết định Q4. Lớp API **không** dựa vào `can(role, …)` mà dựa vào scope.
- Sau này (nhiều agent, xoay vòng token trong admin): bảng `AgentToken { id, name, tokenHash, scopes, userId, active, lastUsedAt }` + trang quản lý — ngoài phạm vi tài liệu này.

| Scope | Công cụ | Giai đoạn |
|---|---|---|
| `catalog:read` | `catalog_search`, `catalog_get` | 3 |
| `stock:read` | `stock_summary`, `stock_available`, `reorder_suggestions` | 3 |
| `pricing:read` | `pricing_get` (giá bán + giá mua + mốc giá mua) | 3 |
| `import:preview` | `import_preview` | 3 |
| `import:commit` | `import_commit` | 5 (tuỳ Q2) |
| `receive:draft` | `receive_draft` | 5 |
| `catalog:submit` | `catalog_submit` | 5 |

## 6. Công cụ

Đầu ra gọn, chỉ trường agent cần (JSON trong `content[0].text` và `structuredContent`). SKU không phân biệt hoa thường. `catalog_get` trả tên/mô tả theo `locale` (`vi`/`en`/`my`, mặc định `vi`, thiếu thì lấy `en`) kèm `names` mọi ngôn ngữ; `catalog_search` trả tên như danh sách SP admin (ưu tiên `en`). Lỗi trả thông điệp tiếng Việt từ Zod/hàm domain.

### GĐ 3 — chỉ đọc

| Công cụ | Input | Output chính | Hàm domain |
|---|---|---|---|
| `catalog_search` | `q?`, `brand?`, `category?`, `warehouse?` (mã kho), `tab?` (theo `LIST_TABS`), `limit ≤ 50` | SKU, tên, phân loại, thương hiệu, danh mục, mã kho bán, trạng thái duyệt, đang bán/ẩn/ngừng KD, giá bán MMK | `listProductsPage` |
| `catalog_get` | `sku` | Như trên + mô tả my/en, cách dùng, thành phần, khối lượng, các phân loại cùng SP, vấn đề còn thiếu để duyệt | truy vấn SP + `productReadinessView` |
| `stock_summary` | `q?`, `page?` | Theo SKU (25 dòng/trang, như bảng "Theo sản phẩm" ở Tồn kho): tồn theo mã kho, tester, chờ kiểm tra, đang giữ, còn bán | `stockByVariant` (`stockSummary` chỉ có ô tổng, không theo SKU) |
| `stock_available` | `skus[] ≤ 100` | Khả dụng để bán theo SKU (tính cả combo) + SL dự kiến nhập; SKU không có → `missing` | `availableToSell` |
| `reorder_suggestions` | — | Gợi ý đặt hàng: SKU, tồn, nhu cầu, số gợi ý + ngưỡng Cài đặt | `computeAlerts` (đúng hàm của `/admin/alerts`) |
| `pricing_get` | `skus[] ≤ 100` | Giá bán MMK, giá mua hiện tại (VND hoặc MMK theo kho), ngày đổi giá mua, cờ giá cũ (`PRICE_STALE`) | Truy vấn `Variant.purchasePrice*` + `loadReadiness` (cờ `PRICE_STALE`) |
| `import_preview` | `csv` (nội dung file, tiêu đề theo mẫu — nhận nhãn vi/en/my như khi tải file) | Đúng bản xem trước của `/admin/products/import`: số SP tạo/sửa, từng dòng, **tiền tệ giá mua theo kho**, lỗi/cảnh báo; kèm `previewHash` | `sheetRowsToCsv(parseCsv(csv))` → `previewCatalogImport` (chỉ đọc) |

`import_preview` là điểm lợi lớn nhất của GĐ 3: agent kiểm file **bằng chính quy tắc của web** trước khi chủ shop tải lên (bắt lỗi kho/tiền tệ, danh mục chưa có, SKU sai) — thay phần đối chiếu dựa vào `PRODUCTS.md`.

### GĐ 5 — ghi nháp

| Công cụ | Input | Hàm domain | Ghi chú |
|---|---|---|---|
| `import_commit` | `csv`, `previewHash` | `commitCatalogImport(input, userId, { submit: false })` | Chỉ chạy khi `previewHash` khớp nội dung hiện tại (chống xác nhận file khác bản đã xem). **Lưu ý:** hàm này ghi thẳng giá mua hiện tại và SL dự kiến nhập (không qua duyệt) và tạo/sửa SP nháp; SP đã duyệt thì vào bản chờ duyệt. Web đã chặn nhập lại đúng một file. Có làm công cụ này hay không: Q2 |
| `receive_draft` | `lines[] { sku, qty, unitCost?, toCode? }`, `idempotencyKey` | `saveReceiveDrafts` | Chỉ tạo phiếu NHẬP **nháp** (tự tách theo kho); không bao giờ gọi `postDocument`. Trả mã phiếu + link `/admin/inventory/documents/<id>` để chủ shop kiểm và ghi sổ |
| `catalog_submit` | `skus[]` | `submitProducts` | Gửi chờ duyệt; duyệt vẫn là ADMIN trong admin |

Không làm công cụ riêng tạo SP (`createProduct`): tạo SP đi qua file nhập để chỉ có một đường.

## 7. Giới hạn và lỗi

- Rate limit theo token bằng `hitRateLimit` (60 yêu cầu/phút; `import_*` thêm giới hạn 10 lần/phút). Khoá là hash token, không lưu token.
- Payload tối đa 2 MB (bằng `MAX_CATALOG_FILE_BYTES`); `csv` tối đa 5000 dòng như bộ đọc hiện có.
- Mã lỗi (đã làm): 404 cổng tắt · 401 sai/thiếu token · 405 không phải POST · 429 quá giới hạn · 503 `AGENT_ADMIN_USER_ID` không phải tài khoản nhân viên · 403 thiếu scope (kèm lỗi JSON-RPC) · 500 lỗi khác (log một dòng JSON như route cron).
- Theo quy ước MCP, **lỗi dữ liệu** (input sai, SKU/thương hiệu/kho không có, file thiếu tiêu đề) trả HTTP 200 với `isError: true` và thông điệp tiếng Việt — để agent đọc và tự sửa (thay cho 422 dự kiến). Công cụ không tồn tại → lỗi JSON-RPC `-32602` (HTTP 200), không phải 404.

## 8. Lưu vết

- Hàm domain tự ghi AuditLog như khi nhân viên thao tác (userId = "Trợ lý AI").
- Lớp API ghi thêm `writeAudit` action `agent.call`: tên công cụ, scope, kết quả (ok/lỗi), số dòng ảnh hưởng, hash của `csv` — **không** ghi nguyên CSV, không ghi token.
- Admin xem được trong nhật ký hiện có (lọc theo người "Trợ lý AI").

## 9. Bảo mật

- Token chỉ nằm trong biến môi trường: `AGENT_ADMIN_TOKEN` trên server web, `TANDC_AGENT_TOKEN` của tiến trình gateway OpenClaw trên máy chủ shop; **không** ghi thẳng vào `openclaw.json`, không ghi vào file workspace của agent, không commit.
- Chỉ HTTPS. Xoay token: đổi biến môi trường + cấu hình OpenClaw; lộ token → xoá biến (cổng về 404) rồi cấp lại.
- GĐ 3–5 không có công cụ trả dữ liệu khách hàng (tên, SĐT, địa chỉ).
- Kết quả công cụ là dữ liệu: nội dung mô tả SP không được coi là chỉ dẫn cho agent (đã có quy tắc trong `AGENTS.md`).

## 10. Kiểm thử (theo CLAUDE.md)

| Mức | Nội dung |
|---|---|
| Unit | Đọc env/scope; so token; map công cụ → scope; parse input từng công cụ |
| Integration (`glow_test`) | Mỗi công cụ GĐ 3 trả đúng dữ liệu seed; 401/403/404/429; `import_preview` cho file mẫu khớp kết quả xem trước của trang admin; `import_preview` không ghi gì vào DB |
| Integration GĐ 5 | `receive_draft` tạo phiếu `DRAFT`, `StockLedger`/`StockBalance` không đổi; trùng `idempotencyKey` trả lại phiếu cũ; `import_commit` sai `previewHash` bị chặn; audit `agent.call` được ghi |
| E2E | GĐ 3: không bắt buộc (không có UI). GĐ 5: chạm kho/SP → **full E2E** trước khi merge `main` |

## 11. Trình tự triển khai

| Bước | Việc | Ai | Xong khi |
|---|---|---|---|
| 0 | Chủ shop trả lời Q1–Q5 (§12) | Chủ shop | ✅ 23/11/2026 |
| 1 | Xác minh OpenClaw: gọi MCP HTTP có header được không, khoá cấu hình; chốt A hay B | Cowork | ✅ Theo tài liệu: được (xem §4). Còn 2 điểm kiểm khi nối thật ở bước 5 |
| 2 | Lớp xác thực + scope + rate limit + audit, cổng tắt khi thiếu env; công cụ `catalog_search`, `catalog_get` | Claude Code (nhánh `dev`) | ✅ 24/11/2026 |
| 3 | Các công cụ đọc còn lại + `import_preview` | Claude Code | ✅ 24/11/2026 — `npm run check` + integration `agent-mcp.test.ts` xanh |
| 4 | Tạo tài khoản "Trợ lý AI", đặt biến môi trường trên server, merge `main` (deploy) — chi tiết §13 | Chủ shop | `curl` có token trả dữ liệu, không token → 401 |
| 5 | Nối OpenClaw (`mcp.servers.tandc`, token qua biến môi trường `TANDC_AGENT_TOKEN` của gateway); chặn công cụ `tandc` ở agent `main` và kiểm thử; sửa `AGENTS.md`/`NHAP-HANG.md`: tra cứu bằng công cụ, kiểm CSV bằng `import_preview`; ngừng dùng `PRODUCTS.md` | Cowork | Bộ câu hỏi kiểm tra nhóm B, C, H đạt |
| 6 | GĐ 5: `receive_draft`, `catalog_submit` + full E2E (không làm `import_commit` — Q2) | Claude Code | Full E2E xanh, báo cáo 4 dòng |
| 7 | Bật scope ghi cho token, cập nhật quy trình agent, chạy thử một lô hàng thật | Chủ shop + Cowork | Lô thật nhập thành công, phiếu do chủ shop ghi sổ |

Ghi chú triển khai và cách thử: §13.

## 12. Quyết định đã chốt (23/11/2026)

| # | Câu hỏi | Quyết định |
|---|---|---|
| Q1 | Cách kết nối | **A** — MCP trong web, `POST /api/agent/mcp` (Streamable HTTP) |
| Q2 | Agent tự xác nhận file nhập ở GĐ 5? | **Không** trong thời gian đầu: chỉ `import_preview`, chủ shop tự tải file lên. **Không làm `import_commit`** cho tới khi có quyết định mới (sau khi có model mạnh hơn và agent chạy ổn) |
| Q3 | Lưu token | **Biến môi trường** (`AGENT_ADMIN_TOKEN`, `AGENT_ADMIN_USER_ID`, `AGENT_ADMIN_SCOPES`), mẫu như `CRON_SECRET` |
| Q4 | Vai trò tài khoản "Trợ lý AI" | **`WAREHOUSE_MANAGER`, khoá đăng nhập**; quyền thật theo scope của token |
| Q5 | Agent quản trị xem giá mua? | **Có** (`pricing_get` trả giá mua); agent tư vấn khách sau này thì không |

## 13. Đã triển khai GĐ 3 (24/11/2026)

**Code:** `src/server/agent/config.ts` (env, scope, so token) · `tools.ts` (7 công cụ đọc) · `mcp.ts` (JSON-RPC, kiểm quyền, rate limit, audit) · route `src/app/api/agent/mcp/route.ts` · biến `AGENT_ADMIN_*` trong `src/lib/env.ts` + `.env.example` (để trống = tắt; token mẫu `change-me…` bị chặn ở production). Test: `tests/unit/agent-config.test.ts`, `tests/integration/agent-mcp.test.ts`.

**Bước 4 — chủ shop làm (Claude không deploy):**
1. `/admin/users` → tạo nhân viên "Trợ lý AI", vai trò **Quản lý kho**, rồi **khoá** tài khoản. Lấy id từ đường dẫn `/admin/users/<id>`.
2. Trên server, thêm vào `/var/www/tandc/.env.prod`: `AGENT_ADMIN_TOKEN` (`openssl rand -hex 32` — chỉ chữ/số như CRON_SECRET), `AGENT_ADMIN_USER_ID=<id>`; không đặt `AGENT_ADMIN_SCOPES` (= chỉ đọc). `docker-compose.prod.yml` nạp cả file này vào container qua `env_file` → **không cần sửa compose**. Đặt trước khi merge `main`, lần deploy sẽ tạo lại container với biến mới.
3. Thử: `curl -s https://tandcstore.com/api/agent/mcp -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'` → danh sách 7 công cụ; bỏ header → 401.
4. Nginx theo runbook (`docs/lenh-trien-khai-tandcstore.md` bước 8c) đã có `client_max_body_size 10M`, `proxy_read_timeout 120s` và `/api/agent/` đi qua `location /` → **không cần sửa**. Chỉ xác nhận cấu hình thật khớp runbook: `nginx -T 2>/dev/null | grep -E "client_max_body_size|proxy_read_timeout"`.

**Chưa chạy:** gọi thật từ OpenClaw (bước 5), build/E2E production cho route này (GĐ 3 không bắt buộc E2E — §10).
