# Bản đồ nghiệp vụ Admin & quy trình thay đổi

Ngày khảo sát: 16/11/2026 (nhánh `dev`, commit `477136a`). Chỉ khảo sát và đề xuất — **chưa sửa code**.
Mục đích: mỗi nghiệp vụ có **một nơi quản lý chính** và **một hàm xử lý domain**; các trang khác chỉ là lối tắt.
Trước khi sửa một nghiệp vụ trong bảng dưới, đọc dòng tương ứng và làm theo [§4 Quy trình thay đổi](#4-quy-trình-thay-đổi).

Ký hiệu: ✅ dùng chung đúng · ⚠️ logic lặp, có rủi ro · 🗑 code chết.

## 1. Bản đồ — nhóm rủi ro cao (giá · kho · đơn)

| Nghiệp vụ | Trang chính | Lối tắt / điểm vào khác | Action | Hàm domain | Dữ liệu ghi | Nơi hiển thị / cache |
|---|---|---|---|---|---|---|
| **Đặt giá bán – tự động** | `/admin/selling-prices` → bản tính `/admin/pricing/runs/[id]` | Nút "Đặt giá" ở bước 3 trang SP, phiếu nhập đã ghi sổ, Excel (cột giá) | `previewRunAction`, `recomputeRunAction`, `applyRunAction`, `cancelRunAction` | `pricing/runs.ts` `previewRun` → `applyRun` → hàm ghi dòng (≈ dòng 361–430) | `Variant.priceMmk/affiliateCommissionMmk` hoặc `ProductChangeRequest.prices`, `PriceHistory`, `PriceUpdateRun*`, audit | `CATALOG_TAG` (storefront), danh sách SP, Giá bán |
| **Đặt giá – thủ công kho VND** | `/admin/selling-prices/manual` | — | `applyManualVndAction` | `pricing/runs.ts` `applyManualVnd` (công thức `pricing/formula.ts`, dùng chung với client ✅) → cùng hàm ghi dòng như trên | như trên | như trên |
| **Đặt giá – thủ công kho MMK** (+ hoa hồng CTV, lãi cố định) | `/admin/selling-prices/manual` | — | `saveProductPricingAction`; 🗑 `saveSellingPriceAction` (không còn UI gọi) | `catalog/product-pricing.ts` `saveProductPricing` | như trên + `Product.fixedProfitMmk` | như trên |
| **Giá/hoa hồng qua Excel** | `/admin/products/import` | — | `catalogImportAction` | `catalog/catalog-import.ts` → `saveProduct` (SP chưa duyệt, ghi live) / `stageProductEdit` (SP đã duyệt, vào bản chờ duyệt) | như trên, `reason = import:<mã file>` | như trên |
| **Áp giá chờ duyệt** | Trang SP (khối duyệt) | Danh sách SP (duyệt hàng loạt), "Duyệt luôn" ở Giá bán/Excel | `reviewProductsAction`, `productBulkAction` | `catalog/review.ts` → `change-request.ts` (áp `prices`, ≈ dòng 300–315) | `Variant.*`, `PriceHistory` | `CATALOG_TAG` |
| **Tỷ giá** | `/admin/pricing` | Chọn tỷ giá ở Giá bán, form nhập kho | `createRateAction` | `pricing/runs.ts` `createRate`, `pricing/latest-rate.ts` | `ExchangeRate` | Giá bán, phiếu nhập (đổi tỷ giá **không** tự đổi giá) |
| **Nguồn giá mua / giá vốn** | (đọc) | Bảng tính, cảnh báo `PRICE_STALE`, gợi ý ở form nhập | — | ✅ `pricing/cost.ts` `receiptSourceLine` + `isSourceForProduct`; giá vốn lô ✅ `inventory/lot-cost.ts`; giá vốn hiệu lực ✅ `inventory/cost.ts` `inventoryCost` | — | readiness, báo cáo, in phiếu, bàn giao |
| **Nhập kho** | `/admin/inventory/documents/new` (RECEIVE → `ReceiveBulkForm`; loại khác → `DocumentForm`) | Sửa nháp `/documents/[id]/edit`; Excel có cột số lượng → phiếu NHẬP NHÁP | `createDocumentAction`, `updateDocumentAction`, `postDocumentAction`, `cancelDocumentAction` | ✅ `inventory/documents.ts` `createDocument` / `updateReceiveDraft` / `postDocument` | `StockDocument*`, `Batch`, khối lượng (`fillWeights`, có `guardApproval`) | Tồn kho, cảnh báo, giá bán (`PRICE_STALE`) |
| **Khu chờ kiểm tra** | `/admin/inventory/quarantine` | Badge menu | `restockAction`, `discardAction` | `inventory/quarantine.ts` → `createDocument` + `postDocument` ✅ | như nhập kho | Tồn, cảnh báo |
| **Ghi sổ kho (mọi đường)** | — | Phiếu tay, Excel, khu chờ, xuất đơn, trả hàng | — | ✅ **một điểm duy nhất**: `postDocumentTx` → `inventory/ledger.ts` `applyMoves` | `StockLedger` (chỉ thêm), `StockBalance` | Tồn kho (không cache) |
| **Hạn dùng / lô khả dụng** | `/admin/inventory`, `/admin/alerts` | Badge menu "lô bị chặn", trang SP, storefront | — | ✅ `inventory/fefo.ts` `sellableBatchWhere`/`sellableCutoff`, `orders/availability.ts`; ⚠️ điều kiện "lô bị chặn" viết tay ở `inventory/overview.ts:81` và `admin/nav-counts.ts:37` | — | Tồn bán, badge, bộ lọc |
| **Kho bán của SP** | Trang SP → "Thiết lập khác" | Danh sách SP → "Chuyển kho" hàng loạt | `saveProductAction`, `productBulkAction` (`move`) | ⚠️ `catalog/products.ts` `saveProduct` (dòng 166–174) **và** `catalog/product-delete.ts` `moveProductsToWarehouse` | `Product.stockLocationId` | Tồn bán, xuất đơn theo kho, chế độ tính giá của kho |
| **Tạo đơn** | `/admin/orders/new` | Cổng CTV (dùng chung `OrderForm` ✅), checkout storefront | `createOrderAction`, `placeOrderAction` | ✅ `orders/orders.ts` `createOrder` | `Order`, `OrderItem` (giá + hoa hồng chốt), `Reservation` | Danh sách đơn, tồn khả dụng |
| **Chuyển trạng thái đơn** | `/admin/orders/[id]` | Danh sách đơn (hàng loạt), Đặt trước, in phiếu soạn, cron huỷ | `transitionOrderAction`, `bulkTransitionAction`, `savePickManifestsAction` | ✅ `orders/state-machine.ts` + `orders/transitions.ts` `transitionInTx` (bulk/cron/trả hàng/đặt trước đều qua đây) | `Order.status`, `OrderStatusHistory`, phiếu ISSUE | Đơn, tồn, COD |
| **Xuất kho theo đơn** | (bàn giao vận chuyển) | — | qua chuyển trạng thái | `transitions.ts` `issueOrderStock` — tạo phiếu bằng `tx.stockDocument.create` rồi `postDocumentTx` ✅ | `StockDocument` ISSUE, `OrderAllocation` (giá vốn chốt) | Tồn, lãi gộp |
| **Trả hàng** | `/admin/orders/[id]` | — | `returnItemsAction` | `orders/returns.ts` — `tx.stockDocument.create` + `postDocumentTx` ✅, chuyển trạng thái qua `transitionInTx` ✅ | phiếu RETURN, `OrderItem.returnedQty` | Tồn, hoa hồng (trừ phần trả) |
| **Hoa hồng chốt theo dòng đơn** | (tự động khi tạo đơn) | Gán CTV sau ở trang đơn | `createOrderAction`/`placeOrderAction`, `assignOrderAffiliateAction` | ⚠️ `orders/orders.ts:150` **và** `affiliates/affiliates.ts:551–553` | `OrderItem.commissionPerUnitMmk` | Hoa hồng & chi trả, cổng CTV |
| **COD** | `/admin/orders/cod` | — | `remitCodAction`, `settleCodExceptionAction` | ✅ `orders/cod.ts` | `Order.cod*`, audit | Báo cáo, tuổi nợ COD |

## 2. Bản đồ — nhóm còn lại (rủi ro thấp)

| Nghiệp vụ | Trang chính | Lối tắt | Hàm domain | Ghi chú |
|---|---|---|---|---|
| Duyệt / đăng / ẩn SP | Trang SP | Danh sách SP (hàng loạt + 3 lối tắt "Đăng bán" trong menu), "Duyệt luôn" ở Giá bán/Excel | ✅ `catalog/review.ts` (`submitProducts`, `reviewProducts`, `submitTouched`), `products.ts` `setProductsPublished`, `batch-review-text.ts` | Lối tắt hợp lý |
| Sửa nội dung/ảnh SP | Trang SP | Excel | ✅ `saveProduct`/`stageProductEdit`, `images.ts` — đều bọc `guardApproval` | — |
| Đặt trước | Trang SP (bật/tắt, hạn mức) | Cài đặt (`preorder.defaultLimit`), `/admin/orders/preorders` | ✅ `catalog/product-preorder.ts`, `orders/preorder.ts` | — |
| Tài khoản NV/khách/CTV (khoá, xoá, đặt lại mật khẩu) | Trang chi tiết | Danh sách (`AccountRowActions` ✅) | `users/*`, `accounts/*`, `affiliates/*` | Lối tắt hợp lý, cùng action |
| Danh mục, banner, bộ sưu tập | Trang riêng | — | `catalog/categories.ts`, `content/*` | — |

## 3. Phân loại: giữ lối tắt, gom logic lặp

**Lối tắt hợp lý — giữ nguyên:** các trang chỉ *dẫn sang* trang chính hoặc gọi **cùng action/hàm domain**: bước 3 trang SP → Giá bán; menu "Đăng bán" → danh sách SP đã lọc; danh sách ↔ chi tiết tài khoản; bulk đơn hàng; Excel gọi `saveProduct`/`createDocument`; `OrderForm` admin ↔ CTV; badge menu.

**Logic lặp — cần gom dần (ưu tiên theo rủi ro, mỗi mục một đợt nhỏ, độc lập):**

| # | Mức | Điểm trùng | Vì sao rủi ro | Đề xuất |
|---|---|---|---|---|
| R1 | **Cao – giá** | Quy tắc "ghi giá live hay vào bản chờ duyệt + khoá lạc quan + `PriceHistory` + kiểm hoa hồng ≤ giá" viết ở 4 nơi: `catalog/product-pricing.ts:56–104`, `pricing/runs.ts:361–430`, `catalog/products.ts:228–258` (`saveProduct`, đường Excel cho SP chưa duyệt), `catalog/change-request.ts:210–222` + `:300–315`. Thêm `effectivePricingOf` (`runs.ts:245`) trùng `effectivePricing` (`change-request.ts:242`). | Đã lệch nhau: `saveProduct` nhận giá 0 và chỉ kiểm hoa hồng khi giá > 0, `PriceHistory` không ghi hoa hồng đổi, không khoá theo giá đang đọc; `product-pricing` khoá theo giá; `runs` khoá theo giá + hoa hồng. Đổi quy tắc giá ở một chỗ → chỗ khác sai âm thầm. | Một hàm `writeVariantPrices(tx, productId, entries, { reason, userId, runId? })` (đặt ở `catalog/change-request.ts` hoặc file mới `catalog/price-write.ts`) quyết định live/stage, khoá, lịch sử, audit; 4 đường gọi chung. **Bước 0:** test đặc tính cho cả 4 đường trước khi gom. |
| R2 | Cao – giá (dọn) | 🗑 `saveSellingPriceAction` (`catalog/actions.ts:379`) — đường vào giá thứ 5, không UI nào gọi. | Server Action vẫn gọi được từ client; dễ bị dùng lại sai. | Xoá (đợt riêng, kèm R1 hoặc trước). |
| R3 | **Trung bình – kho/đơn** | Đổi kho bán SP có 2 đường. `moveProductsToWarehouse` kiểm combo **hai chiều** + audit `product.move`; `saveProduct` chỉ kiểm khi chính SP là combo (`products.ts:270–273`), **không kiểm khi SP là thành phần của combo khác**. Test chỉ phủ đường hàng loạt (`tests/integration/warehouses.test.ts:86`). | **Đã xác nhận 16/11/2026** bằng test `it.fails` "đổi kho qua form SP: thành phần của combo khác kho bị chặn" (`tests/integration/warehouses.test.ts`): đổi kho một thành phần qua form lưu thành công → combo và thành phần khác kho → xuất kho combo sai/bị chặn khi bàn giao. | Sửa xong đổi test về `it`. Cách sửa: một hàm `changeProductWarehouse(tx, ids, locationId, userId)` dùng cho cả form và bulk. |
| R4 | Thấp–TB – đơn/CTV | Chốt `commissionPerUnitMmk` ở `orders/orders.ts:150` và `affiliates/affiliates.ts:553`. | Hiện cùng quy tắc; đổi quy tắc (vd. theo giá trị đang chờ duyệt) phải sửa cả hai. | Hàm thuần `commissionSnapshot(variant, hasAffiliate)` trong `affiliates/commission.ts`. |
| R5 | Thấp – kho | Điều kiện "lô bị chặn" viết tay ở `inventory/overview.ts:81` và `admin/nav-counts.ts:37`. | Badge menu và bộ lọc tồn có thể lệch khi đổi quy tắc hạn dùng. | `blockedBatchWhere(now, blockDays)` trong `inventory/fefo.ts`. |
| R6 | Thấp – kho | Tạo phiếu: `createDocument` (phiếu tay/Excel/khu chờ) và `tx.stockDocument.create` trực tiếp (`transitions.ts:187`, `returns.ts:77`). Ghi sổ vẫn chung `postDocumentTx` ✅. | Chấp nhận được; rủi ro nếu có đường thứ ba bỏ qua `postDocumentTx`. | Không gom bây giờ. Quy tắc: mọi phiếu phải ghi sổ qua `postDocumentTx`. |
| R7 | Thấp – tài liệu | Chú thích `catalog/approval-rules.ts:6–8` ghi hoa hồng CTV "ghi thẳng, không cần duyệt" — trái quy tắc 16/11 (hoa hồng của SP đã duyệt vào bản chờ duyệt). | Người sửa sau hiểu sai. | Sửa chú thích (kèm R1). |
| R8 | Thấp – cache | Mỗi action tự liệt kê `updateTag`/`revalidatePath`; đường đổi giá có helper `refreshPricing` (`pricing/actions.ts`) nhưng `catalog/actions.ts` viết tay. | Quên `updateTag(CATALOG_TAG)` → khách thấy giá cũ. | Một helper làm mới dùng chung cho mọi action đổi giá (tầng action, vì cần `next/cache`). |

Thứ tự đề xuất: **R3 (đã có test, còn sửa) → R2 → R1 → R4/R5 → R7/R8**. Mỗi mục một commit/PR riêng, không gộp.

## 4. Quy trình thay đổi

Áp dụng cho mọi thay đổi nghiệp vụ trong Admin (bắt buộc với giá, kho, đơn, hoa hồng).

1. **Truy vết phạm vi trước khi sửa**
   - Tìm dòng nghiệp vụ trong §1–2. Không có → thêm dòng mới vào bảng trong cùng commit.
   - `grep` tên hàm domain + cột DB bị ghi (vd. `priceMmk:`, `commissionPerUnitMmk`, `stockDocument.create`, `expiryStatus`) trong `src/server` để thấy **mọi đường ghi**, không chỉ đường đang sửa. Bỏ qua `.claude/worktrees/`.
   - Liệt kê nơi hiển thị bị ảnh hưởng: trang admin, storefront (tag cache), cổng CTV, báo cáo, in phiếu.
2. **Không tạo đường xử lý mới**
   - Trang/nút mới cho nghiệp vụ đã có = **lối tắt**: gọi action/hàm domain sẵn có hoặc dẫn link sang trang chính. Không chép form, schema Zod hay công thức.
   - Cần biến thể hành vi → thêm tham số vào hàm domain chung, không viết hàm song song.
   - Đã thấy logic lặp (bảng §3) trong vùng đang sửa → sửa **mọi** bản lặp trong cùng thay đổi, hoặc ghi rõ phần còn lại vào §3.
3. **Kiểm từng đường liên quan**
   - Quyền: `requirePermission` ở mọi action, đúng quyền phụ (`catalog:approve`, `stock:receive`, `pricing:manage`…).
   - Validation: Zod trong hàm domain (không chỉ ở form); khoá dòng/khoá lạc quan giống các đường khác.
   - Duyệt: sửa nội dung/giá/ảnh/khối lượng của SP đã duyệt phải qua `guardApproval`/bản chờ duyệt.
   - Audit: `auditLog` hoặc `PriceHistory`/`StockLedger` với cùng `action`/`reason` như các đường khác.
   - Cache: `updateTag` đúng tag cho dữ liệu khách thấy.
4. **Test hồi quy**
   - Integration test cho **từng** điểm vào của nghiệp vụ (vd. đổi giá: Giá bán tự động, thủ công VND, thủ công MMK, Excel, duyệt), không chỉ đường vừa sửa.
   - Gom logic lặp: viết test đặc tính (hành vi hiện tại) **trước**, gom sau, test phải giữ nguyên kết quả trừ chỗ cố ý sửa.
   - Theo CLAUDE.md: `npm run check` + test bị ảnh hưởng; giá/kho/đơn = rủi ro cao → full E2E trước khi merge `main`.
5. **Cập nhật tài liệu**: sửa bảng §1–3 (trang chính, hàm domain, trạng thái ⚠️/✅) trong cùng commit.
