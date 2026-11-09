# Kế hoạch quy trình sản phẩm 5 bước

> Ngày: 2026-11-09 · Nhánh `dev` · Trạng thái: **chờ duyệt, chưa sửa code**.
> Quy trình đích: **1. Tạo sản phẩm → 2. Nhập kho + giá vốn → 3. Thiết lập giá bán → 4. Duyệt sản phẩm → 5. Đăng bán.**

## 1. Đối chiếu hiện trạng

| Bước | Hiện có trong web | Khoảng trống |
|---|---|---|
| 1. Tạo SP | Form `/admin/products/new`, sao chép SP, nhập Excel (`catalog/catalog-import.ts`). SP mới luôn **ẩn** (`published=false`). Quyền `catalog:manage` (ADMIN). | Form, Excel và sao chép **bắt nhập/chép giá bán ngay khi tạo** → bước 3 bị làm trước bước 2. |
| 2. Nhập kho + giá vốn | Phiếu RECEIVE nháp → ghi sổ (`inventory/documents.ts`); giá vốn theo lô: MMK = thật ngay; VND = tạm tính (ship/kg) → thật khi phân bổ chuyến hàng (`shipments.ts`). Quyền `stock:receive` (ADMIN + Quản lý kho). | Nút "Nhập hàng" ở trang SP mở phiếu trống, không điền sẵn SP. |
| 3. Giá bán | Bảng tính giá: xem trước → chọn dòng → áp dụng (`pricing/runs.ts`), nguồn = dòng nhập đã ghi sổ mới nhất; nút "Tính giá SKU vừa nhập" trên phiếu. Quyền `pricing:manage` (ADMIN). | Giá còn gõ tay ở form/Excel bất kỳ lúc nào; **không báo giá cũ hơn phiếu nhập mới**; lỗi F4: bảng tính giá áp được giá 0. |
| 4. Duyệt | **Không có.** Chỉ có checklist tự động "Kiểm tra trước khi mở bán" (`catalog/readiness-rules.ts`) chạy lúc bật hiển thị. | Thiếu bước duyệt có người chịu trách nhiệm, không lưu vết. |
| 5. Đăng bán | Tick "Hiển thị trên web" hoặc nút hàng loạt; chặn khi giá ≤ 0 / không biến thể / kho sai / thiếu khối lượng (kho VN). Hết hàng chỉ cảnh báo; trang SP hiện "hết hàng", không mua được. | Không yêu cầu đã duyệt; **chưa có đặt trước (preorder)** cho SP hết hàng. |

## 2. Quyết định đã chốt (2026-11-09)

| # | Câu hỏi | Quyết định |
|---|---|---|
| Q1 | "Duyệt" là gì | **Nút Duyệt có lưu vết**: checklist tự động + người có quyền bấm Duyệt; lưu ai/khi nào. Đổi giá hoặc nội dung sau đó → tự về "Chờ duyệt". |
| Q2 | Thứ tự giá | **Giá chỉ đặt ở bước 3**: tạo SP không nhập giá; bước 3 = bảng tính giá từ phiếu nhập đã ghi sổ, hoặc sửa tay tại bước 3 có ghi lý do. |
| Q3 | Điều kiện đăng bán | Hết hàng **vẫn đăng bán, ở chế độ đặt trước (preorder)**. Giá vốn thiếu/tạm giữ là cảnh báo. |
| Q4 | Phân quyền | Giữ nguyên: Quản lý kho làm bước 2; Admin làm bước 1, 3, 4, 5. |
| P1 | Bật preorder | **Riêng từng SP**: ô "Cho đặt trước khi hết hàng" + ngày dự kiến có hàng. SP không bật → hết hàng như hiện tại. |
| P2 | Thanh toán preorder | **Như đơn thường** (COD/chuyển khoản), đơn đánh dấu "Đặt trước", chờ hàng về mới giao. |
| P3 | Giới hạn | **Giới hạn theo SP** (số tối đa nhận đặt trước); hết hạn mức → báo hết. |
| P4 | Hàng về | **Danh sách chờ, admin xác nhận**: liệt kê đơn đặt trước theo thứ tự đặt, báo đủ/thiếu; admin bấm chuyển sang xử lý như đơn thường. |

**Giả định mặc định (đổi được khi duyệt kế hoạch):**
- SP đang hiển thị mà bị "về Chờ duyệt" (vì đổi giá/nội dung) **không tự ẩn** (giữ nguyên tắc D2 "hệ thống không tự ẩn") — chỉ gắn nhãn "Cần duyệt lại" ở danh sách + dashboard; SP đang ẩn thì phải duyệt lại mới bật được.
- Giới hạn đặt trước đặt **theo từng biến thể** (tồn kho tính theo biến thể); SP một biến thể thì nhìn như theo SP.
- Đơn có **bất kỳ dòng đặt trước** nào → cả đơn là đơn đặt trước (chờ đủ hàng mới giao, không tách đơn).

## 3. Kế hoạch theo giai đoạn

Mỗi bước = một commit trên `dev`; **dừng chờ duyệt sau mỗi giai đoạn**. Chuỗi giao diện mới → `messages/admin.{vi,en,my}.json`, storefront `messages/store.{my,en,vi}.json` + `review-my.json`.

### QT1 — Sắp đúng thứ tự bước 1→3 (không đổi DB, rủi ro thấp–vừa)

1. **Sửa lỗi F4**: `applyRun` (`pricing/runs.ts`) và `computeLines` bỏ qua dòng có giá mới ≤ 0 (lý do `PRICE_ZERO`) — bảng tính giá không bao giờ áp giá 0. Test integration.
2. **Bỏ giá khỏi bước 1**:
   - Form SP (`product-form.tsx`): SP **mới** không có ô giá (biến thể tạo với giá 0); SP đã có → ô giá chỉ đọc + link "Đặt giá ở bước 3". `saveProduct` giữ nguyên giá cũ của biến thể đã có, biến thể mới = 0.
   - Sao chép SP (`product-copy.ts`): không chép giá (đặt 0).
   - Excel (`catalog-import.ts`): SKU **mới** không bắt cột giá (có thì bỏ qua + cảnh báo trong xem trước); SKU **đã có** cập nhật giá vẫn được, ghi `PriceHistory.reason = "import"` (coi là sửa tay hàng loạt ở bước 3).
3. **Khối "Giá bán" (bước 3) trên trang SP** (`products/[id]`): mỗi biến thể hiện giá hiện tại, nguồn (bảng tính giá #… / sửa tay / Excel), giá vốn lô mới nhất + trạng thái (thật/tạm/thiếu); nút **"Tính giá SP này"** (tạo bảng tính giá chỉ các biến thể của SP, dùng `variantIds` đã có) và **"Sửa tay"** (bắt nhập lý do, ghi `PriceHistory.reason = "manual: <lý do>"`). Action mới trong `catalog/actions.ts`, quyền `pricing:manage`.
4. **Cảnh báo giá cũ**: quy tắc readiness mới `PRICE_STALE` (cảnh báo) khi có phiếu RECEIVE ghi sổ sau lần đổi giá gần nhất của biến thể.
5. **Thanh 5 bước** thay cho dãy "Các bước" hiện tại ở trang SP: mỗi bước có trạng thái (xong / cần làm / cảnh báo) + nút đi tới đúng chỗ. Bước 2 mở phiếu nhập **điền sẵn SP** (`/admin/inventory/documents/new?type=RECEIVE&product=<id>` — thêm hỗ trợ tham số này cho `receive-bulk-form`). Danh sách SP: thêm cột/bộ lọc **"Bước"** (1–5). Logic tính bước là hàm thuần trong `catalog/readiness-rules.ts` (unit test).

**Test:** `npm run check`; integration pricing/catalog (`tests/integration/*pricing*`, `*catalog*`); E2E `catalog-import`, `product-copy`, `product-images`, `pricing-settings`, `admin-content` + spec mới `product-flow.spec.ts` (tạo SP → nhập kho → tính giá → thấy bước 4 chờ). Một số E2E hiện gõ giá ở form SP sẽ phải sửa theo luồng mới.

### QT2 — Bước 4 Duyệt (migration nhỏ, rủi ro vừa)

1. **Migration**: `Product.approvedAt DateTime?`, `approvedById String?`, `approvedHash String?` (dấu vân tay nội dung + giá đã duyệt). Quyền mới `catalog:approve` (ADMIN) trong `roles.ts`.
2. **Duyệt** (`catalog/approval.ts`, hàm thuần tính hash từ: tên/mô tả my+en, danh mục, thương hiệu, biến thể [SKU, nhãn, giá, active, khối lượng], ảnh): nút "Duyệt" chỉ bật khi checklist không còn lỗi; ghi audit `product.approve`.
3. **Tự huỷ duyệt**: `saveProduct`, sửa giá tay, `applyRun`, đổi ảnh → so hash; khác → trạng thái "Chờ duyệt"/"Cần duyệt lại" (không xoá lịch sử duyệt, audit `product.approval_reset`).
4. **Chặn đăng bán khi chưa duyệt**: lỗi readiness `NOT_APPROVED` khi bật hiển thị (đơn lẻ + hàng loạt). SP đang hiển thị: chỉ cảnh báo (giả định mặc định ở §2).
5. Danh sách SP: bộ lọc "Chờ duyệt", "Cần duyệt lại"; dashboard thêm ô "SP chờ duyệt".

**Test:** unit hash + bước; integration duyệt/huỷ duyệt/chặn publish; E2E sửa các spec bật hiển thị (phải duyệt trước) + mở rộng `product-flow.spec.ts` đến bước 5. **Migration** → chạy integration + E2E trên DB tạm; cần backup khi cập nhật server.

### QT3 — Đặt trước khi hết hàng (migration + máy trạng thái đơn, **rủi ro cao**)

1. **Migration**:
   - `Product.preorderEnabled Boolean @default(false)`, `Product.preorderEta DateTime?` (ngày dự kiến có hàng).
   - `Variant.preorderLimit Int?` (tối đa số cái nhận đặt trước; trống = không nhận).
   - `OrderStatus` thêm `AWAITING_STOCK` ("Chờ hàng về"); `Order.preorder Boolean @default(false)`.
2. **Máy trạng thái** (`orders/state-machine.ts`, nơi duy nhất): đơn đặt trước tạo ở `AWAITING_STOCK`, **không giữ hàng**; chuyển `stockArrived: AWAITING_STOCK → PENDING` (quyền `orders:confirm-payment`) chạy `reserveForOrder` (kiểm đủ hàng, khoá dòng như đơn thường) rồi đi tiếp luồng thường; `cancel` cho phép từ `AWAITING_STOCK`. Cron tự huỷ COD/chuyển khoản **không** áp dụng cho `AWAITING_STOCK`.
3. **Tạo đơn** (`orders/orders.ts`): dòng có biến thể hết hàng + SP bật preorder → kiểm hạn mức (`preorderLimit` − tổng SL của đơn `AWAITING_STOCK` hiện có, khoá dòng Variant), đánh dấu đơn `preorder`. Combo: đặt trước chỉ khi mọi thành phần thuộc SP bật preorder (hoặc chặn combo — chốt khi làm). Giá bán chốt lúc đặt như đơn thường.
4. **Storefront**: thẻ + trang SP hiện nhãn "Đặt trước · dự kiến {ngày}" và nút "Đặt trước" thay "Hết hàng" khi còn hạn mức; giỏ/checkout ghi rõ đơn sẽ giao khi hàng về; trang theo dõi đơn hiện trạng thái "Chờ hàng về". Chuỗi `my/en/vi`.
5. **Admin**: trang **"Đơn đặt trước"** (trong nhóm Đơn hàng) liệt kê đơn `AWAITING_STOCK` theo thứ tự đặt, mỗi biến thể: cần / đang có / đủ-thiếu (FIFO); nút "Chuyển xử lý" từng đơn (hoặc hàng loạt các đơn đủ hàng). Sau khi ghi sổ phiếu nhập: nhắc "Có N đơn đặt trước chờ hàng này". Form SP: ô bật preorder + ngày dự kiến + hạn mức theo biến thể. Readiness: SP hết hàng mà không bật preorder → cảnh báo "Hết hàng, chưa bật đặt trước".
6. CTV: hoa hồng tính như đơn thường (chỉ khi đơn hoàn tất).

**Test:** unit state-machine (chuyển mới + cấm cũ); integration tạo đơn preorder (hạn mức, đồng thời 2 đơn tranh hạn mức cuối, combo), `stockArrived` thiếu hàng bị chặn, cron không huỷ; E2E mới `preorder.spec.ts` (khách đặt trước → nhập kho → admin chuyển xử lý → giao) + **full E2E** (đụng checkout, state-machine, kho — vùng rủi ro cao theo CLAUDE.md).

## 4. Rủi ro chính

| Rủi ro | Giảm thiểu |
|---|---|
| E2E/seed hiện tạo SP có giá ngay ở form → hỏng khi bỏ ô giá (QT1) | Sửa helper tạo SP trong test dùng luồng mới; seed (`prisma/seed.ts`) vẫn ghi giá trực tiếp (dữ liệu mẫu, không qua form). |
| SP đang bán trên production chưa có `approvedAt` (QT2) | Migration đánh dấu **mọi SP đang hiển thị = đã duyệt** (approvedAt = thời điểm migrate, người duyệt = hệ thống) để không chặn sửa/đăng lại. |
| Đặt trước làm sai tồn/giữ hàng (QT3) | Đơn `AWAITING_STOCK` không tạo `Reservation`; chỉ giữ hàng qua đúng `reserveForOrder` khi chuyển `PENDING`; khoá dòng Variant khi kiểm hạn mức; full E2E + integration đồng thời. |
| Khách chờ lâu, đơn treo | Hiện ngày dự kiến; admin huỷ được đơn `AWAITING_STOCK`; dashboard đếm đơn chờ quá ngày dự kiến. |
| Hai migration cần cập nhật server | Ghi chú backup trong ghi chú phát hành; không gộp với refactor UI chưa lên production. |

## 5. Ước lượng

| Giai đoạn | Migration | File (ước) | Test chính |
|---|---|---|---|
| QT1 | Không | ~15 | integration pricing/catalog + E2E liên quan + spec mới |
| QT2 | Có (nhỏ) | ~15 | integration + E2E bật hiển thị |
| QT3 | Có (enum + cột) | ~30 | integration đồng thời + full E2E |
