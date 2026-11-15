# Báo cáo kiểm tra luồng giá và lợi nhuận

Ngày: 08/11/2026. Phạm vi: mã nguồn hiện tại trong WEB TC; nhập giá tay/Excel/phiếu kho → tính giá → áp giá → cửa hàng/giỏ/checkout → xuất kho → hoàn hàng → báo cáo lợi nhuận.

Chỉ điều tra và báo cáo, chưa sửa logic, chưa thay giá hay dữ liệu kinh doanh. Không commit hoặc triển khai.

## Kết luận

**Chưa thể xác nhận toàn trình hoạt động đúng.** Công thức giá cơ bản đúng theo tài liệu hiện có, nhưng đã tái hiện bốn lỗi logic bằng kiểm thử cô lập. Hai điểm khác được xác định qua truy vết mã, cần chạy DB/giao diện để kiểm chứng toàn trình. Ưu tiên sửa báo cáo theo kỳ, lịch sử combo và việc áp giá 0.

PostgreSQL localhost:15432 không chạy; web localhost:3000 và :3100 không chạy; Docker Desktop engine không kết nối được. Vì vậy chưa chạy integration/E2E, chưa xác định SKU/đơn thật nào đã bị ảnh hưởng. Không dùng DB production làm DB thử nghiệm.

## 1. Luồng hiện tại và công thức

| Bước | Hành vi đang có | Nhận xét |
|---|---|---|
| Nhập giá bán tay | Lưu `Variant.priceMmk`; sửa giá biến thể cũ có PriceHistory | Giá MMK nguyên, không âm. Sản phẩm đang đăng được kiểm tra giá > 0 khi lưu form. |
| Excel | Đọc giá bán, giá mua theo loại kho, phí về kho VND/đơn vị; xem trước rồi xác nhận | Tạo phiếu nhập nháp; phải ghi sổ mới tăng tồn. Xem điểm F5 về phí bằng 0. |
| Nhập kho | Mỗi dòng nhập đúng một loại giá mua VND hoặc MMK; giá 0 hợp lệ | VND cần tỷ giá và thông tin vốn/cước; MMK có vốn ngay từ giá mua. |
| Nguồn giá đề xuất | Phiếu RECEIVE đã ghi sổ gần nhất của biến thể, theo ngày ghi sổ | Không lấy từ phiếu nháp/hủy. Đây là giá nhập gần nhất, không phải bình quân tồn và không nhất thiết là lô FEFO sắp bán. |
| Kho VN_IMPORT | `giá mua VND × MMK/VND × (1 + % lãi) + cước MMK/kg × gram/1000`, làm tròn lên | Lãi chỉ trên tiền mua. Không cộng lại chi phí chuyến vào đầu vào, tránh cộng cước hai lần. |
| Kho LOCAL_MMK | `giá mua MMK + lãi cố định MMK của sản phẩm`, làm tròn lên | Lãi cố định chưa trừ hoa hồng và các phí bán. |
| Nhánh cũ không chọn kho | Vốn VND đã phân bổ nếu có, nếu không dùng giá mua, nhân tỷ giá và % lãi | Không cộng cước/kg. Cần tránh nhầm với công thức theo kho. |
| Tỷ giá | `MMK/USD ÷ VND/USD`; giữ phân số khi tính | Công thức dùng BigInt, làm tròn lên một lần tại giá bán; mặc định bội số 100 MMK. |
| Áp giá | Xem trước → chọn dòng → áp dụng; kiểm tra đầu vào và giá cũ | Có hạn bản xem trước, fingerprint và chống ghi đè giá đã sửa xen giữa. Còn lỗ hổng giá 0 ở F4. |
| Hiển thị web | Thẻ sản phẩm lấy giá nhỏ nhất trong các biến thể active; trang chi tiết lấy giá biến thể | Thẻ hiện giá “từ”, không nhất thiết là giá biến thể còn hàng. Giá hiển thị MMK. |
| Cache | Sửa tay, Excel và áp bản giá đều gọi `updateTag(CATALOG_TAG)` | Phù hợp hướng dẫn Next.js cài trong dự án: request sau sẽ đọc dữ liệu mới. Chưa kiểm chứng giao diện đang mở sẵn. |
| Giỏ và đơn | Cookie chỉ có ID và số lượng; giá đọc DB; đơn chụp giá bán lúc tạo | Tránh khách tự sửa giá gửi lên. Xem F6 về thay giá trong lúc khách điền checkout. |
| Vốn của đơn | Khi bàn giao, xuất đúng lô/FEFO và chụp vốn MMK + trạng thái | Giá vốn thực tế ưu tiên hơn tạm; thiếu vốn lưu trạng thái riêng, có cảnh báo báo cáo. Phân bổ vốn lại sau không đổi đơn cũ. |
| Lợi nhuận | Tiền hàng sau trả − vốn lô đã xuất sau trả | Có thêm tổng sau hoa hồng và sau phí COD đã ghi nhận. Chưa bao gồm toàn bộ chi phí vận hành. |

Nguồn: `src/server/catalog/products.ts`, `catalog-import.ts`, `src/server/inventory/documents.ts`, `cost.ts`, `src/server/pricing/formula.ts`, `cost.ts`, `runs.ts`, `actions.ts`, `src/server/catalog/cached.ts`, `store-queries.ts`, `src/server/orders/orders.ts`, `transitions.ts`, `src/server/reports/queries.ts`, `profit.ts`.

### Ví dụ đối chiếu

Giá mua 100.000 VND; 1 USD = 4.420 MMK và 26.000 VND, tương đương 0,17 MMK/VND; % lãi 40; cân nặng 100g; cước 8.000 MMK/kg; làm tròn 100 MMK:

- Tiền mua quy đổi: 17.000 MMK.
- Lãi cộng vào tiền mua: 6.800 MMK.
- Cước: 800 MMK.
- Giá bán: **24.600 MMK**.
- Nếu vốn của lô thực xuất đúng 17.800 MMK thì lợi nhuận gộp là **6.800 MMK**, tương đương **27,64% doanh thu**, chưa trừ hoa hồng.
- Minh họa CTV 10% và tầng trên 2%: hoa hồng tổng 2.952 MMK, còn **3.848 MMK**, trước các chi phí khác.

Ô “% lãi” là phần trăm cộng trên giá mua, không phải tỷ suất lợi nhuận trên doanh thu. Báo cáo đang tính tỷ suất gộp trên doanh thu; hai tỷ lệ khác nhau là bình thường. Giá bán dùng lô nhập gần nhất còn vốn thực xuất theo FEFO, vì vậy lãi thực tế có thể khác lãi dự kiến.

## 2. Phát hiện cần xử lý

### F1 — Cao: đơn hoàn tất bị tính lại ở kỳ trả hàng một phần

**Đã tái hiện bằng hàm báo cáo thật, với DB giả lập.**

- `src/server/reports/queries.ts:28` lấy mọi lịch sử có `toStatus = COMPLETED` trong kỳ, không loại lịch sử trạng thái không đổi.
- `src/server/orders/returns.ts:99` ghi lịch sử `COMPLETED → COMPLETED` cho lần trả một phần sau hoàn tất.
- Map chống trùng chỉ hoạt động trong từng truy vấn kỳ. Vì vậy đơn xuất hiện lại trong kỳ khác.

Ví dụ: đơn hoàn tất 01/11, mua 2 × 10.000 MMK, trả 1 cái vào 08/11. Sau lần trả, chạy báo cáo riêng 01/11 nhận 10.000 doanh thu; riêng 08/11 cũng nhận 10.000; nhưng cả kỳ 01–08/11 chỉ nhận 10.000. Cộng các ngày không bằng báo cáo cả kỳ; số đơn, vốn, hoa hồng và lợi nhuận cũng có thể bị lệch tương ứng.

**Đề xuất:** xác định duy nhất lần chuyển thật sang hoàn tất, không coi lịch sử ghi chú trả hàng là lần hoàn tất. Theo chính sách hiện tại, hàng trả đang điều chỉnh kỳ hoàn tất cũ; nếu muốn hạch toán hoàn trả theo ngày phát sinh thì cần thống nhất riêng và dùng bút toán hoàn trả có ngày.

### F2 — Cao: thay thành phần combo làm sai hoàn hàng và lợi nhuận lịch sử

**Đã tái hiện sai lợi nhuận bằng hàm thật; đường hoàn kho được xác nhận bằng truy vết mã.**

- `src/server/catalog/products.ts:207` cho xóa và tạo lại định nghĩa combo khi lưu sản phẩm.
- `src/server/reports/queries.ts:49` và `src/server/orders/returns.ts:54` đọc định nghĩa combo hiện tại cho đơn cũ.
- `src/server/reports/profit.ts:27` tính vốn hàng trả từ số lượng thành phần hiện tại. `OrderItem` không chụp định nghĩa combo lúc bán.

Ví dụ đã chạy: bán 2 combo, mỗi bộ A×1 + B×2; vốn A=10.000, B=5.000; giá bán 40.000/bộ; đã trả 1 bộ. Lợi nhuận đúng còn 20.000. Sửa định nghĩa thành A×1 + B×1 làm cùng đơn đó báo còn 15.000, dù đơn và phân bổ vốn không đổi.

Nếu định nghĩa mới yêu cầu nhiều thành phần hơn đã xuất, đường trả hàng có thể báo “trả vượt số đã xuất”; nếu ít hơn thì có thể nhập trả thiếu thành phần.

**Đề xuất:** lưu/chốt thành phần trên đơn hoặc suy ra định mức lịch sử từ phân bổ đã xuất với kiểm tra tính hợp lệ; trả hàng và báo cáo phải dùng cùng dữ liệu lịch sử. Cần kiểm tra cả đơn chờ chưa bàn giao khi sửa combo.

### F3 — Trung bình: phân bổ chi phí khớp tổng, nhưng vốn đơn vị sau làm tròn không khớp

**Đã tái hiện bằng hàm thật.**

- `src/server/inventory/landed-cost.ts:51` làm tròn vốn VND/đơn vị thành số nguyên.
- `src/server/inventory/shipments.ts` lưu giá đơn vị này vào lô; tồn kho và vốn đơn dùng giá đơn vị đã quy đổi.

Ví dụ: 10.000 sản phẩm, giá mua 100.000 VND/cái, tổng chi phí chuyến phân bổ 4.000 VND. Hàm phân bổ đúng 4.000, nhưng phần tăng 0,4 VND/cái bị làm tròn về 0; vốn được lưu vẫn 100.000/cái. Tổng vốn không chứa 4.000 VND chi phí đó. Trường hợp phần lẻ khác cũng có thể làm tổng vốn tăng quá thực tế. Chuyển sang MMK có thêm bước làm tròn.

**Đề xuất:** có chính sách bảo toàn tổng vốn ở mức lô/phân bổ, giữ độ chính xác cao hoặc xử lý phần dư rõ ràng. Kiểm thử phải so tổng giá trị vốn được sử dụng, không chỉ tổng `allocatedVnd`.

### F4 — Cao: tính giá hàng loạt có thể áp giá bán 0 cho sản phẩm đang đăng

**Đã tái hiện cả preview và apply bằng hàm thật, DB giả lập.**

- Giá mua 0 là dữ liệu hợp lệ. Cước 0 cũng hợp lệ.
- Với vốn 0, cước 0, hàng VN có cân nặng hợp lệ, `previewRun` tạo giá mới 0 dù nhập % lãi 40.
- `src/server/pricing/runs.ts:333` cập nhật trực tiếp giá này mà không kiểm tra điều kiện mở bán như form sản phẩm.
- `src/server/orders/orders.ts:202` chặn tạo đơn khi giá ≤ 0. Storefront vẫn lấy giá đang lưu để hiển thị.

Kịch bản đã chạy: giá cũ 10.000 → preview 0 → apply trả `applied: 1`, giá biến thể thành 0. Kết quả có thể là web hiện giá 0 nhưng khách không đặt được. Kho MMK vốn 0 + lãi cố định 0 cũng có cùng điều kiện công thức.

**Đề xuất:** kiểm tra giá > 0 ở bước preview/apply theo chính sách bán, dùng cùng quy tắc với lưu sản phẩm; không cấm giá vốn 0 hợp lệ.

### F5 — Trung bình: Excel hiển thị vốn nhưng không lưu vốn khi phí về kho bằng 0

**Truy vết mã xác nhận nhánh không nhất quán; chưa chạy DB để tái hiện xuyên suốt.**

- `src/server/catalog/catalog-import.ts:377` hiển thị vốn quy đổi từ `purchase + inbound`, kể cả inbound=0.
- `catalog-import.ts:384` chỉ truyền `landedCostVnd` khi `inbound` khác 0. Cả nhập rõ số 0 và để trống đều rơi vào nhánh này.
- `catalog-import.ts:433` tạo phiếu mà không truyền cước tạm tính.
- `src/server/inventory/documents.ts:333` chỉ tạo vốn thực tế cho lô có `landedCostVnd`; bước vốn tạm cần `estimatedShipMmkPerKg`.

Vì vậy lô VND mới có giá mua 100.000, tỷ giá 0,17 và phí về kho 0 được xem trước vốn 17.000 MMK, nhưng sau ghi sổ có thể vẫn thiếu cả vốn thực tế lẫn vốn tạm. Lô đã tồn tại và có vốn có thể không gặp tình huống này.

**Đề xuất:** phân biệt rõ “chi phí đã xác nhận bằng 0” với “chưa biết chi phí”; lưu đúng vốn nếu xác nhận 0, hoặc cảnh báo rõ vốn xem trước chưa phải vốn được ghi nhận.

### F6 — Trung bình: thiếu xác nhận lại khi giá đổi trong lúc khách điền checkout

**Khoảng trống được xác định qua mã, chưa tái hiện bằng trình duyệt.**

- `src/app/[locale]/checkout/page.tsx:39` đọc và hiển thị tổng giỏ tại lúc render.
- `src/server/cart/actions.ts:106` tạo đơn chỉ với ID/số lượng; không gửi mốc giá khách đã nhìn thấy.
- `src/server/orders/orders.ts:91` và `:211` đọc lại giá hiện hành để tạo đơn; chưa thấy bước so sánh giá đã hiển thị và yêu cầu khách xác nhận giá mới.

Ví dụ: khách mở checkout thấy 20.000 MMK; admin tăng lên 25.000 trước khi khách nhấn đặt; server có thể tạo đơn 25.000 và chuyển thẳng sang trang đơn. Cache được xóa đúng vẫn không giải quyết được tổng đang hiện trên trang đã mở.

**Đề xuất:** giá vẫn lấy từ server, nhưng so với báo giá/version đã hiển thị; nếu đổi thì hiển thị lại tổng và yêu cầu khách đặt lần nữa.

## 3. Diễn giải lợi nhuận và giới hạn

- Lợi nhuận gộp = doanh thu tiền hàng ròng − vốn ròng. Doanh thu không gồm ship thu.
- Sau hoa hồng = lợi nhuận gộp − hoa hồng người bán − hoa hồng tầng trên. `totals.commission` đã gồm cả hai; chỉ tiêu tầng trên là phần tách ra, không được trừ thêm lần nữa.
- Sau chi phí bán đã ghi nhận = sau hoa hồng − phí hãng khấu trừ COD đã nhập.
- Đây chưa phải lợi nhuận ròng kế toán: còn thiếu chi phí vận hành, bao bì, phí thanh toán, các phí vận chuyển người bán chịu chưa ghi, v.v. Giao diện hiện có chú thích giới hạn chi phí.
- Đơn dùng vốn tạm/thiếu vốn vẫn nằm trong tổng lợi nhuận, có cảnh báo. Thiếu vốn được tính bằng 0 trong phép cộng, nên số tổng có thể cao hơn thực tế; phải xử lý cảnh báo trước khi dùng số để chốt lãi.
- Phân bổ vốn thực tế lại không sửa vốn đã chụp trên đơn. Đây là chính sách được ghi trong `docs/gia-von-tam-tinh.md`, không tự coi là lỗi.

## 4. Kiểm chứng

**Đạt:** bộ unit gốc chạy cuối cùng đạt 231/232 test, 48/49 file đạt hoàn toàn. Trong đó 71/71 test liên quan trực tiếp giá, vốn, báo cáo, đơn, hoa hồng, tiền, giỏ và đọc sheet đều đạt. Thêm 5/5 kịch bản chẩn đoán cô lập: F1, F2, F3, F4 và ví dụ công thức bình thường. Bốn test lỗi khẳng định hành vi sai đang tồn tại, không có nghĩa đã sửa lỗi.

**Lỗi:** lần chạy toàn bộ unit ban đầu có 1 lỗi timeout 5 giây ở `tests/unit/placeholder-art.test.ts:28`, phần chuyển ảnh WebP. Chạy riêng file vẫn lỗi cùng timeout. Không phát hiện liên quan luồng giá; chưa điều tra hoặc sửa ngoài phạm vi.

**Bỏ qua:** không chủ động bỏ qua test trong lệnh unit đã chạy.

**Không chạy:** integration và E2E vì thiếu PostgreSQL/Docker/web đang chạy; kiểm tra dữ liệu production, build/lint/typecheck không thực hiện trong cuộc kiểm tra đọc mã này. Công cụ khởi động phụ trợ của skill không chạy được vì Python trên máy trỏ tới WindowsApps không khả dụng; việc đọc mã và Vitest vẫn chạy được.

Các kịch bản chẩn đoán dùng mock ở biên DB và gọi hàm nghiệp vụ thật, không chạm dữ liệu kinh doanh. File test tạm đã được xóa sau kiểm chứng. Chỉ giữ báo cáo này trong thay đổi của lần kiểm tra. Không hoàn tác các thay đổi từ công việc khác xuất hiện đồng thời trong workspace.

## 5. Thứ tự xử lý đề xuất sau báo cáo

1. F1: chốt duy nhất thời điểm hoàn tất, đối chiếu báo cáo từng ngày/kỳ và hàng trả khác kỳ.
2. F2: cố định cấu trúc combo theo đơn, kiểm tra hoàn kho và vốn sau khi sửa sản phẩm.
3. F4: chặn áp giá bán 0, đồng bộ với quy tắc mở bán.
4. F5 và F3: thống nhất ý nghĩa chi phí 0/chưa biết và bảo toàn tổng giá vốn.
5. F6: xác nhận lại tổng khi giá checkout thay đổi.
6. Khi có DB test: chạy nhập tay/Excel cả hai loại kho → ghi sổ → preview/apply → kiểm tra thẻ/SP/giỏ/checkout → tạo đơn → bàn giao → hoàn tất → trả một phần/nhiều lần/khác kỳ → so báo cáo với ledger; kiểm tra cả mobile và desktop. Kiểm tra thêm vốn tạm chuyển thực tế, sửa giá xen giữa, hết hạn preview, combo và hoa hồng cố định/%.

Chưa triển khai bất kỳ đề xuất sửa nào; báo cáo này là đầu vào để duyệt hướng xử lý.
