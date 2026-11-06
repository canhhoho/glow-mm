# Kế hoạch tối ưu quy trình và web bán hàng T&C Cosmetics

Bản giao việc chi tiết D4 → D9 (cho Codex): [ke-hoach-codex-d4-d9.md](ke-hoach-codex-d4-d9.md).

Ngày lập: 05/11/2026. Rà soát đối chiếu code: 05/11/2026 (bổ sung đợt DQ, DT; D3 rút gọn thành D3-lite; D5 dùng bảng sự kiện tự ghi). Trạng thái: đã triển khai các phần đủ điều kiện trên local/test; các đoạn Trạng thái và `nghiem-thu-d4-d9.md` ghi kết quả, phần chờ và giới hạn nghiệm thu. Chưa cập nhật production.

## 1. Mục tiêu và ranh giới

Tạo một quy trình thống nhất từ hồ sơ sản phẩm → hàng thực nhận → giá bán → mở bán → đơn hàng → soạn hàng → vận chuyển → tiền về → sau bán.

Ba kết quả ưu tiên:

1. Không dùng dữ liệu chưa được xác nhận để tính giá hoặc xuất hàng.
2. Nhân viên biết việc tiếp theo và điều kiện hoàn thành, không phải tự ghép các menu.
3. Chủ shop phân biệt được số hàng, số đơn, lợi nhuận có đủ dữ liệu và tiền đã thực nhận.

Giữ Next.js, PostgreSQL, Prisma, Server Actions, Better Auth, các adapter và ba ngôn ngữ admin hiện có. Không viết lại toàn bộ web. API vận chuyển, cổng thanh toán, OTP trả phí và hệ thống kế toán đầy đủ là phạm vi riêng, chưa mặc định tích hợp trong đợt này.

Tài liệu này bổ sung cho PLAN.md. Một số phần đầu của PLAN.md mô tả luồng cũ như PACKING, phí giao theo vùng và công thức giá cũ; khi triển khai phải đối chiếu code hiện tại và cập nhật tài liệu liên quan. Không dùng mô tả cũ để khôi phục hành vi đã thay đổi.

**Điều kiện tiên quyết:** phần giá vốn tạm/chống cộng trùng cước (migration `20261105090000_estimated_inventory_cost`, `src/server/inventory/cost.ts`, `estimate.ts` và các file sửa kèm) hiện **chưa commit**. Chạy `npm test`, commit trên `dev` trước khi bắt đầu DQ/D0 để mọi đợt sau có điểm xuất phát rõ.

## 2. Hiện trạng đã xác nhận từ code

| Nghiệp vụ | Đã có | Cần hoàn thiện |
|---|---|---|
| Sản phẩm | Tạo tay, sao chép, import Excel/CSV, biến thể, SKU, ảnh, MY/EN, kho bán | Kiểm tra sẵn sàng mở bán; tiến trình hoàn thiện sản phẩm |
| Nhập hàng | Phiếu nháp/ghi sổ, số lô, hạn, dán Excel, tồn đầu kỳ | Hướng dẫn bước tiếp theo; phân biệt lô NSX với đợt nhập khi giá khác |
| Giá bán | Hai công thức theo kho, xem trước, áp dụng, lịch sử; chống ghi đè theo giá cũ lúc xem trước | Nguồn giá đang chọn lô theo `Batch.createdAt` — lô của phiếu nháp/huỷ vẫn được dùng; combo thiếu vốn bị bỏ qua âm thầm; áp dụng một phần dòng khoá cả run; chưa có fingerprint/hạn preview |
| Giá vốn | Thực tế, tạm tính và thiếu; lưu trạng thái trên phân bổ đơn | Kiểm kê dữ liệu cũ; quy trình hoàn thiện chi phí thực tế |
| Cửa hàng | Danh mục, tìm kiếm, bộ sưu tập, banner, SEO, đánh giá; liên hệ Viber/Messenger qua env | Đang lấy 60 SP mới nhất rồi sort giá trong JS, chưa phân trang/đếm tổng thật; ảnh SP tĩnh (thumbnail không đổi ảnh lớn); chưa có công cụ đo nào |
| Đặt hàng | Bắt buộc tài khoản, SĐT/mật khẩu, Google/email tùy cấu hình; COD/chuyển khoản | **Server chưa chặn giá 0** (chỉ chặn âm); form checkout không điều khiển → mất dữ liệu đã nhập khi action trả lỗi; thử nghiệm mua không cần tài khoản |
| Tồn bán | Đúng kho của SP, đúng loại tồn, hạn hợp lệ, trừ giữ hàng | Đồng nhất việc soạn hàng thực tế với lô xuất |
| Vận chuyển | Xuất Excel VTP chọn nhiều đơn; nhập mã vận đơn từng đơn lúc bàn giao | Chưa có phiếu soạn; xác nhận/in nhãn/bàn giao/hoàn tất đều từng đơn một (≈4–5 lần mở trang chi tiết mỗi đơn COD); mã vận đơn không sửa được sau bàn giao; người trả cước chỉ chọn lúc xuất Excel, không lưu trên đơn |
| COD | Hoàn tất thu khách và đối soát tiền về riêng (một lần, đủ tiền); trang hàng đợi COD có nhãn chờ/ngoại lệ | Phí hãng chưa vào báo cáo; cột số ngày nợ; đối soát từ file; đơn có trả hàng chưa đối soát được |
| Trả hàng | Về Chờ kiểm tra, nhập lại/xuất hủy, giảm doanh thu/giá vốn | Quy trình ngoại lệ tiền hàng, tiền hoàn và đối soát |
| CTV | Giới thiệu, hai tầng, hạn chờ (mặc định 7 ngày sau COMPLETED), ghi nhận chi trả, bù trừ âm khi hoàn sau chi | Chính sách chi khi tiền COD về, bảo toàn lịch sử chi cũ |
| Hệ thống | Phân quyền, audit, cron, kiểm thử, backup/runbook | Đồng bộ hướng dẫn, giám sát lỗi vận hành, diễn tập nghiệm thu |

Phần giá vốn tạm và chống cộng trùng cước đã được làm trước kế hoạch này (chưa commit, xem điều kiện tiên quyết ở §1). Migration 20261105090000_estimated_inventory_cost đã áp trên local và test; chưa xem đó là bằng chứng production đã cập nhật. Migration chỉ huỷ các bản xem trước đang mở; **các run đã APPLIED trước bản sửa có thể đã cộng cước hai lần** — D0 liệt kê để duyệt, không tự sửa. Không làm lại hoặc tự sửa số liệu lịch sử. Trạng thái vốn trong code là enum `CostStatus` = `ACTUAL` / `ESTIMATED` / `MISSING` (thực tế / tạm tính / thiếu).

## 3. Quy trình vận hành đích

### 3.1 Chuẩn bị một lần

Admin thiết lập kho, phương thức giá, danh mục, thương hiệu, tỷ giá, thông tin nhận chuyển khoản, địa chỉ VTP, thời hạn giữ đơn, ngưỡng hạn dùng và nhân viên.

Kết quả: có thể tạo một sản phẩm mẫu, nhập thử, tính giá, đặt COD/chuyển khoản và xử lý hoàn hàng trên môi trường test.

### 3.2 Đưa sản phẩm mới lên bán

1. Tạo sản phẩm ẩn; khai báo SKU, biến thể, kho, loại tiền, khối lượng, chính sách hạn dùng.
2. Nhập hàng; kiểm số thực nhận, lô, hạn, giá mua; lưu nháp rồi ghi sổ.
3. Kiểm tra giá vốn thực tế/tạm tính/thiếu. Thiếu dữ liệu phải hiện rõ.
4. Tính giá bằng giá mua từ phiếu nhập đã ghi sổ; xem trước, duyệt rồi áp dụng.
5. Bổ sung ảnh, nội dung, thông tin giao hàng và liên hệ.
6. Kiểm tra điều kiện mở bán; sửa lỗi chặn và xem cảnh báo.
7. Bật hiển thị; kiểm tra trang khách trên điện thoại; đưa vào bộ sưu tập nếu cần.

Nhập hàng lần đầu số lượng lớn dùng workbook sản phẩm + tồn đầu kỳ. Nhập bổ sung SKU cũ dùng phiếu nhập; không dùng lại workbook tạo mới để tăng tồn.

> Cập nhật 06/11/2026: workbook hai sheet đã thay bằng file Excel một sheet (mỗi dòng một SKU) vừa tạo mới, vừa cập nhật, vừa nhập tồn tuỳ chọn thành phiếu nhập nháp — kể cả SKU đã có. Nhập lại một file đã nhập tồn bị chặn; nhập bổ sung lẻ vẫn nên dùng phiếu nhập. Xem README → "Nhập / cập nhật bằng Excel".

### 3.3 Xử lý đơn

Khách/nhân viên tạo đơn → PENDING, giữ hàng → xác nhận COD hoặc tiền chuyển khoản → chuẩn bị giao → in phiếu soạn (lô FEFO, có thể in cả loạt đơn) và lấy hàng theo phiếu → bàn giao (có thể cả loạt), xuất đúng lô trên phiếu và chụp giá vốn → SHIPPING → xác nhận giao thành công → COMPLETED → đối soát COD nếu có.

Không thêm lại bước PACKING như một bước xuất kho thứ hai. Phiếu soạn là công việc nội bộ; xuất kho vẫn chỉ xảy ra khi bàn giao. Đơn PACKING cũ giữ nhánh tương thích, không xuất thêm.

### 3.4 Ngoại lệ và sau bán

- Chưa xuất: hủy đơn, nhả giữ hàng và nhả lô đã soạn nếu có.
- Đã xuất: xử lý bằng trả hàng; hàng thực nhận về Chờ kiểm tra, không đưa ngay vào tồn bán.
- Hàng trả đạt: chuyển đúng kho của SP. Không đạt: xuất hủy có lý do.
- Hoàn tiền và COD có chênh lệch: vào hàng đợi ngoại lệ; không tự coi đã đối soát.
- Đơn hoàn tất: khách đánh giá; nhân viên duyệt. Hoa hồng chỉ chi theo chính sách đủ điều kiện.

## 4. Quy tắc nghiệp vụ xuyên suốt

| Mã | Quy tắc |
|---|---|
| R01 | Tồn chỉ thay đổi qua phiếu ghi sổ, ledger và balance trong cùng transaction. |
| R02 | Phiếu nháp/hủy không là bằng chứng nhập thực; không được làm nguồn giá mua đã xác nhận. |
| R03 | Hàng nhập VN: giá mua gốc × tỷ giá × (1 + % lãi) + cước/kg × khối lượng; cộng cước một lần. |
| R04 | Hàng MMK: giá mua MMK + lãi cố định; không tự cộng cước VN. |
| R05 | Giá vốn ưu tiên thực tế → tạm tính → thiếu. Giá vốn thiếu khác giá vốn bằng 0 hợp lệ. |
| R06 | Đơn chụp giá bán khi tạo; chụp giá vốn và trạng thái vốn khi xuất. Không tự sửa snapshot của đơn cũ. |
| R07 | Bán từ đúng kho SP; tester, UNKNOWN, lô dưới ngưỡng hạn không được đưa vào khả dụng. |
| R08 | Soạn hàng không trừ tồn; hàng thực lấy và phân bổ lô khi xuất phải trùng nhau. |
| R09 | Hoàn tất COD khác đã đối soát tiền về. |
| R10 | % lãi cộng trên giá mua khác biên lợi nhuận trên doanh thu; báo cáo phải dùng đúng nhãn. |
| R11 | Bộ sưu tập/banner không tự tạo giảm giá. |
| R12 | Kiểm tra quyền và dữ liệu ở server; chặn trên giao diện chỉ là hỗ trợ. |

## 5. Lộ trình và phụ thuộc

| Đợt | Nội dung | Phụ thuộc | Đầu ra nghiệm thu |
|---|---|---|---|
| DQ | Sửa nhanh lỗi rủi ro cao: chặn giá 0, giữ form checkout, lọc nguồn giá theo phiếu ghi sổ | Điều kiện tiên quyết §1 | Không đặt được hàng giá 0; form không mất khi lỗi; nháp/hủy không đổi giá đề xuất |
| D0 | Chốt dữ liệu nền, rà sai lệch, lập dữ liệu test | DQ | Báo cáo chỉ đọc, mẫu nghiệp vụ và mốc so sánh (gồm mốc thời gian vận hành) |
| DT | Tối ưu thao tác hằng ngày: thao tác hàng loạt, nhập file VTP, nối nhập → tính giá | D0 (mốc đo) | Số lần mở trang chi tiết mỗi đơn và thời gian đặt → bàn giao giảm so với mốc |
| D1 | Provenance nguồn giá, fingerprint, combo, áp dụng một phần | DQ, D0 | Truy được nguồn giá; preview cũ/đổi đầu vào không áp sai; combo thiếu vốn được liệt kê |
| D2 | Kiểm tra sẵn sàng mở bán | D1 | Chặn giá sai, chỉ rõ dữ liệu còn thiếu, có lối đi bước tiếp theo |
| D3-lite | Phiếu soạn FEFO và xuất đúng lô trên phiếu | D0; DT (in hàng loạt) | Lô trên phiếu soạn trùng lô xuất; dữ liệu đổi thì báo soạn lại, không xuất hai lần |
| D4 | Tiền COD, chi phí bán, hoa hồng | D0, D3-lite | Báo cáo có cơ sở rõ; chi trả theo chính sách; ngoại lệ được tách |
| D5 | Đo chuyển đổi và trải nghiệm thực (bảng sự kiện tự ghi) | D0; triển khai trước thay đổi D6 | Có dữ liệu khách đi/rời ở từng bước |
| D6 | Tối ưu đăng nhập và đặt hàng | D2, D5 | Lỗi gắn đúng trường, giữ giỏ khi đăng nhập; thử guest COD có kiểm soát |
| D7 | Danh sách hàng, nội dung và hiệu năng | D2, D5 | Sắp xếp toàn tập, phân trang, ảnh dễ xem; có số đo trước/sau |
| D8 | Hoàn thiện quản lý chuyến và đợt nhập | D1, D4 | Phân bổ theo kg, nhận biết vốn cần cập nhật, chính sách đợt nhập rõ |
| D9 | Nghiệm thu toàn tuyến và đưa vào vận hành | Các đợt thuộc phạm vi phát hành | Quy trình, kiểm thử, dữ liệu và hướng dẫn khớp nhau |

DQ là sửa lỗi nhỏ rủi ro cao, làm ngay. DT là nhóm làm nhanh hơn (giảm công thao tác), ưu tiên sớm vì hiện mọi bước xử lý đơn đều từng đơn một. D1–D4 là nhóm ưu tiên tính đúng. D5 cần có trước khi đánh giá tác động của D6–D7. D8 có thể phát hành sau nhóm lõi, không chặn cửa hàng dùng vốn tạm đúng quy tắc. Bản giữ lô đầy đủ (mục D3+ ở §9) chỉ làm khi có nhiều người soạn đồng thời.

Tách PR/đợt phát hành theo nghiệp vụ, không gom toàn bộ thay đổi vào một lần. Sau mỗi đợt có bản chạy được, bằng chứng kiểm thử và tiêu chí kiểm tra cho chủ shop.

## 5A. DQ — Sửa nhanh lỗi rủi ro cao

**Trạng thái: đã làm (05/11/2026) trên `dev`.** Điều kiện tiên quyết đã commit riêng (`1c63b14`). Lỗi giá 0 dùng mã `price_missing` (admin hiện kèm SKU); nguồn giá dùng bộ lọc chung `postedReceiveBatch` (`pricing/cost.ts`); form checkout gửi qua `onSubmit`, nút khoá đến khi hydrate. Test: `orders.test.ts`, `pricing.test.ts`, E2E `storefront-orders.spec.ts` (lỗi SĐT → dữ liệu còn nguyên).

Ba lỗi đã xác nhận trong code, sửa nhỏ, không chờ các đợt lớn:

1. **Chặn giá ≤ 0 ở server.** `orderTotals` (`src/server/orders/pricing.ts`) chỉ chặn số âm; `priceLines` (`src/server/orders/orders.ts`) chỉ kiểm tra biến thể active và SP đã đăng. Thêm kiểm tra `priceMmk > 0` cho mọi dòng bán (kể cả đơn nhân viên/CTV), trả lỗi rõ theo SKU. Quà/tester vẫn đi theo luồng riêng, không qua đường này.
2. **Giữ dữ liệu form checkout khi lỗi.** `checkout-form.tsx` dùng `useActionState` + input `defaultValue`; React 19 reset form sau action nên tên, SĐT, địa chỉ, ghi chú bị mất khi `placeOrderAction` trả `{ error }`. Trả lại giá trị đã gửi trong state (hoặc chuyển trường cần giữ sang có điều khiển). Đọc guide form/Server Action trong `node_modules/next/dist/docs/` trước khi sửa.
3. **Lọc nguồn giá theo phiếu RECEIVE đã ghi sổ.** `src/server/pricing/cost.ts` đang chọn lô mới nhất theo `Batch.createdAt`, mà lô được tạo ngay lúc tạo phiếu nháp (`inventory/documents.ts`) và không bị xoá khi huỷ phiếu. Tương tự `variantsWithoutCost`, `pricingGaps` trong `pricing/queries.ts` đếm mọi lô. Thêm điều kiện lô có dòng phiếu `RECEIVE` + `POSTED` (cùng điều kiện `shipments.ts`, `estimate.ts` đang dùng). Phần thứ tự theo `postedAt`, provenance, fingerprint để lại D1.

Nghiệm thu: test regression cho từng mục (unit/integration cho 1 và 3, E2E mobile cho 2); `npm test` xanh.

## 6. D0 — Dữ liệu nền và mốc kiểm chứng

**Trạng thái: đã làm (05/11/2026)** dạng trang admin `/admin/reports/data-health` (tab "Sức khoẻ dữ liệu" trong Báo cáo, quyền `reports:view`), domain `src/server/reports/data-health.ts`, tải mốc JSON qua `GET /api/admin/reports/data-health?days=30|90`. Gồm 16 mục kiểm tra (sản phẩm, giá vốn/nguồn giá, vận hành) và mốc: thời gian đặt → xác nhận → bàn giao → hoàn tất (p50/p90), ghi sổ nhập → đổi giá, đơn theo trạng thái, tuổi nợ COD, hoa hồng đã chi. Chưa làm: fixture đại diện riêng (dùng fixture integration sẵn có), kiểm tra backup/restore (việc của người vận hành server). Cần chạy trên production và lưu file JSON làm mốc trước khi bật DT.

### Công việc

- Lập báo cáo chỉ đọc: sản phẩm giá 0, thiếu ảnh/khối lượng, kho không hợp lệ; lô có tồn nhưng thiếu vốn; SKU chỉ có lô từ nháp/hủy; đơn giữ hàng lâu; COD chưa về; hàng trả chưa kiểm tra.
- Đọc cấu hình đang lưu, không coi giá trị mặc định trong code là cấu hình thực tế.
- Phân biệt dữ liệu test/local với production. Không lấy báo cáo DB test tích lũy làm kết quả kinh doanh thật.
- Liệt kê để duyệt (không tự sửa): run giá đã APPLIED trước bản sửa cước có `shipMmkPerKg` (có thể đã cộng cước hai lần); combo bị bỏ qua khi tính giá vì thiếu vốn thành phần; lô được dùng lại ở phiếu nhập ghi chuyến khác với chuyến của lô; đơn COD có trả hàng chưa đối soát được.
- Lưu mốc tổng tồn theo kho/SKU/lô, đơn theo trạng thái và snapshot vốn đơn, công nợ COD, hoa hồng đã chi.
- Lưu mốc thời gian vận hành từ dữ liệu sẵn có: `OrderStatusHistory` (tạo → xác nhận → SHIPPING đầu tiên → COMPLETED), `Delivery.shippedAt`, `codCollectedAt` → `codRemittedAt`, ghi sổ phiếu nhập → lần áp giá kế tiếp cho SKU đó.
- Tạo fixture đại diện: VN, MMK, combo, tester, UNKNOWN, hai lô khác hạn, đơn nhiều kho, hoàn một phần, phí COD, vốn tạm.
- Kiểm tra khả năng backup/restore ở môi trường dùng để thử phát hành.

### Nghiệm thu

Chạy báo cáo không làm đổi dữ liệu. Có danh sách lỗi để người phụ trách xử lý, không tự điền khối lượng, giá hay cước bằng phỏng đoán.

## 6A. DT — Tối ưu thao tác hằng ngày

**Phần DT/D2/D3 còn dở: đã bổ sung local (05/11/2026).** Sửa vận đơn có quyền/audit; link tính giá riêng SKU trong phiếu nhập POSTED (hỗ trợ variantIds và giao bộ lọc, không fallback toàn kho); lọc ngày Yangon/kho, tổng thật và 50 đơn/trang, dashboard giao từ 7 ngày; hiện manifest trên đơn và cảnh báo xuất/chuyển nội bộ liên quan phiếu chưa bàn giao. Preview giá cảnh báo biến động ≥20% và lãi minh họa sau cước/hoa hồng mặc định ≤5%; không đổi chính sách CTV. Phân bổ lưu phương pháp và kết quả trong cùng transaction, lịch sử có tên người và kết quả từng lô. Integration DT/picking/pricing/reports 14 ca đạt; E2E admin-orders/bulk-orders đạt trong lần chạy đầy đủ. Import file VTP vẫn chờ mẫu thật. Xem `nghiem-thu-d4-d9.md` để biết kết quả cuối và các điều kiện còn mở.

**DT.2 đã làm trước đợt D4–D9 (05/11/2026).** Danh sách đơn có ô chọn + thanh thao tác: xác nhận COD / bàn giao (hãng mặc định VTP) / giao thành công hàng loạt (`orders/bulk.ts`, mỗi đơn một transaction, tối đa 100 đơn, báo kết quả từng đơn), in nhãn A6 hàng loạt (`/admin/orders/print-labels?ids=`) và phiếu lấy hàng gộp theo kho + SKU, combo bung thành phần (`/admin/orders/pick-list?ids=`, `orders/pick-list.ts`). Không làm huỷ / xác nhận chuyển khoản hàng loạt (cần xem từng đơn). Bàn giao hàng loạt không nhập mã vận đơn; mã vận đơn nay sửa được sau bàn giao theo bổ sung DT.3.

Hiện trạng: mỗi đơn COD cần mở trang chi tiết khoảng 4–5 lần (xác nhận, in nhãn, bàn giao, hoàn tất, đối soát COD); danh sách đơn không chọn nhiều được; chỉ xuất Excel VTP là chọn nhiều đơn (và không đổi trạng thái/tồn). Đợt này giảm số lần thao tác, không đổi quy tắc nghiệp vụ.

### DT.1 Khảo sát và mốc đo

- Một buổi với kho và nhân viên đơn: bước nào tốn công nhất, lặp nhiều nhất, hay sai nhất; xếp thứ tự các mục DT.2–DT.6 theo kết quả này.
- Dùng mốc thời gian D0. Chỉ số: số lần mở trang chi tiết mỗi đơn, thời gian tạo → bàn giao (p50/p90), thời gian ghi sổ nhập → áp giá.

### DT.2 Thao tác hàng loạt trên danh sách đơn

- Checkbox chọn nhiều đơn ở `orders/page.tsx`; hành động theo trạng thái: xác nhận COD, in nhãn + phiếu soạn (một lần in cho cả loạt), bàn giao (hãng mặc định VTP, mã vận đơn có thể nhập sau), hoàn tất.
- Mỗi đơn vẫn đi qua `orders/transitions.ts` (khoá `FOR UPDATE`, state machine, xuất kho) trong transaction **riêng**; cho thành công một phần và trả kết quả từng đơn (đơn nào lỗi, vì sao). Không gộp nhiều đơn vào một transaction.
- Server action nhận danh sách id có giới hạn số lượng, validate Zod, `requirePermission` theo từng loại chuyển trạng thái.
- Không thêm cron tự hoàn tất đơn: hoàn tất COD đồng thời ghi nhận hãng đã thu tiền, tự động dễ sai.

### DT.3 Mã vận đơn

- Cho sửa mã vận đơn sau bàn giao (hiện chỉ ghi một lần lúc ship), có audit.
- Nhập hàng loạt từ file VTP, khớp theo mã đơn; xem trước dòng khớp/không khớp rồi mới ghi. **[CẦN XÁC MINH]** định dạng file VTP trả về — cần file mẫu thật.

### DT.4 Đối soát COD từ file

- Nhập file chuyển tiền của VTP: xem trước số phải thu / thực nhận / phí / mã tham chiếu theo đơn; xác nhận thì mỗi dòng vẫn gọi `orders/cod.ts` (quy tắc đủ tiền một lần giữ nguyên). Dòng lệch, đơn có trả hàng, đơn chưa hoàn tất → hàng đợi ngoại lệ, không ghi. **[CẦN XÁC MINH]** định dạng file.
- Trang `orders/cod` thêm cột số ngày từ `codCollectedAt`.

### DT.5 Nối nhập hàng → tính giá

- Sau khi ghi sổ phiếu RECEIVE, hiện nút "Tính giá SKU vừa nhập": tạo bản xem trước chỉ gồm các biến thể (và combo chứa chúng) của phiếu. Thêm phạm vi `variantIds` vào `previewSchema` (`pricing/runs.ts`); vẫn xem trước → duyệt → áp dụng như cũ.

### DT.6 Danh sách đơn và bảng điều khiển

- Lọc theo khoảng ngày và kho; phân trang thay cho giới hạn 200 dòng.
- Bảng điều khiển (`workQueue`) thêm ô "đang giao quá N ngày".

### Nghiệm thu

Integration: hàng loạt có đơn lỗi giữa chừng → đơn khác vẫn đúng, không xuất hai lần, ledger khớp balance; quyền từng hành động. E2E desktop cho chọn nhiều + in. So số đo với mốc D0 sau 1–2 tuần vận hành.

File: `orders/actions.ts`, `transitions.ts`, `cod.ts`, `admin-queries.ts`, `reports/queries.ts` (`workQueue`); trang `orders`, `orders/cod`, `(print)/orders`; `pricing/runs.ts`, trang inventory documents; messages vi/en/my.

## 7. D1 — Chọn đúng nguồn giá mua

**Trạng thái: đã làm (05/11/2026)**, migration `20261105120000_d1_price_provenance`. Quyết định của chủ shop: khối lượng combo = của combo, chưa khai báo thì cộng thành phần; bản xem trước hết hạn sau `pricing.previewDays` (mặc định 3 ngày, sửa ở Cài đặt); áp dụng một phần thì bản vẫn mở cho dòng còn chờ.
- `pricing/cost.ts`: nguồn = dòng phiếu RECEIVE đã POSTED mới nhất theo `postedAt` → phiếu → dòng; trả kèm lô, phiếu, ngày ghi sổ; combo kèm nguồn từng thành phần.
- `pricing/runs.ts`: `computeLines` dùng chung cho xem trước và áp dụng; mỗi dòng lưu nguồn, khối lượng đã dùng, fingerprint; `PriceRunLine.status` PENDING/APPLIED/SKIPPED + `skipReason`; `PriceUpdateRun.formulaVersion = 2`, `expiresAt`, `skipped` (biến thể không tính được + lý do). Áp dụng tính lại fingerprint, khác thì bỏ qua `INPUT_CHANGED`; bản cũ (version 1 / không hạn) không áp được nữa. Huỷ bản đã áp một phần giữ dòng đã áp.
- `pricingGaps` liệt kê cả combo thiếu vốn; khối lượng combo tính theo quy ước trên.
- Migration: dòng của run đã áp dụng có lịch sử giá → APPLIED, còn lại của run đã đóng → SKIPPED `LEGACY`.

### D1.1 Nguồn dữ liệu

- Thay truy vấn chỉ dựa trên Batch.createdAt bằng dòng phiếu RECEIVE đã POSTED, có batch và số lượng dương.
- Chọn theo mốc nhập ghi sổ gần nhất, có thứ tự phụ ổn định khi trùng thời gian. Dùng postedAt, định danh phiếu và định danh dòng để kết quả không thay đổi ngẫu nhiên.
- Batch có thể được dùng lại trong nhiều phiếu; lô tạo trước nhưng vừa được nhập lại phải được xét theo lần nhập đã ghi sổ, không theo ngày tạo batch.
- Lọc đúng loại tiền; lô giá mua 0 hợp lệ vẫn có thể là nguồn vốn.
- Giữ hai lựa chọn rõ ràng: PURCHASE cho VN_IMPORT; LANDED cho nhánh cũ không có cước/kg. Kho MMK lấy giá mua MMK.
- Bộ lọc POSTED đã làm ở DQ; D1 bổ sung thứ tự theo `postedAt` và provenance.
- Combo tính từ nguồn hợp lệ của từng thành phần; thiếu một thành phần thì không tạo giá giả bằng 0. Hiện combo thiếu vốn bị bỏ qua âm thầm (`runs.ts`) và `pricingGaps` không liệt kê combo → phải hiện trong danh sách thiếu và trong preview.
- Chốt quy ước khối lượng combo cho VN_IMPORT: hiện dùng `weightGrams` của chính combo, không phải tổng thành phần. Đề xuất: dùng tổng thành phần khi combo chưa khai báo khối lượng, cảnh báo khi hai số lệch nhiều.

### D1.2 Minh bạch và bản xem trước

- Kết quả nguồn giá gồm giá mua, batch, phiếu nhập, ngày ghi sổ; hiển thị trong bản xem trước khi cần xem chi tiết.
- Thêm phiên bản công thức/nguồn giá cho lần tính mới; bản cũ giữ nguyên lịch sử hiển thị.
- Khi áp dụng, kiểm tra lại fingerprint đầu vào liên quan: nguồn giá, công thức, khối lượng, định nghĩa combo, kho/cách tính. Có thay đổi thì yêu cầu tạo lại các dòng bị ảnh hưởng.
- Giá cũ thay đổi sau xem trước tiếp tục được xử lý theo cơ chế chống ghi đè hiện có.
- Sửa lỗi áp dụng một phần: hiện `applyRun` áp các dòng được chọn nhưng chuyển cả run sang APPLIED, các dòng chưa chọn không áp được nữa. Lưu trạng thái theo dòng (đã áp/bỏ qua/còn chờ) hoặc cho tạo lại run từ các dòng còn chờ.
- Bản xem trước có hạn dùng cấu hình được; quá hạn phải tạo lại.
- Khi phát hành, các preview bị ảnh hưởng bởi cách chọn nguồn cũ phải được nhận diện và yêu cầu tính lại; giá đã áp dụng không tự thay.

### File dự kiến

`src/server/pricing/cost.ts`, `runs.ts`, `queries.ts`; trang pricing/runs/[id]; Prisma nếu lưu provenance/fingerprint; messages; tests/integration/pricing.test.ts.

### Kiểm thử và nghiệm thu

1. Lô mới ở phiếu nháp giá cao không đổi giá đề xuất.
2. Phiếu hủy không là nguồn giá; ghi sổ phiếu hợp lệ thì nguồn thay đổi.
3. Nhập lại batch cũ sau batch mới vẫn chọn đúng lần ghi sổ gần nhất.
4. Giá 0, MMK, combo và nhánh cũ đúng; thiếu nguồn (kể cả combo) được báo rõ.
5. Sau phân bổ chuyến, giá VN_IMPORT không bị cộng cước hai lần.
6. Preview cũ, quá hạn hoặc đầu vào thay đổi không được áp dụng âm thầm.
7. Áp dụng một phần dòng, các dòng còn lại vẫn áp được sau đó.

## 8. D2 — Sẵn sàng mở bán và hướng dẫn công việc

**Trạng thái: đã làm (05/11/2026).** Quyết định của chủ shop khác đề xuất ban đầu: **thiếu ảnh chỉ cảnh báo** (không chặn); SP **đang hiển thị** vẫn lưu được khi còn lỗi, chỉ chặn giá ≤ 0 / không còn biến thể đang dùng.
- Quy tắc thuần `catalog/readiness-rules.ts` (lỗi: không biến thể đang dùng, kho không bán, giá ≤ 0, thiếu khối lượng ở kho VN_IMPORT — combo chưa khai báo thì cộng thành phần; cảnh báo: chưa/ít ảnh, ảnh đại diện thiếu alt, thiếu mô tả/cách dùng, thiếu khối lượng ở kho MMK, tồn thiếu vốn / vốn tạm, hết hàng, tồn ở kho bán khác). Nạp dữ liệu theo lô `catalog/readiness.ts` (`loadReadiness`).
- Chặn ở server: `saveProduct` (trong transaction, rollback cả SP) và `setProductsPublished` (bật phần hợp lệ, trả `blocked` kèm lý do). Danh sách SP có trạng thái Cần hoàn thiện / Có thể mở bán / Đang hiển thị / Ngừng kinh doanh + bộ lọc; trang SP có checklist và các bước Thêm ảnh → Nhập hàng → Tính giá → Xem như khách → Mở bán.
- Chưa làm: cảnh báo "giá biến động lớn / lãi sau hoa hồng thấp", danh sách việc còn thiếu sau import (import vẫn tạo SP ẩn; trạng thái hiện ở danh sách).

### D2.1 Một bộ kiểm tra dùng chung

Xây service trả về `errors` (chặn) và `warnings` (cho phép nhưng cần biết), kèm SKU, lý do và liên kết xử lý. Tái sử dụng cho tạo/sửa, đăng hàng loạt, danh sách sản phẩm và trang chi tiết; không gọi một truy vấn DB cho mỗi SKU trong danh sách lớn.

| Nhóm | Lỗi chặn đề xuất | Cảnh báo đề xuất |
|---|---|---|
| Hồ sơ | Không có biến thể active; SKU không hợp lệ; kho bán không hợp lệ | Nội dung mô tả/cách dùng chưa đầy đủ |
| Giá | Biến thể active có giá bán ≤ 0 | Giá vốn thiếu/tạm tính; giá biến động lớn hoặc lãi sau hoa hồng thấp |
| Hình ảnh | Không có ảnh đại diện | Ít ảnh; thiếu ảnh nhãn/bao bì hoặc alt phù hợp |
| Khối lượng | Kho `VN_IMPORT`: biến thể active chưa có khối lượng > 0 (cần cho công thức giá) | Kho `LOCAL_MMK` thiếu khối lượng (chỉ cần cho VTP); chưa kiểm chứng khối lượng đóng gói |
| Tồn và hạn | Giữ nguyên các chặn mua hàng hiện có | Hết hàng, chỉ còn UNKNOWN, cận hạn, tồn ở kho khác |

Sản phẩm hết hàng vẫn được đăng để giới thiệu và giữ URL; không mở chế độ đặt trước trong đợt này. Giá mua 0 không đồng nghĩa giá bán 0. Quà/tester tiếp tục theo quy trình riêng, không mở lỗ hổng mua hàng giá 0.

### D2.2 Màn hình

- Danh sách SP có trạng thái: Cần hoàn thiện / Có thể mở bán / Đang hiển thị / Đang ẩn / Ngừng kinh doanh, suy ra từ dữ liệu hiện có.
- Chi tiết SP có checklist và hành động tiếp: Thêm ảnh → Nhập hàng → Tính giá → Xem như khách → Mở bán.
- Import vẫn tạo hàng ẩn; sau xác nhận có danh sách liên kết đến phiếu nhập và các việc còn thiếu.
- Đăng hàng loạt: trả kết quả rõ từng sản phẩm; không chỉ báo thành công chung. Thực hiện phần hợp lệ và liệt kê phần bị chặn.
- Luồng mua tại server kiểm tra giá bán > 0 đã làm ở DQ; D2 thêm kiểm tra ở giao diện và cổng mở bán, kể cả SP đã được đăng từ trước hoặc cache chưa cập nhật.
- Đăng/ẩn SP gọi `updateTag(CATALOG_TAG)` như các action catalog hiện có.
- Với hàng đang đăng nhưng phát hiện thiếu hồ sơ, hiển thị cảnh báo xử lý; không tự ẩn hàng loạt dữ liệu cũ.

### File và kiểm thử

Service mới `src/server/catalog/readiness.ts`; `products.ts`, `actions.ts`, `admin-queries.ts`; product-form, product-bulk-publish, các trang products; orders/orders.ts; messages vi/en/my.

Kiểm tra tạo/sửa/publish hàng loạt đều không vượt gate; trực tiếp gọi server không bỏ qua; không bán giá 0; hết tồn vẫn có trang nhưng không mua được; có cảnh báo chi phí đúng; cả ba ngôn ngữ không mất khóa dịch.

## 9. D3 — Soạn hàng và bàn giao đúng lô

**Trạng thái D3-lite: đã làm (05/11/2026)**, migration `20261105150000_d3_order_pick` (`OrderPick` + `OrderPickLine`, khoá chính theo đơn — in lại thay toàn bộ dòng). Domain `orders/picking.ts`: `planPicks` (FEFO dùng chung `allocateFefo` với xuất kho, các đơn in cùng lúc chia tồn từng lô, trừ phần đã nằm trên phiếu chưa bàn giao của đơn khác), `savePickManifests` (khoá đơn, kế hoạch phải trùng `hash` của phiếu đang xem), `manifestPicks` (lúc bàn giao: khoá số dư lô, kiểm nhu cầu đơn / đủ hàng / còn hạn bán; lệch → `pick_mismatch`, rollback). Trang `/admin/orders/pick-list` có cột Lô/HSD, nút "Chốt lô & In". Cài đặt `orders.requirePickList` (mặc định tắt) bắt buộc phiếu soạn trước khi bàn giao. Bổ sung trong đợt D4–D9: đã hiện phiếu soạn trên trang chi tiết đơn và cảnh báo khi phiếu xuất/chuyển nội bộ liên quan SKU trên phiếu chưa bàn giao; lệch tồn vẫn phải in lại.

Hiện trạng trước D3-lite: chưa có phiếu soạn; phiếu in duy nhất là nhãn A6 ghi số món; lô chỉ thấy trên đơn sau khi đã xuất. Làm **D3-lite** trước; bản giữ lô đầy đủ (D3+) chỉ làm khi có nhiều người soạn đồng thời hoặc D3-lite cho thấy hay phải soạn lại.

### D3-lite.1 Thiết kế

- In phiếu soạn cho một hoặc nhiều đơn đã xác nhận (in hàng loạt dùng chung DT.2): chia nhóm theo kho; mỗi dòng SKU, tên, số lượng, số lô, hạn, khối lượng; combo bung thành phần.
- Lô đề xuất tính bằng chính hàm FEFO đang dùng khi xuất (`candidatesAt` + `pickFefo` trong `transitions.ts`), cùng điều kiện hạn dùng/kho/loại tồn.
- Khi in, lưu **manifest** (đơn, biến thể, lô, kho, số lượng, thời điểm in, người in). Manifest không giữ lô, không ảnh hưởng tồn bán. In lại thì manifest mới thay manifest cũ.
- Khi bàn giao: trong cùng transaction xuất kho hiện có, khoá balance các lô trên manifest; nếu mọi dòng vẫn hợp lệ (đủ hàng, hạn, kho, nhu cầu đơn không đổi) thì xuất **đúng các lô trên manifest**. Không hợp lệ → dừng, báo dòng nào lệch, yêu cầu in lại phiếu soạn; không âm thầm đổi sang lô khác.
- Đơn chưa có manifest (ví dụ đơn cũ, hoặc chưa in) vẫn xuất theo FEFO như hiện tại để không chặn vận hành; có cờ cấu hình để bắt buộc phiếu soạn sau khi kho đã quen.
- Đơn nhiều kho: phiếu chia phần theo kho, in rõ kho nguồn; bàn giao một kiện như hiện tại (mỗi kho một phiếu ISSUE). Chưa làm giao một phần.
- Đơn PACKING cũ không tạo thêm phiếu xuất.

### D3-lite.2 File và nghiệm thu

Prisma + migration (bảng manifest), `orders/picking.ts`, `transitions.ts` (`issueOrderStock` nhận manifest), trang in `(print)/orders`, trang đơn, messages.

Kiểm tra: lô xuất trùng manifest; lô trên manifest bị đơn khác/xuất nội bộ lấy mất → báo soạn lại, rollback, không xuất một phần; nhu cầu đơn đổi sau khi in → báo; combo, hai kho, hạn thay đổi giữa in và giao; đơn không manifest vẫn xuất FEFO; ledger khớp balance.

### D3+ — Giữ lô đầy đủ (để sau, chỉ khi cần)

Thiết kế dưới đây giữ làm hướng mở rộng; không làm trong đợt chính.

#### D3+.1 Thiết kế nghiệp vụ

- Giữ trạng thái đơn chính hiện tại; thêm phiếu soạn nội bộ với người tạo/xác nhận và phiên bản.
- Phiếu soạn chỉ được tạo cho đơn đã xác nhận; chia nhóm theo kho và hiện SKU, số lượng, số lô, hạn, khối lượng.
- Tính đề xuất FEFO bằng chính quy tắc xuất hàng hiện tại, gồm combo và hạn dùng.
- Chỉ khi xác nhận soạn mới tạo quyền giữ lô của phiếu soạn. Phiếu nháp không giữ lô và có thể thay đổi.
- Nhân viên có quyền kho xác nhận soạn; người có quyền bàn giao vẫn thực hiện ship. Admin có cả hai quyền; không dùng nút xuất kho hai lần.

#### D3+.2 Dữ liệu dự kiến

- `OrderPick`: order, revision, status DRAFT/VERIFIED/INVALIDATED/CONSUMED/RELEASED, người và thời điểm thao tác, fingerprint nhu cầu.
- `OrderPickLine`: pick, orderItem, variant, batch, location, qty, snapshot lô/hạn để in; chỉ một revision được active cho mỗi đơn.
- Các dòng VERIFIED đóng vai trò giữ hàng theo lô. Reservation cấp biến thể vẫn giữ nguyên cho storefront; không trừ đồng thời hai loại giữ khi tính tồn bán.
- Khi chọn lô cho đơn khác, trừ các dòng soạn VERIFIED của đơn khác để hai người không cùng xác nhận lấy phần hàng cuối của một lô.
- Cần cơ chế unique/khóa thích hợp để không có hai revision active khi xác nhận đồng thời.

#### D3+.3 Transaction và thao tác

- Xác nhận soạn: khóa đơn, variant và balance liên quan theo thứ tự cố định; kiểm tra giữ hàng, nguồn kho, hạn, đủ số lượng và quyền giữ lô khác trước khi ghi VERIFIED.
- Ship: kiểm tra revision/fingerprint, lô vẫn đủ điều kiện, số lượng đúng, rồi tạo phiếu xuất đúng các dòng đã xác nhận. Ghi ledger, OrderAllocation, CONSUMED của pick/reservation, delivery và trạng thái đơn trong cùng transaction.
- Dữ liệu đã thay đổi hoặc lô không đủ điều kiện: báo rõ, yêu cầu soạn lại; không âm thầm đổi sang lô khác sau khi nhân viên đã lấy hàng.
- Hủy đơn, đổi dữ liệu liên quan hoặc hủy soạn: giải phóng quyền giữ lô; giữ lịch sử phiếu cũ.
- Khi hết hạn hoặc điều kiện kho thay đổi, quyền giữ lô không cho phép xuất lô bị chặn. Có hàng đợi phiếu soạn cần xử lý lại.
- Các phiếu xuất nội bộ vẫn phải kiểm tra phần hàng đang dành cho pick của đơn; không để xuất nội bộ lấy hết lô đã soạn. Thiết kế quyền giải phóng/soạn lại trước khi lấy hàng đó.

#### D3+.4 Nhiều kho và đơn cũ

- Đơn nhiều kho có các phần soạn riêng; chỉ bàn giao một kiện khi đã xác nhận gom đủ các phần. In rõ kho nguồn.
- Chưa triển khai chia một đơn thành nhiều vận đơn/giao một phần; nếu cần, lập phạm vi riêng trước khi thay dữ liệu Delivery.
- Đơn PACKING cũ không tạo thêm phiếu xuất. Đơn xác nhận trước ngày phát hành chưa xuất cần tạo phiếu soạn theo quy trình mới.

#### D3+.5 File và nghiệm thu

Prisma + migration; service `orders/picking.ts`; transitions.ts, reservations.ts, availability.ts, inventory/ledger.ts và các luồng xuất nội bộ liên quan; trang đơn/phiếu in; roles.ts; tests orders, returns, inventory và handover.

Kiểm tra hai đơn soạn cùng lô, soạn đồng thời, ship lặp, hủy soạn, hủy đơn, combo, hai kho, hạn thay đổi, xuất nội bộ, rollback do thiếu hàng và đơn PACKING cũ. Đối chiếu độc lập tổng ledger với balance; lô trên phiếu soạn phải trùng lô trong OrderAllocation.

## 10. D4 — COD, chi phí bán và hoa hồng

**Trạng thái: đã triển khai D4.1–D4.3 trên local (05/11/2026).** Migration `20261105180000_d4_cod_shipping_payer`: lưu người trả cước trên đơn, khoản giảm thu và lý do đóng ngoại lệ COD. VTP mặc định theo từng đơn; sửa người trả cước chỉ khi chuẩn bị giao, có audit. Hàng đợi có lọc và tuổi nợ. Báo cáo thêm phí COD và lợi nhuận sau chi phí đã ghi nhận, không cộng tiền đối soát vào doanh thu. Chủ shop đã duyệt công thức ngoại lệ `tiền về + phí + giảm thu = COD gốc`; **yêu cầu giữ chính sách hoa hồng hiện tại**, vì vậy không thêm/bật gate `affiliate.requireCodRemitted`. Kiểm tra đạt: lint, typecheck, 29 unit liên quan, 53 integration liên quan; E2E admin-orders, cod-exception và dashboard-reports đã đạt sau khi sửa locator bài mới và chờ đúng nội dung dashboard đang stream. CI của bản bàn giao chưa xác minh được do kết nối GitHub thất bại; chưa cập nhật production.

### D4.1 Dòng tiền

- Hiển thị tách trạng thái đơn, trạng thái thanh toán và trạng thái đối soát COD.
- Mở rộng trang hàng đợi COD hiện có (`admin/(panel)/orders/cod`, đã có nhãn chờ/ngoại lệ, sắp theo ngày hãng thu): số phải thu, đã về, phí, ngày hãng thu và số ngày chưa chuyển về (cột số ngày làm ở DT.4).
- Giữ đối soát đầy đủ một lần hiện có; không cho nhập thiếu tiền rồi coi đã xong.
- Đơn hoàn hàng/hoàn tiền/chênh lệch vào hàng đợi ngoại lệ, có người xử lý, ghi chú và tài liệu; không tự suy ra số tiền hãng còn nợ. Hiện `cod.ts` chỉ đối soát đơn không có trả hàng → cần lối đóng ngoại lệ cho đơn hoàn một phần (ghi số thực nhận, lý do, người duyệt) trước khi bật gate chi CTV ở D4.3.
- Người trả cước VTP hiện chỉ chọn lúc xuất Excel (mặc định người nhận), không lưu trên đơn: thêm trường người trả cước trên đơn, xuất Excel đọc từ đó; đồng nhất với thông báo cho khách; cho thấy rõ nếu nhân viên chọn cửa hàng trả thay.

### D4.2 Báo cáo lợi nhuận

Phân biệt ba mức:

1. Lợi nhuận gộp = doanh thu thuần − giá vốn đã chụp.
2. Sau hoa hồng = lợi nhuận gộp − hoa hồng bán hàng và tầng trên.
3. Sau chi phí bán đã ghi nhận = mức 2 − phí hãng khấu trừ − các chi phí bán có chứng từ/dữ liệu được khai báo.

Không đặt tên mức 3 là lãi ròng kế toán. Không tự coi tiền chuyển COD về là doanh thu lần hai. Không trừ phí giao do khách trả trực tiếp như một chi phí cửa hàng nếu cửa hàng không chịu khoản đó.

- Trước tiên đưa `codCarrierFeeMmk` hiện có vào mức 3; hiển thị số đơn chưa đối soát/chưa đủ phí.
- Nếu thêm đóng gói, thanh toán hoặc quảng cáo: thêm dữ liệu chi phí theo đơn/kỳ, loại tiền, nguồn và ngày ghi nhận; chỉ mở báo cáo khi đã chốt quy tắc phân bổ. Không lấy cột xem trước `selling_fee_mmk` của import làm chi phí thực tế.
- Chi phí ghi nhận muộn phải được trình bày đúng cơ sở: báo cáo theo kỳ hoàn tất đơn và phần chi phí đã cập nhật đến lúc xem; tiền về có báo cáo theo ngày nhận riêng.
- Giữ cảnh báo vốn tạm và thiếu vốn. Không cập nhật ngược snapshot vốn của đơn đã xuất; điều chỉnh lịch sử, nếu cần, là nghiệp vụ riêng có audit.

### D4.3 Chi trả CTV

- Đề xuất chính sách cho lần chi sau phát hành: đơn COD phải đã đối soát tiền về và qua hạn chờ; chuyển khoản phải PAID và qua hạn chờ.
- Kiểm tra cùng một rule ở portal, admin, xem trước chi và transaction ghi nhận chi; không chỉ lọc ở nút bấm.
- Hiện điều kiện chi chỉ là qua hạn chờ (mặc định 7 ngày sau COMPLETED), không xét tiền COD đã về.
- Các khoản đã chi giữ nguyên. Hoàn hàng sau chi tiếp tục tạo phần bù trừ âm, không bỏ mất do thêm gate tiền về.
- Lần chi yêu cầu tổng ròng > 0: khi gate COD giữ lại các khoản dương, khoản âm có thể làm tổng ≤ 0 và chặn chi kéo dài. Quy định cách xử lý (chuyển khoản âm sang kỳ sau hoặc trừ dần) trước khi bật.
- Đơn COD hoàn một phần chưa đối soát được (xem D4.1) → nếu không có lối đóng ngoại lệ thì hoa hồng của đơn đó bị giữ mãi.
- Admin được xem tổng hoa hồng đang bị giữ vì chưa đối soát. Việc đổi chính sách cần được mô tả rõ trước khi bật.

### File và nghiệm thu

orders/cod.ts, admin-queries.ts; reports/queries.ts, profit.ts; affiliates/commission.ts, affiliates.ts; settings; trang orders/cod, reports và affiliates; messages; tests COD/reports/commission/affiliates.

Ca mẫu: COD 100.000, tiền về 97.000, phí 3.000; báo cáo không tăng doanh thu thêm 97.000 và chỉ trừ phí một lần. COD chưa về không được chi theo chính sách mới. Đơn đã chi rồi hoàn vẫn có bù trừ âm. Vốn tạm/thiếu được hiển thị đúng trên cả kỳ có phí ghi nhận muộn.

## 11. D5 — Đo hành vi trước khi tối ưu chuyển đổi

**Trạng thái: đã triển khai local (05/11/2026).** Bảng sự kiện nội bộ, endpoint chỉ nhận tên/thuộc tính cho phép, bỏ query/mã đơn/PII, giới hạn dung lượng và tần suất; sessionStorage UUID, Web Vitals, mốc nghiệp vụ trong transaction và chống trùng. Báo cáo `/admin/reports/analytics` tính phễu tuần tự theo phiên và thiết bị, p75 theo loại trang; đăng nhập là nhánh tùy chọn. Có cờ tắt và cleanup mặc định 180 ngày. Migration `20261105190000_d5_analytics_events` đã áp local/test; CSP giữ nguyên. Kiểm tra: 212 unit, 3 integration D5, typecheck; E2E hành trình D5 và 2 kiểm tra CSP đạt. Chuỗi Myanmar mới có trong danh sách cần người bản ngữ duyệt (một số nhãn quản trị tạm dùng tiếng Anh). Chưa triển khai production, chưa có hai tuần dữ liệu thật để quyết định D6.2; quy định lưu dữ liệu Myanmar vẫn [CẦN XÁC MINH].

Hiện chưa có công cụ đo nào; CSP chỉ cho `'self'`. Chọn **bảng sự kiện tự ghi** thay vì GA4: không thêm script ngoài (nhẹ trên Slow 3G), không mở CSP, dữ liệu nằm trong Postgres của mình, chạy được cả Vercel lẫn Docker, không mất dữ liệu do chặn quảng cáo. GA4 chỉ dùng làm tham chiếu tên sự kiện; có thể đẩy thêm sang GA4 về sau như một phạm vi riêng.

- Lưu trữ: model Prisma bảng sự kiện (tên, thời điểm UTC, locale, loại thiết bị, đường dẫn đã bỏ query nhạy cảm, mã phiên ẩn danh ngẫu nhiên, nguồn/CTV, dữ liệu sự kiện dạng JSON giới hạn kích thước). Ghi qua route `POST /api/events` (validate Zod, `hitRateLimit`, bỏ qua bot), gửi bằng `navigator.sendBeacon`; một script nhỏ, không chặn render.
- Sự kiện phía server (tạo đơn, xác nhận, hoàn tất, hoàn hàng) ghi trực tiếp từ hàm domain/transition, không cần trình duyệt.
- Web Vitals: `useReportWebVitals` của Next gửi về cùng route; xem p75 theo loại trang và thiết bị.
- Dọn dữ liệu cũ bằng job `cleanup` hiện có (thời hạn lưu cấu hình qua env). Báo cáo phễu đơn giản ở `/admin/reports`.

- Chuẩn hóa các mốc: xem danh sách, xem sản phẩm, thêm giỏ, xem giỏ, bắt đầu checkout, gặp yêu cầu đăng nhập, đăng ký/đăng nhập thành công, tạo đơn, xác nhận, hoàn tất, hoàn hàng.
- Tên sự kiện thương mại theo quy ước GA4 để dễ chuyển đổi sau này: `view_item_list`, `select_item`, `view_item`, `add_to_cart`, `view_cart`, `begin_checkout`, `purchase`, `refund` khi áp dụng. Các mốc nghiệp vụ bổ sung dùng tên riêng, không biến xác nhận/giao hàng thành nhiều purchase cho cùng đơn.
- Chốt thời điểm purchase cho đo chuyển đổi là tạo đơn thành công, chỉ một lần mỗi order; báo cáo vận hành/đơn hoàn tất là nguồn đánh giá doanh thu thực và chất lượng COD. Đổi quy ước phải đổi phiên bản đo, không trộn lịch sử.
- Không phát lại purchase khi tải lại trang đơn hoặc tra cứu; transaction_id dùng mã định danh ổn định, có chống trùng. Trang sau đặt hàng hiện là `/order/{code}?placed=1` — tải lại vẫn còn `placed=1`, nên purchase phải ghi phía server lúc tạo đơn (unique theo order), không ghi từ trang này.
- Không gửi họ tên, số điện thoại, email, địa chỉ chi tiết trong sự kiện hoặc URL đo. Các trang riêng tư không gửi nội dung đơn nhạy cảm.
- Giữ đúng nguồn giới thiệu CTV và bổ sung nguồn marketing theo quy ước đã định; không làm thay đổi cơ chế gán hoa hồng.
- Bổ sung cấu hình môi trường (bật/tắt đo, thời hạn lưu) vào `env.ts` + `.env.example`, chính sách dữ liệu liên quan **[CẦN XÁC MINH]** quy định Myanmar về dữ liệu cá nhân. CSP giữ nguyên vì chỉ gửi về `'self'`.
- Theo dõi LCP, INP, CLS thực tế, tách điện thoại/desktop và loại trang. Có fallback kiểm thử phòng lab khi chưa đủ lượt truy cập.

Nghiệm thu: xem được một hành trình thử duy nhất từ xem hàng đến tạo đơn; refresh không nhân đôi; giỏ nhiều SKU/biến thể đúng; tổng giá trị dùng MMK; không có thông tin định danh khách trong payload.

Nguồn tham chiếu: [GA4 ecommerce](https://developers.google.com/analytics/devguides/collection/ga4/ecommerce) và [Web Vitals](https://web.dev/articles/vitals).

## 12. D6 — Giảm trở ngại đặt hàng

**D6.1: đã làm local (05/11/2026).** Checkout trả lỗi theo từng ô, giữ dữ liệu, cuộn/focus tới lỗi đầu; lỗi hàng có SKU khi xác định được và đường về giỏ. Đặt tiền hàng/phí giao/phương thức thanh toán/liên hệ gần nút đặt; trang tạo đơn nói rõ chờ xác nhận và chưa xác nhận thanh toán. Typecheck và 2 E2E COD/chuyển khoản (gồm lỗi SĐT giữ form + ARIA) đạt. D6.2 chưa bật/triển khai vì chưa đủ dữ liệu thực tế theo điều kiện kế hoạch.

### D6.1 Cải thiện ngay trong luồng hiện tại

- Giữ thông tin đã nhập khi server báo lỗi đã làm ở DQ; D6 kiểm tra lại cùng các thay đổi form khác.
- Lỗi gắn đúng trường, cuộn đến lỗi đầu; lỗi hết hàng/đổi giá có hướng xử lý rõ.
- Bảo toàn giỏ và đường quay lại checkout sau đăng nhập/đăng ký.
- Thể hiện gần nút đặt hàng: tiền hàng, cước giao thu riêng, cách thanh toán, cách liên hệ khi cần.
- Địa chỉ đã lưu điền sẵn; số điện thoại phụ và ghi chú tiếp tục là tùy chọn.
- Tách trang tạo đơn thành công khỏi trạng thái đã xác nhận/đã nhận tiền để khách không hiểu nhầm.

### D6.2 Thử nghiệm guest COD

- Là một thay đổi chính sách so với yêu cầu tài khoản hiện tại; xây sau khi có đo lường, chạy bằng cờ tắt mặc định và bật thử trên môi trường/nhóm thử được duyệt.
- Guest COD dùng tên, SĐT, địa chỉ và hàng; không bắt tạo mật khẩu trước khi đặt. Mời tạo tài khoản sau thành công.
- Tái sử dụng createOrder, chống gửi trùng, kiểm tra tồn, giữ hàng và gọi xác nhận COD; bổ sung rate limit cho đường đặt guest theo nhu cầu thực tế.
- Quyền xem đơn dựa trên cơ chế đã được kiểm tra, không dựa vào mã đơn đơn lẻ. Không tự gắn đơn cũ vào tài khoản SĐT chưa xác minh.
- CTV đăng nhập vẫn được ưu tiên gán đúng CTV; khách qua link giới thiệu không mất attribution. Nhân viên không tự trở thành tài khoản khách.
- Chưa đổi luồng chuyển khoản sang guest trong đợt thử COD; chỉ mở thêm nếu kết quả và hỗ trợ vận hành phù hợp.
- So sánh tỷ lệ tạo đơn và chất lượng: xác nhận được, giao thành công, hủy, đơn trùng, công gọi khách. Không kết luận tốt chỉ vì số đơn tạo tăng.

File: checkout/page.tsx, checkout-form.tsx, cart/actions.ts, customer-session/policy, proxy, order-access/claims và tests storefront-orders/customer/auth. Đọc lại guide Next.js trong node_modules trước khi sửa các API/form.

## 13. D7 — Tìm hàng, trang sản phẩm và hiệu năng

**D7: đã triển khai local (05/11/2026).** Lọc/sắp toàn tập bằng SQL có tham số, giá MIN biến thể active, thứ tự phụ id, count thật và phân trang 24 SP; nội dung giữ cache/tag, tồn tính mỗi request. Bộ sưu tập phân trang, gallery đổi ảnh qua thumbnail/bàn phím/vuốt. Kiểm thử fixture 65 SP + bộ sưu tập, tích hợp nội dung/tồn, E2E URL/back-forward và tải ảnh/đổi ảnh đạt; typecheck/lint đạt trước bước D8. Sau tách tên font và bỏ preload staff trên storefront, trang chủ Slow 3G đạt trung vị 72 điểm, vượt ngưỡng 70 (3 lượt, dải 67–73). Số đo chi tiết và giới hạn so sánh nằm ở `nghiem-thu-d4-d9.md`; chưa có dữ liệu khách production.

### D7.1 Danh sách sản phẩm

- Đưa sắp xếp giá trước phân trang; không lấy 60 sản phẩm mới rồi sắp xếp lại riêng tập đó (hiện `store-queries.ts` `take` tối đa 60 theo `createdAt`, `sortCards` sort trong JS).
- Giá sắp xếp là giá thấp nhất của biến thể active; quy ước này phải trùng với nhãn giá trên thẻ. Giá bằng nhau có thứ tự phụ ổn định. Giá thấp nhất hiện tính trong JS → cần aggregate `MIN` theo biến thể active ở SQL.
- Trang danh mục đang hiện số kết quả bằng `products.length` (tối đa 60) → đổi sang đếm tổng thật. Bộ sưu tập (`loadCollectionRow`) hiện không giới hạn số SP → cũng cần phân trang/giới hạn.
- Các bộ lọc danh mục, thương hiệu, loại da, vấn đề da và từ khóa phải áp dụng trước đếm/phân trang.
- Có tổng kết quả, trang hoặc tải thêm, URL giữ trạng thái bộ lọc/sort. Không nạp toàn bộ hàng và tồn vào trình duyệt.
- Có thể dùng SQL PostgreSQL chuẩn/aggregate có tham số nếu Prisma không diễn tả hiệu quả; không dùng đặc thù một nhà cung cấp. Đo truy vấn trước khi thêm bảng giá tổng hợp.
- Nội dung có thể cache; tồn, giữ hàng và hạn vẫn kiểm tra theo request. Không cache vô hạn từng tổ hợp tìm kiếm.
- Cảnh báo cache phải được invalidate sau thay đổi sản phẩm/giá/ảnh; bổ sung kiểm thử sửa giá xong khách thấy đúng.

### D7.2 Trang sản phẩm và nội dung

- Thumbnail bấm đổi ảnh lớn (hiện trang SP là Server Component, thumbnail không có tương tác); hỗ trợ xem ảnh rõ, điều khiển bàn phím và điện thoại. Giữ JS client tối thiểu: một client component nhỏ cho gallery.
- Chuẩn nội dung: công dụng, đối tượng phù hợp, cách dùng, quy cách, thành phần, hạn/PAO và thông tin giao/đổi trả. Không tự tạo thông tin không có nguồn sản phẩm.
- Giữ giá và tình trạng theo biến thể rõ ràng, nút mua dễ thao tác, liên hệ Viber/Messenger có cấu hình.
- Bộ sưu tập tối thiểu gọn, có hàng phù hợp và còn được phục vụ; nếu ghi giảm giá phải có giá thực sự tương ứng.
- Kiểm tra SEO hiện có thay vì làm lại: canonical, ngôn ngữ, sitemap, JSON-LD, ảnh và URL hàng đã ngừng.

### D7.3 Nghiệm thu

Fixture > 60 SP: sản phẩm rẻ nhất thuộc nhóm tạo cũ vẫn xuất hiện đúng khi sort tăng; không trùng/mất qua trang; lọc và back/forward giữ đúng trạng thái. Kiểm tra hết tồn, combo, nhiều biến thể và giá thay đổi.

Lưu số đo LCP/INP/CLS trước/sau trên cùng trang, điều kiện và thiết bị. Mục tiêu tham chiếu p75: LCP ≤ 2,5s; INP ≤ 200ms; CLS ≤ 0,1. Không tuyên bố đạt chỉ từ một lần Lighthouse; nếu thiếu dữ liệu thực thì ghi rõ giới hạn.

File: catalog/store-queries.ts, cached.ts, trang search/category/collection/product, product-card và các thành phần bộ lọc; tests storefront-content/storefront-cache/seo/store-stock.

## 14. D8 — Chuyến hàng và quản lý đợt nhập

**D8.1–D8.2: đã làm local (05/11/2026).** Migration `20261105200000_d8_weight_allocation` thêm BY_WEIGHT và lịch sử phân bổ (người/thời điểm/phương pháp/đầu vào/kết quả/fingerprint). Trọng số dùng lượng RECEIVE POSTED gồm tester × gram; thiếu gram liệt kê SKU và chặn. Giữ quy tắc phần dư lớn nhất đang dùng cho BY_VALUE/BY_QTY, dùng số nguyên BigInt tránh sai số tích lớn, nêu rõ cách làm tròn trên màn hình. Trạng thái chưa phân bổ/khớp/cần phân bổ lại; gắn rõ lô VND chưa chuyến, chặn lô chuyến khác khi lập phiếu, không tự sửa snapshot đơn. Migration áp local/test. 19 unit liên quan, 11 integration kho/phân bổ, typecheck/lint và E2E nhập→phân bổ→đổi phí báo stale đạt. D8.3 chưa tách schema vì chưa có bằng chứng production và phê duyệt theo điều kiện kế hoạch.

### D8.1 Phân bổ theo kg

- Thêm BY_WEIGHT: trọng số = số lượng RECEIVE đã ghi sổ × khối lượng mỗi đơn vị.
- Thiếu khối lượng phải liệt kê SKU để bổ sung; không tự chuyển sang chia số lượng.
- Tổng tiền phân bổ cấp lô khớp chi phí chuyến; lưu ý giá vốn/đơn vị làm tròn có thể tạo chênh lệch khi nhân lại, cần hiển thị/ghi nhận phần làm tròn theo quy tắc rõ ràng.
- Giữ BY_VALUE và BY_QTY của chuyến cũ; không tự đổi phương pháp lịch sử.
- Trước mắt theo kg áp dụng cho tổng chi phí khi người dùng chọn. Nếu muốn thuế theo giá trị và vận chuyển theo kg trong cùng chuyến, bổ sung cấu hình theo loại chi phí ở bước riêng; không mặc định mọi chi phí đều theo kg.

### D8.2 Trạng thái giá vốn chuyến

- Hiển thị Chưa phân bổ / Đã phân bổ / Cần phân bổ lại theo fingerprint của chi phí, phương pháp, batch, lượng đã nhập và khối lượng dùng để phân bổ.
- Lưu lần phân bổ, người thực hiện, tham số, nguồn tỷ giá và kết quả; thay đổi đầu vào không âm thầm tự tính lại.
- Cần phân bổ lại không đồng nghĩa xóa giá vốn thực tế cũ; hiển thị rõ độ cũ của kết quả. Đơn đã xuất giữ snapshot; không hồi tố sau một nút phân bổ.
- Cho phép gắn lô đã nhập chưa có chuyến bằng thao tác rõ ràng, có kiểm tra quyền và audit. Đã thuộc chuyến khác thì chặn chuyển âm thầm; cần quy trình sửa riêng.
- Hiện khi phiếu nhập dùng lại lô cũ (`documents.ts`), hệ thống so hạn, trạng thái hạn và giá mua nhưng **không so `shipmentId`** → lô giữ chuyến cũ dù phiếu mới ghi chuyến khác. Thêm kiểm tra: khác chuyến thì chặn hoặc yêu cầu tách đợt nhập (liên quan D8.3).

### D8.3 Số lô nhà sản xuất và đợt nhận

- Khảo sát dữ liệu D0: có thường gặp cùng SKU/số lô NSX nhưng nhiều giá mua hoặc chuyến khác nhau không?
- Nếu có: thêm mã đợt nhập nội bộ, tách với số lô NSX. Thiết kế lại uniqueness và tra cứu trước khi migration; ledger và đơn cũ vẫn trỏ đúng batch cũ.
- Không hướng dẫn đổi số lô NSX thành dữ liệu giả để vượt kiểm tra giá. Hiển thị cả mã nội bộ và số lô thật khi soạn/truy vết.
- Đây là thay đổi dữ liệu riêng, chỉ triển khai sau khi có mẫu nghiệp vụ thật; không bắt buộc để vận hành vốn tạm hiện tại.

File: inventory/shipments.ts, landed-cost.ts, queries.ts, documents.ts; shipment-forms; trang shipments và batch; Prisma/migration; tests inventory-pure/inventory/estimated-cost.

## 15. Danh mục kiểm thử xuyên suốt

| Mã | Hành trình | Kết quả bắt buộc |
|---|---|---|
| T01 | SP VN mới → nhập nháp → tính giá | Chưa dùng giá nháp; chỉ rõ thiếu nguồn ghi sổ |
| T02 | Ghi sổ → tính giá → áp dụng → đăng → đặt COD | Tồn/giá/giữ hàng đúng; mở bán qua kiểm tra |
| T03 | Không chuyến, có cước và đủ dữ liệu | Có vốn tạm, giữ snapshot khi xuất, báo cáo cảnh báo |
| T04 | Không tỷ giá/khối lượng/cước | Không bịa vốn thực tế 0; thông báo dữ liệu thiếu |
| T05 | Hàng MMK | Giá và vốn đúng MMK, không cộng cước VN |
| T06 | Combo và hàng lẻ cùng thành phần | Không bán vượt hoặc giữ trùng; soạn/xuất đủ thành phần |
| T07 | Lô UNKNOWN, cận hạn, hết hạn, tester | Cùng quy tắc giữa thẻ hàng, giỏ, checkout và xuất |
| T08 | Hai người bàn giao đồng thời / lô trên phiếu soạn bị lấy mất | Không xuất âm, không ghi sổ hai lần; báo soạn lại, không đổi lô âm thầm |
| T09 | Đơn có hai kho | Soạn đủ hai nhóm; xuất một lần mỗi kho, một bàn giao theo phạm vi hỗ trợ |
| T10 | Chuyển khoản | Đối chiếu rồi xác nhận; không gọi tiền chưa có là đã thanh toán |
| T11 | COD giao xong, chưa tiền về | Hoàn tất nhưng chưa đối soát; hoa hồng giữ chính sách hiện tại theo lựa chọn chủ shop, không thêm gate COD |
| T12 | COD tiền về + phí | Tổng khớp; doanh thu không ghi hai lần, chi phí trừ một lần |
| T13 | Trả một phần/toàn bộ trước/sau chi CTV | Đúng lô, về Chờ kiểm tra, giảm đúng số; bù trừ hoa hồng không mất |
| T14 | Guest COD và tài khoản hiện có | Bảo toàn giỏ, quyền xem đơn, attribution; không tự chiếm đơn cũ |
| T15 | Giá/khối lượng đổi sau preview | Dòng bị ảnh hưởng yêu cầu tính lại |
| T16 | > 60 SP, lọc và phân trang | Sort toàn tập, không trùng/mất kết quả |
| T17 | Cron, hủy quá hạn, phiếu soạn bị hủy | Giải phóng các quyền giữ liên quan; trạng thái không treo |
| T18 | Cache và đo lường | Giá/tồn đúng sau đổi; không nhân đôi purchase, không lưu dữ liệu định danh khách |
| T19 | Thao tác hàng loạt có đơn lỗi giữa chừng | Đơn hợp lệ xử lý xong, đơn lỗi báo rõ; không xuất hai lần; ledger khớp balance |
| T20 | Nhập file mã vận đơn / tiền COD VTP | Chỉ ghi dòng khớp sau xem trước; dòng lệch vào ngoại lệ |
| T21 | Đặt hàng giá 0 (gọi thẳng server) | Bị từ chối, kể cả đơn nhân viên/CTV |

Unit test cho quy tắc thuần. Integration dùng DB test riêng cho transaction và race. E2E cho hành trình chính, phân quyền và vi/en/my; kiểm tra mobile và các màn desktop liên quan. Kiểm thử ít nhất một ca lỗi/rollback cho mọi mutation quan trọng. Chuỗi `my` mới thêm key vào `messages/review-my.json`; action đổi dữ liệu khách thấy gọi `updateTag` tag tương ứng (`CATALOG_TAG`, `HOME_TAG`…).

Lệnh nền: `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run test:int`, `npm run test:e2e`. Chạy bộ liên quan trong lúc làm; chạy đầy đủ trước phát hành theo quy tắc repo. Không chạy reset DB hoặc test ghi dữ liệu vào production.

## 16. Migration, phát hành và khả năng quay lui

1. Mỗi đợt có migration thêm mới trước; dùng mặc định/nullable có chủ đích để dữ liệu cũ vẫn đọc được.
2. Chốt các bản xem trước bị ảnh hưởng; không tự áp giá mới hoặc tự đăng SP cũ.
3. Thử migration với bản sao dữ liệu; so tổng tồn, snapshot đơn, COD và chi trả trước/sau.
4. Với thay đổi hợp đồng dữ liệu lớn như picking, dùng cờ/kế hoạch chuyển đổi: không bật bắt buộc khi còn app cũ có thể xuất mà bỏ qua giữ lô.
5. Đọc runbook triển khai thực của dự án. Không áp dụng hướng dẫn Coolify/Vercel cũ cho server đang dùng Docker Compose/Nginx nếu không phù hợp.
6. Trước phát hành có backup và kết quả khôi phục thử. Khi cần tạm dừng nhận đơn mới, dùng cài đặt nhận đơn (`store.checkoutEnabled`); lưu ý cài đặt này chỉ chặn đơn khách đặt trên web, đơn do nhân viên/CTV tạo vẫn đi qua → báo nhân viên tạm ngừng tạo đơn tay. Các đơn đang xử lý vẫn có quy trình tiếp tục.
7. Sau phát hành: thử luồng được duyệt, kiểm log/cron, cảnh báo thiếu vốn, phiếu soạn treo, COD và cache. Đối chiếu số liệu với mốc trước phát hành.
8. Quay lui ưu tiên tắt tính năng mới hoặc dùng phiên bản tương thích schema. Không drop cột/bảng hay khôi phục DB đè lên giao dịch mới một cách tự động. Manifest D3-lite không giữ lô nên app cũ bỏ qua được; nếu sau này làm D3+ (giữ lô), cần vô hiệu hóa/giải phóng theo quy trình trước khi chạy app không hiểu giữ lô.

Các bước triển khai production, đổi chính sách guest và điều kiện chi CTV được trình bày thành thay đổi cụ thể để duyệt ở cuối đợt; bản kế hoạch hiện tại không phải thao tác triển khai production.

## 17. Phân công và lịch vận hành

| Vai trò | Trách nhiệm |
|---|---|
| Chủ shop/Admin | Duyệt nội dung/giá, mở bán, chính sách tiền/CTV, nghiệm thu từng đợt |
| Kho | Nhận/ghi sổ hàng, kiểm lô/hạn, xác nhận soạn, xử lý hàng trả và kiểm kê |
| Nhân viên đơn | Tạo/xác nhận đơn, liên hệ khách, vận chuyển, cập nhật giao và ngoại lệ |
| Người triển khai kỹ thuật | Code/migration/test, tài liệu, số đo và hỗ trợ chuyển đổi |

- Đầu ngày: đơn chờ xác nhận (xác nhận hàng loạt), đơn đến hạn giữ hàng, in phiếu soạn + nhãn cho cả loạt đơn phải giao.
- Trong ngày: nhận hàng/ghi sổ rồi tính giá SKU vừa nhập; soạn theo phiếu và bàn giao hàng loạt; nhập file mã vận đơn; theo dõi giao lỗi/hàng trả.
- Cuối ngày: nhập file tiền COD, phí và ngoại lệ; hàng trả chờ kiểm; phiếu nháp/phiếu soạn chưa bàn giao.
- Hằng tuần: tồn thấp, hàng chậm/cận hạn, vốn thiếu/tạm, lãi theo kênh, hoa hồng đến hạn và hiệu quả checkout.

## 18. Tiêu chí đánh giá và thứ tự bắt đầu

### Tiêu chí đúng — phải đạt

- Không có đường tính giá mới dùng nhập nháp/hủy.
- Không bán SP có giá 0 do thiếu dữ liệu.
- Lô thực xác nhận soạn trùng với lô xuất; không trừ tồn hai lần.
- Giá/vốn/cước không cộng hoặc trừ hai lần; lịch sử đơn được bảo toàn.
- COD hoàn tất, tiền về và chi hoa hồng được phân biệt đúng.
- Không có chênh lệch ledger/balance do các luồng mới.

### Chỉ số tối ưu — đo trước rồi đặt mục tiêu

- Thời gian từ tạo SP đến mở bán; tỷ lệ SP thiếu ảnh/khối lượng/vốn.
- Thời gian xác nhận và soạn đơn; thời gian đặt → bàn giao (p50/p90); số lần mở trang chi tiết mỗi đơn; số lần soạn lại; tỷ lệ giao thành công.
- Thời gian từ ghi sổ phiếu nhập đến áp giá cho SKU đó.
- Tuổi nợ COD, tỷ lệ đơn chưa đủ phí, tỷ lệ doanh thu dùng vốn tạm/thiếu.
- Xem SP → thêm giỏ → checkout → tạo đơn → xác nhận → giao thành công, theo nguồn và thiết bị.
- LCP/INP/CLS thực tế, thời gian truy vấn danh sách và tỷ lệ lỗi checkout.

Không hứa tỷ lệ tăng doanh thu khi chưa có baseline. Không đánh giá guest checkout chỉ bằng số đơn tạo. Các chỉ số gắn với người phụ trách và kỳ xem cụ thể.

### Điểm bắt đầu thực thi

0. Điều kiện tiên quyết: `npm test` và commit phần giá vốn tạm đang dở.
1. DQ: viết regression chứng minh nháp/hủy ảnh hưởng nguồn giá, giá 0 đặt được, form checkout mất dữ liệu; sửa ba lỗi.
2. D0: lập báo cáo dữ liệu nền, fixture, mốc đối chiếu và mốc thời gian vận hành.
3. DT: khảo sát với kho/nhân viên đơn, làm thao tác hàng loạt và nhập file VTP theo thứ tự khảo sát.
4. D1: provenance nguồn giá, fingerprint, combo, áp dụng một phần.
5. D2: bộ kiểm tra mở bán thống nhất.
6. D3-lite: chốt mẫu phiếu soạn với kho rồi xuất đúng manifest.
7. Tiếp tục D4 và D5; chỉ sau khi có đo lường mới bật thử thay đổi D6.

Phạm vi thực thi được chia theo đợt ở trên. Nếu cần rút gọn, phát hành DQ, D0, DT, D1–D3-lite trước; không cắt kiểm tra quyền, transaction, snapshot hoặc kiểm thử kho để đổi lấy tốc độ.

## 19. Ước lượng khối lượng và mốc bàn giao

Đây là ước lượng sơ bộ để chọn quy mô, không phải cam kết ngày hoàn thành. Giả định một người triển khai kỹ thuật hiểu code, có môi trường test hoạt động và chủ shop/kho phản hồi nghiệp vụ trong quá trình làm. Một ngày công là ngày làm việc tập trung của người triển khai; thời gian chờ duyệt, dữ liệu và bên thứ ba tính riêng. Chốt lại sau D0 và thiết kế chi tiết D3.

| Đợt | Ngày công dự kiến | Mốc bàn giao |
|---|---:|---|
| DQ | 1–2 | Chặn giá 0, giữ form checkout, nguồn giá chỉ từ phiếu ghi sổ |
| D0 | 1–2 | Báo cáo dữ liệu, cấu hình, fixture và mốc thời gian vận hành đã thống nhất |
| DT | 4–7 | Thao tác hàng loạt, nhập file VTP, nối nhập → tính giá, lọc đơn |
| D1 | 2–4 | Nguồn giá đúng, biết phiếu/lô nguồn, preview không áp sai |
| D2 | 3–5 | Checklist mở bán và kiểm tra ở cả server/giao diện |
| D3-lite | 2–4 | Phiếu soạn FEFO, xuất đúng manifest, báo soạn lại khi lệch |
| D4 | 4–7 | COD, phí, báo cáo và gate chi CTV được nghiệm thu |
| D5 | 2–4 | Sự kiện đo lường, chống trùng và mốc trải nghiệm ban đầu |
| D6 | 3–6 | Checkout giữ dữ liệu, thử guest COD bằng cờ cấu hình |
| D7 | 4–7 | Phân trang/sort đúng, xem ảnh và số đo trước/sau |
| D8 | 4–8 | Theo kg, trạng thái phân bổ, gắn chuyến rõ ràng |
| D9 | 2–4 | UAT toàn tuyến, runbook, kiểm thử hồi quy và bàn giao |
| Tổng | 32–60 | Toàn bộ phạm vi chính, triển khai theo nhiều đợt |

Thay uniqueness để tách đợt nhập với số lô NSX là phần có điều kiện của D8, ước lượng thêm 3–6 ngày công nếu D0 xác nhận cần làm; không nằm trong tổng 32–60. D3+ (giữ lô đầy đủ) ước lượng thêm 5–8 ngày công nếu cần, cũng không nằm trong tổng. Phần nhập file VTP ở DT phụ thuộc file mẫu; nếu chưa có thì làm các mục khác của DT trước. Tích hợp API VTP, OTP/cổng thanh toán và giao nhiều kiện phải ước lượng riêng sau khi có tài liệu/quyền truy cập của nhà cung cấp.

Mốc phát hành đề xuất:

- M1: DQ + D0 + DT — hết lỗi rủi ro cao, có mốc đo, nhân viên xử lý đơn hàng loạt.
- M2: D1–D2 — tính giá và mở bán có kiểm soát.
- M2b: D3-lite — phiếu soạn và xuất đúng lô trên phiếu.
- M3: D4–D5 — rõ dòng tiền/lợi nhuận và bắt đầu có dữ liệu chuyển đổi.
- M4: D6–D7 — thử cải thiện checkout và duyệt hàng, so với mốc đo trước đó; cần đủ dữ liệu mới kết luận tác động.
- M5: D8–D9 — hoàn thiện chi phí chuyến và bàn giao quy trình toàn tuyến.

Mỗi mốc cần: diff có phạm vi rõ, migration nếu có, kết quả kiểm thử, hướng dẫn thao tác và danh sách ảnh hưởng dữ liệu cũ. Thời gian thu thập dữ liệu để kết luận thử nghiệm chuyển đổi không được gộp vào ngày công lập trình.
