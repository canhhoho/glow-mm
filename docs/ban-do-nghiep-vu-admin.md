# Bản đồ nghiệp vụ Admin & quy trình thay đổi

Ngày khảo sát: 16/11/2026 (nhánh `dev`, commit `477136a`). Chỉ khảo sát và đề xuất — **chưa sửa code**.
Mục đích: mỗi nghiệp vụ có **một nơi quản lý chính** và **một hàm xử lý domain**; các trang khác chỉ là lối tắt.
Trước khi sửa một nghiệp vụ trong bảng dưới, đọc dòng tương ứng và làm theo [§4 Quy trình thay đổi](#4-quy-trình-thay-đổi).

Ký hiệu: ✅ dùng chung đúng · ⚠️ logic lặp, có rủi ro · 🗑 code chết.

## 1. Bản đồ — nhóm rủi ro cao (giá · kho · đơn)

| Nghiệp vụ | Trang chính | Lối tắt / điểm vào khác | Action | Hàm domain | Dữ liệu ghi | Nơi hiển thị / cache |
|---|---|---|---|---|---|---|
| **Đặt giá bán – tự động** | `/admin/selling-prices` → bản tính `/admin/pricing/runs/[id]` | Nút "Đặt giá" ở bước 3 trang SP, phiếu nhập đã ghi sổ, Excel (cột giá) | `previewRunAction`, `recomputeRunAction`, `applyRunAction`, `cancelRunAction` | `pricing/runs.ts` `previewRun` → `applyRun` → `applyLines` → ✅ `writeLivePrice` / `stagePrices` | `Variant.priceMmk/affiliateCommissionMmk` hoặc `ProductChangeRequest.prices`, `PriceHistory`, `PriceUpdateRun*`, audit | `CATALOG_TAG` (storefront), danh sách SP, Giá bán |
| **Đặt giá – thủ công kho VND** | `/admin/selling-prices/manual` | — | `applyManualVndAction` | `pricing/runs.ts` `applyManualVnd` (công thức `pricing/formula.ts`, dùng chung với client ✅) → cùng hàm ghi dòng như trên | như trên | như trên |
| **Đặt giá – thủ công kho MMK** (+ hoa hồng CTV, lãi cố định) | `/admin/selling-prices/manual` | — | `saveProductPricingAction` | `catalog/product-pricing.ts` `saveProductPricing` → ✅ `writeLivePrice` / `stagePrices` | như trên + `Product.fixedProfitMmk` | như trên |
| **Giá/hoa hồng qua Excel** | `/admin/products/import` | — | `catalogImportAction` | `catalog/catalog-import.ts` → `saveProduct` (SP chưa duyệt: `writeProduct` + ✅ `recordPriceChange`) / `stageProductEdit` (SP đã duyệt, vào bản chờ duyệt) | như trên, `reason = import:<mã file>` | như trên |
| **Áp giá chờ duyệt** | Trang SP (khối duyệt) | Danh sách SP (duyệt hàng loạt), "Duyệt luôn" ở Giá bán/Excel | `reviewProductsAction`, `productBulkAction` | `catalog/review.ts` → `change-request.ts` `applyChangeRequest` → ✅ `writeLivePrice` | `Variant.*`, `PriceHistory` | `CATALOG_TAG` |
| **Tỷ giá** | `/admin/selling-prices?mode=rates` (tab Tỷ giá; `/admin/pricing` cũ chuyển hướng tới đây) | Chọn tỷ giá ở Giá bán, form nhập kho | `createRateAction` | `pricing/runs.ts` `createRate`, `pricing/latest-rate.ts` | `ExchangeRate` | Giá bán, phiếu nhập (đổi tỷ giá **không** tự đổi giá) |
| **Lịch sử giá** | `/admin/selling-prices?mode=history` | Trang SP (nguồn giá từng biến thể) | — | `pricing/queries.ts` `listPriceHistory` (chỉ đọc) | — | `PriceHistory` ghi ở `catalog/price-write.ts` |
| **Nguồn giá mua / giá vốn** | (đọc) | Bảng tính, cảnh báo `PRICE_STALE`, gợi ý ở form nhập | — | ✅ `pricing/cost.ts` `receiptSourceLine` + `isSourceForProduct`; giá vốn lô ✅ `inventory/lot-cost.ts`; giá vốn hiệu lực ✅ `inventory/cost.ts` `inventoryCost` | — | readiness, báo cáo, in phiếu, bàn giao |
| **Nhập kho** | `/admin/inventory/documents/new` (RECEIVE → `ReceiveBulkForm`; loại khác → `DocumentForm`) | Sửa nháp `/documents/[id]/edit`; Excel có cột số lượng → phiếu NHẬP NHÁP | `createDocumentAction`, `updateDocumentAction`, `postDocumentAction`, `cancelDocumentAction` | ✅ `inventory/documents.ts` `createDocument` / `updateReceiveDraft` / `postDocument` | `StockDocument*`, `Batch`, khối lượng (`fillWeights`, có `guardApproval`) | Tồn kho, cảnh báo, giá bán (`PRICE_STALE`) |
| **Sửa phiếu nháp / hướng dẫn phiếu đã ghi sổ** | `/admin/inventory/documents/[id]` | Trang tạo phiếu `?from=<id>` (điền sẵn) | `createDocumentAction` (`replacesId`), `updateDocumentAction` (chỉ Nhập) | ✅ `documents.ts`: `replaceDraftDocument` (tạo mới + huỷ cũ cùng giao dịch, dùng `cancelDocumentTx`); `updateReceiveDraft` | `StockDocument*` | Phiếu đã ghi sổ: chưa có chức năng sửa/đảo giá, tỷ giá, phí về kho — cần thiết kế riêng |
| **Khu chờ kiểm tra** | `/admin/inventory/quarantine` | Lối tắt trong trang Tồn kho (badge ở mục Tồn kho) | `restockAction`, `discardAction` | `inventory/quarantine.ts` → `createDocument` + `postDocument` ✅ | như nhập kho | Tồn, cảnh báo |
| **Ghi sổ kho (mọi đường)** | — | Phiếu tay, Excel, khu chờ, xuất đơn, trả hàng | — | ✅ **một điểm duy nhất**: phiếu chỉ tạo trong `inventory/documents.ts` (`createDocument` / `postOrderDocumentTx`) → `postDocumentTx` → `inventory/ledger.ts` `applyMoves` | `StockLedger` (chỉ thêm), `StockBalance` | Tồn kho (không cache) |
| **Hạn dùng / lô khả dụng** | `/admin/inventory`, `/admin/alerts` | Lối tắt Cảnh báo ở Tồn kho, trang SP, storefront | — | ✅ `inventory/fefo.ts` `sellableBatchWhere`/`sellableCutoff`, `orders/availability.ts`, `blockedBatchWhere` (lô bị chặn — bộ lọc Tồn kho + badge menu) | — | Tồn bán, badge, bộ lọc |
| **Gợi ý đặt hàng / hàng đang về** | `/admin/alerts` (tab Gợi ý đặt hàng) | Dashboard (đếm), Báo cáo › Chuyến chưa đánh dấu đã đến | — | ✅ `alerts/queries.ts` `loadVariantStock` + `alerts/compute.ts` `reorderSuggestion`: gợi ý = nhu cầu − `available` (kho bán của SP). `otherQty` (SELLABLE ngoài kho bán, trừ khu chờ KT) chỉ để xem. Không có nguồn "số lượng đang đặt" — chuyến hàng chỉ là nhãn trên phiếu nhập | — | Hàng của chuyến chưa đến đã nằm trong `available` (nhập thẳng kho bán) → không cộng trùng |
| **Thông tin SP (tên, thương hiệu, danh mục, phân loại/SKU/khối lượng, mô tả, chi tiết thêm)** | Trang SP → tab Thông tin (`ProductForm`) | Tạo SP (`ProductCreateForm`, chỉ tên/thương hiệu/danh mục/phân loại), Nhập Excel | `saveProductAction`, `createProductAction`, `catalogImportAction` | `catalog/products.ts` `saveProduct` (mọi đường); bộ trường + nhãn chung `lib/product-fields.ts` + `ProductFields.*` (16/11/2026) | `Product*`, `ProductTranslation`, `Variant` (trừ giá) | Trang SP khách, duyệt (tên/mô tả/phân loại trong dấu vân tay; cách dùng/thành phần/bảo quản/PAO/khối lượng ghi thẳng) |
| **Kho bán của SP** | Ghi sổ phiếu nhập/chuyển đầu tiên vào kho bán (16/11/2026: SP mới chưa có kho) | Danh sách SP → "Chuyển kho" hàng loạt (đổi / gán trước); trang SP chỉ xem | `postDocumentAction`, `productBulkAction` (`move`) | `inventory/documents.ts` `checkLocations(..., { assignWarehouse })` (gán khi NULL, khoá dòng SP) và `catalog/product-delete.ts` `moveProductsToWarehouse` (kiểm combo ✅ `assertBundleWarehouses`); `saveProduct` giữ kho đang có, combo lấy kho thành phần | `Product.stockLocationId` (NULL = chưa nhập hàng) | Tồn bán, xuất đơn theo kho, chế độ tính giá của kho |
| **Tạo đơn** | `/admin/orders/new` | Cổng CTV (dùng chung `OrderForm` ✅), checkout storefront | `createOrderAction`, `placeOrderAction` | ✅ `orders/orders.ts` `createOrder` | `Order`, `OrderItem` (giá + hoa hồng chốt), `Reservation` | Danh sách đơn, tồn khả dụng |
| **Chuyển trạng thái đơn** | `/admin/orders/[id]` | Danh sách đơn (hàng loạt), Đặt trước, in phiếu soạn, cron huỷ | `transitionOrderAction`, `bulkTransitionAction`, `savePickManifestsAction` | ✅ `orders/state-machine.ts` + `orders/transitions.ts` `transitionInTx` (bulk/cron/trả hàng/đặt trước đều qua đây) | `Order.status`, `OrderStatusHistory`, phiếu ISSUE | Đơn, tồn, COD |
| **Xuất kho theo đơn** | (bàn giao vận chuyển) | — | qua chuyển trạng thái | `transitions.ts` `issueOrderStock` → ✅ `inventory/documents.ts` `postOrderDocumentTx` (tạo + ghi sổ) | `StockDocument` ISSUE, `OrderAllocation` (giá vốn chốt) | Tồn, lãi gộp |
| **Trả hàng** | `/admin/orders/[id]` | — | `returnItemsAction` | `orders/returns.ts` → ✅ `postOrderDocumentTx`, chuyển trạng thái qua `transitionInTx` ✅ | phiếu RETURN, `OrderItem.returnedQty` | Tồn, hoa hồng (trừ phần trả) |
| **Hoa hồng chốt theo dòng đơn** | (tự động khi tạo đơn) | Gán CTV sau ở trang đơn | `createOrderAction`/`placeOrderAction`, `assignOrderAffiliateAction` | `orders/orders.ts` (tạo đơn) và `affiliates/affiliates.ts` `assignOrderAffiliate` — cùng ✅ `commissionPerUnitSnapshot` (`affiliates/commission.ts`) | `OrderItem.commissionPerUnitMmk` | Hoa hồng & chi trả, cổng CTV |
| **COD** | `/admin/orders/cod` | Tổng quan (ô "COD chưa về": `outstandingCodSummary` → cùng `summarizeCod` với trang COD) | `remitCodAction`, `settleCodExceptionAction` | ✅ `orders/cod.ts` | `Order.cod*`, audit | Báo cáo, tuổi nợ COD |

## 2. Bản đồ — nhóm còn lại (rủi ro thấp)

| Nghiệp vụ | Trang chính | Lối tắt | Hàm domain | Ghi chú |
|---|---|---|---|---|
| Duyệt / đăng / ẩn SP | Trang SP | Danh sách SP (hàng loạt; các tab Chờ hoàn thiện / Chờ duyệt / Đang bán — không còn nhóm "Đăng bán" trong menu), "Duyệt luôn" ở Giá bán/Excel | ✅ `catalog/review.ts` (`submitProducts`, `reviewProducts`, `submitTouched`), `products.ts` `setProductsPublished`, `batch-review-text.ts` | Lối tắt hợp lý |
| Sửa nội dung/ảnh SP | Trang SP | Excel | ✅ `saveProduct`/`stageProductEdit`, `images.ts` — đều bọc `guardApproval` | — |
| Thành phần combo | Trang SP (biến thể combo) / tạo combo (`kind=combo`) | Excel (không đổi combo) | `saveProductAction`, `createProductAction` | `catalog/products.ts` `writeProduct` (thành phần MỚI phải đang dùng, cùng kho; thành phần đã lưu giữ nguyên) + readiness `COMPONENT_INACTIVE` (`readiness.ts`, cả `loadReadiness` và `loadReadinessErrors`) — chặn mở bán, không chặn lưu combo đang hiển thị | `BundleItem` | Bộ chọn (`admin-queries.ts`): lựa chọn mới chỉ cùng kho + đang dùng; thành phần đã lưu hiện kèm nhãn |
| Xoá / Ngừng kinh doanh / Khôi phục SP | Danh sách SP (nút Xoá, hàng loạt; xem "Ngừng kinh doanh") | Trang chi tiết SP ngừng KD (nút Khôi phục: `restoreProductAction` → cùng `restoreProducts`) | ✅ `productBulkAction` → `catalog/product-delete.ts` `deleteProducts` (chưa có lịch sử → xoá hẳn; có lô/sổ kho/phiếu/giữ hàng/đơn/combo → chỉ `archivedAt`) / `restoreProducts` | SP ngừng KD còn tồn hoặc đang giữ hàng vẫn ở Tồn kho "Tất cả" có nhãn; hết tồn chỉ ở "Lịch sử hết tồn" (`overview.ts` `ARCHIVED_VARIANT`, `status=archived|history`). Không xoá được sổ kho → dữ liệu mẫu cần script bảo trì riêng, không dùng phiếu giả |
| Tên kho hiển thị (admin) | — | Trang lô, danh sách phiếu, khu chờ kiểm tra, cảnh báo hạn dùng, phiếu soạn trong đơn | — | ✅ `components/admin/stock-parts.tsx` `LocationName` (tên + mã + "ngừng dùng"); không dùng nhãn loại vị trí cũ | — | Chỉ preview Excel còn hiện mã kho (cột Excel là mã) |
| Đặt trước | Trang SP (bật/tắt, hạn mức) | Cài đặt (`preorder.defaultLimit`), `/admin/orders/preorders` | ✅ `catalog/product-preorder.ts`, `orders/preorder.ts` | — |
| Tài khoản NV/khách/CTV (khoá, xoá, đặt lại mật khẩu) | Trang chi tiết | Danh sách (`AccountRowActions` ✅) | `users/*`, `accounts/*`, `affiliates/*` | Lối tắt hợp lý, cùng action |
| Danh mục, banner, bộ sưu tập | Trang riêng | — | `catalog/categories.ts`, `content/*` | — |
| Bộ sưu tập: trạng thái SP và số hiện ngoài web | `/admin/content/collections/[id]`, danh sách | — | `addCollectionProductAction` | `content/collections.ts`: `getCollectionAdmin` (cờ `archived`, `visible` theo `STORE_VISIBLE`), `listCollectionsAdmin` (`items` đã cấu hình vs `visible` hiện ngoài web), `addCollectionProducts` (bỏ qua SP ngừng KD) | `CollectionItem` | Storefront lọc bằng `STORE_VISIBLE`; SP ngừng KD giữ dòng để xem lịch sử / gỡ |

## 3. Phân loại: giữ lối tắt, gom logic lặp

**Lối tắt hợp lý — giữ nguyên:** các trang chỉ *dẫn sang* trang chính hoặc gọi **cùng action/hàm domain**: bước 3 trang SP → Giá bán; tab trạng thái của danh sách SP; tab Chờ hàng của danh sách đơn; Cảnh báo / Chờ kiểm tra từ trang Tồn kho; tab CTV (hồ sơ / đăng ký / hoa hồng), Tài khoản (nhân viên / khách), Nội dung website (banner / bộ sưu tập); danh sách ↔ chi tiết tài khoản; bulk đơn hàng; Excel gọi `saveProduct`/`createDocument`; `OrderForm` admin ↔ CTV; badge menu.

**Logic lặp — cần gom dần (ưu tiên theo rủi ro, mỗi mục một đợt nhỏ, độc lập):**

| # | Mức | Điểm trùng | Vì sao rủi ro | Đề xuất |
|---|---|---|---|---|
| R1 | ✅ Đã gom 16/11/2026 | Ghi giá live + khoá lạc quan + `PriceHistory` + kiểm hoa hồng ≤ giá viết ở 4 nơi (`product-pricing.ts`, `pricing/runs.ts` `applyLines`, `products.ts` `writeProduct`, `change-request.ts` `applyChangeRequest`); `effectivePricingOf` (`runs.ts`) trùng `effectivePricing` (`change-request.ts`). | Lệch thật duy nhất: đường Excel không ghi hoa hồng đổi vào `PriceHistory` (nay ghi). Giá 0 + chỉ kiểm hoa hồng khi giá > 0 là chủ ý (SKU nháp), giữ nguyên. | Nay dùng chung `catalog/price-write.ts`: `writeLivePrice` (khoá theo giá + hoa hồng đang đọc, ghi lịch sử), `recordPriceChange`, `commissionOverPrice`; giá hiệu lực một hàm `effectivePricingOf` (`change-request.ts`). Chọn live/bản chờ duyệt vẫn ở từng đường (`approvedAt` → `stagePrices`). Test: `tests/integration/price-write-paths.test.ts`. |
| R2 | ✅ Đã xoá 16/11/2026 | `saveSellingPriceAction` — đường vào giá thứ 5, không UI nào gọi. | Server Action vẫn gọi được từ client; dễ bị dùng lại sai. | Đã xoá; chú thích `pricing/selling-prices.ts` trỏ về 3 đường ghi giá còn lại. |
| R3 | ✅ Đã sửa 16/11/2026 (bỏ hẳn đường form cùng ngày) | Đổi kho bán SP có 2 đường; form SP trước đây chỉ kiểm khi chính SP là combo, không kiểm khi SP là thành phần của combo khác. | Đổi kho thành phần qua form lưu được → combo và thành phần khác kho → xuất kho combo sai/bị chặn khi bàn giao. | Đã gom: hai đường gọi chung `assertBundleWarehouses` (kiểm hai chiều). Test: "đổi kho qua form SP: thành phần của combo khác kho bị chặn" (`tests/integration/warehouses.test.ts`). Audit vẫn khác nhau (`product.update` vs `product.move`) — chấp nhận. |
| R4 | ✅ Đã gom 16/11/2026 | Chốt `commissionPerUnitMmk` ở tạo đơn và gán CTV sau. | Đổi quy tắc phải sửa cả hai. | Hàm thuần `commissionPerUnitSnapshot` (`affiliates/commission.ts`), unit test + integration `affiliates.test.ts` phủ cả hai đường. |
| R5 | ✅ Đã gom 16/11/2026 | Điều kiện "lô bị chặn" viết tay ở `inventory/overview.ts` và `admin/nav-counts.ts`. | Badge menu và bộ lọc tồn có thể lệch. | `blockedBatchWhere` (`inventory/fefo.ts`), phần bù đúng của `sellableBatchWhere`; test "R5: lô bị chặn = phần bù…" (`stock-overview.test.ts`). |
| R6 | ✅ Đã gom 16/11/2026 | Phiếu xuất của đơn (`transitions.ts`) và phiếu trả hàng (`returns.ts`) tạo bằng `tx.stockDocument.create` riêng. | Rủi ro có đường thứ ba bỏ qua `postDocumentTx`. | `postOrderDocumentTx` trong `documents.ts` (không qua `documentSchema` để form không gắn được `orderId` vào phiếu xuất). Unit test `tests/unit/write-paths.test.ts` chặn tạo phiếu kho / ghi `StockBalance` / ghi `PriceHistory` ngoài file được phép. |
| R7 | ✅ Đã sửa 16/11/2026 | Chú thích `catalog/approval-rules.ts` ghi hoa hồng CTV "ghi thẳng, không cần duyệt". | Người sửa sau hiểu sai. | Đã sửa: hoa hồng không nằm trong dấu vân tay nhưng vẫn qua bản chờ duyệt. |
| R8 | ✅ Đã gom 16/11/2026 | Mỗi action đổi giá tự liệt kê `updateTag`/`revalidatePath`; `catalog/actions.ts` viết tay, duyệt/huỷ bản đang sửa không làm mới trang Giá bán. | Quên `updateTag(CATALOG_TAG)` → khách thấy giá cũ. | `refreshPrices` (`catalog/refresh-prices.ts`, tầng action) dùng cho Giá bán MMK, bảng tính / thủ công VND, Excel, lưu & duyệt, duyệt / gửi duyệt / huỷ bản đang sửa, thao tác hàng loạt. `write-paths.test.ts` chặn làm mới trang Giá bán ở nơi khác. |

Trạng thái: R1–R8 đã xử lý (16/11/2026). Điểm trùng mới phát hiện → thêm dòng R9… vào bảng, mỗi mục một commit riêng.

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
   - Cache: `updateTag` đúng tag cho dữ liệu khách thấy; đổi giá/hoa hồng → gọi `refreshPrices` (`catalog/refresh-prices.ts`).
4. **Test hồi quy**
   - Integration test cho **từng** điểm vào của nghiệp vụ (vd. đổi giá: Giá bán tự động, thủ công VND, thủ công MMK, Excel, duyệt), không chỉ đường vừa sửa.
   - Gom logic lặp: viết test đặc tính (hành vi hiện tại) **trước**, gom sau, test phải giữ nguyên kết quả trừ chỗ cố ý sửa.
   - Thêm nơi ghi mới cho phiếu kho / tồn / lịch sử giá → `tests/unit/write-paths.test.ts` sẽ báo lỗi: gọi hàm domain sẵn có thay vì nới danh sách cho phép.
   - Theo CLAUDE.md: `npm run check` + test bị ảnh hưởng; giá/kho/đơn = rủi ro cao → full E2E trước khi merge `main`.
5. **Cập nhật tài liệu**: sửa bảng §1–3 (trang chính, hàm domain, trạng thái ⚠️/✅) trong cùng commit.
