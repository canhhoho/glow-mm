# Rà soát tinh gọn website — giai đoạn đầu

Ngày: 05/11/2026. Báo cáo đề xuất, chưa triển khai thay đổi trong lần rà soát này.

## Cập nhật thực hiện — 06/11/2026

Đã thực hiện theo các bước được chủ shop duyệt sau báo cáo:

1. Bỏ khỏi form sản phẩm các ô bảo quản, hạn sau mở nắp, INCI và nhóm tag da/thành phần; dữ liệu cũ tiếp tục được giữ khi lưu.
2. Không hiện lựa chọn tạo combo cho hàng thường; combo cũ vẫn sửa thành phần. Thêm thương hiệu/danh mục chuyển từ hai khối cuối trang sang nút nhỏ đầu trang.
3. Tự điền slug theo tên, SKU theo slug và số thứ tự; tên biến thể mới mặc định “Tiêu chuẩn” trong giao diện tiếng Việt. Có thể sửa trước khi lưu. Mã tự tạo trùng sẽ được thêm hậu tố; mã đã lưu không tự đổi khi đổi tên.
4. Menu thu gọn thành Tổng quan, Đơn hàng, Sản phẩm, Kho hàng, Tài khoản, Cộng tác viên, Báo cáo và Cài đặt. Tài khoản chứa Nhân viên/CTV/Khách; Nội dung trang chủ nằm trong Cài đặt. Có trang Thương hiệu và Hoa hồng & chi trả; các đường dẫn cũ và phân quyền được giữ.

Các bảng bên dưới là đánh giá ban đầu và đề xuất cho những bước tiếp theo, không phải danh sách toàn bộ việc đã triển khai.

## Phạm vi và cách hiểu

Đã đối chiếu cấu trúc 20 mục menu quản trị, danh sách 48 trang admin, các biểu mẫu chính, quy tắc lưu dữ liệu và các phần chính của trang khách: trang chủ, danh sách, chi tiết sản phẩm, giỏ, thanh toán, tài khoản, tra cứu và đánh giá. Đây là rà soát mã nguồn; chưa kiểm thử toàn bộ thao tác trên website đang chạy, chưa truy vấn dữ liệu thực tế để xác định chức năng nào cửa hàng đang sử dụng.

“Không bắt buộc” được tách thành ba trường hợp:

- **Có thể bỏ khỏi giao diện:** chức năng cốt lõi vẫn chạy nếu giữ dữ liệu cũ hoặc cung cấp mặc định phù hợp.
- **Có thể hoãn nếu chưa dùng nghiệp vụ:** ví dụ CTV, tester, nhập hàng theo chuyến. Chưa kết luận cửa hàng không sử dụng các nghiệp vụ này.
- **Đang bắt buộc trong hệ thống:** muốn bớt ô nhập phải tự điền hoặc chỉnh quy tắc xử lý; không chỉ xóa ô nhập.

Khuyến nghị là giảm phần phải nhìn và nhập hằng ngày, giữ dữ liệu, lịch sử và kiểm soát tồn/tiền ở phía sau. Không đề xuất xóa bảng dữ liệu.

## 1. Toàn bộ menu quản trị

| Hạng mục hiện có | Đề xuất giai đoạn đầu | Điều kiện và phần cần giữ |
|---|---|---|
| Tổng quan | Giữ, giảm số thẻ | Ưu tiên đơn chờ xác nhận, chuẩn bị giao, đang giao, hàng sắp hết. Chỉ hiện cảnh báo hạn dùng nếu bán hàng có hạn. |
| Đơn hàng | Giữ | Tạo đơn, xác nhận tiền/COD, bàn giao, hoàn tất, hủy, trả hàng. |
| Đánh giá | Có thể hoãn cả phân hệ | Nếu hoãn, đồng bộ cả khu đánh giá và gửi đánh giá trên trang khách; chỉ ẩn menu admin thì chức năng khách vẫn tồn tại. |
| Cộng tác viên | Có thể hoãn nếu chưa bán qua CTV | Bao gồm đơn đăng ký, mã giới thiệu, tuyến trên/dưới, hoa hồng, chi trả và cổng CTV. Nếu có giao dịch/hoa hồng cũ phải giữ quyền đối soát. |
| Tồn kho | Giữ, ưu tiên xem theo sản phẩm | Xem theo lô, giá trị tồn, tester để ở màn chi tiết hoặc tùy chọn phụ. |
| Phiếu kho | Giữ | Là luồng thay đổi tồn; ưu tiên Nhập hàng, các loại phiếu khác chỉ mở khi cần. |
| Chờ kiểm tra | Đưa vào Kho → Hàng trả cần kiểm tra | Không cần menu riêng thường trực khi chưa có hàng trả; giữ cơ chế cách ly hàng trả. |
| Chuyến hàng | Có thể hoãn nếu chưa cần phân bổ chi phí chuyến VN→MM | Khi dùng phải giữ chi phí và phân bổ vốn. Hàng mua MMK không cần gắn chuyến VN→MM. |
| Cảnh báo | Có thể gộp vào Tồn kho/Tổng quan | Giữ cảnh báo hết hàng và hạn dùng phù hợp. Có thể hoãn tab Gợi ý đặt thêm. |
| Sản phẩm | Giữ, giảm trường nhập | Chi tiết ở phần 2. |
| Danh mục | Giữ, đưa thành mục con trong Sản phẩm | Không cần menu chính riêng. Có thể dùng một cấp ở giai đoạn đầu. |
| Giá & tỷ giá | Giữ như công cụ phụ nếu đang tính giá tự động | Nếu nhập giá bán trực tiếp, không cần dùng công cụ này mỗi lần; không bỏ dữ liệu vốn/tỷ giá đã gắn lô. |
| Banner | Có thể đưa vào Cài đặt → Giao diện | Một banner dùng chung là đủ; nhiều ảnh, theo ngôn ngữ, lên lịch đều có thể hoãn. |
| Bộ sưu tập | Có thể hoãn | Trang chủ đã có Sản phẩm mới và các nhóm danh mục, vẫn giới thiệu được hàng. |
| Báo cáo | Giữ bản cơ bản | Đơn hoàn thành, doanh thu, giá vốn, lãi gộp; báo cáo chi tiết xem ở phần 7. |
| Nhân viên | Chuyển vào Cài đặt | Nếu chỉ chủ shop dùng thì không cần tạo thêm tài khoản. Vẫn giữ đăng nhập, quyền và khả năng khóa tài khoản. |
| Tài khoản khách | Chuyển vào Cài đặt/Hỗ trợ khách | Không cần dùng thường xuyên, nhưng hiện khách phải đăng nhập để đặt hàng. Không thể bỏ tài khoản khỏi luồng khách bằng cách ẩn menu này. |
| Cài đặt | Giữ, giảm ô hiện mặc định | Có thể dùng các giá trị cấu hình đã lưu; những tham số chuyên sâu đưa vào phần nâng cao. |
| Kho hàng | Chuyển vào Cài đặt | Giữ cấu hình và cách tính giá của từng kho; không cần là menu chính riêng. |
| Địa bàn giao hàng | Chuyển vào Cài đặt | Giữ dữ liệu vùng/huyện/thị trấn đang phục vụ nhập địa chỉ và xuất VTP. |

## 2. Sản phẩm — từng nhóm và từng trường

### Thông tin chung

| Trường | Bắt buộc hiện tại? | Đề xuất |
|---|---|---|
| Slug (URL) | Có | Không cần nhập tay: sinh từ tên, xử lý trùng; giữ slug cũ khi sửa sản phẩm. |
| Thương hiệu | Có | Giữ khi hàng có hãng; nếu muốn bỏ ô phải có quy tắc gán thương hiệu hợp lệ, vì dữ liệu hiện yêu cầu. |
| Danh mục | Có | Giữ, giúp quản lý và khách tìm hàng. |
| Kho | Phải có kho bán hợp lệ; backend có cơ chế chọn mặc định | Nếu chỉ một kho thì tự chọn và ẩn ô; nhiều kho có cách tính giá khác nhau thì giữ. |
| Lãi cố định MMK/đơn vị | Tùy cách tính giá | Cần khi muốn tính giá tự động cho kho LOCAL_MMK; có thể không hiện khi chỉ nhập giá bán trực tiếp. |
| Hiển thị trên web | Có giá trị mặc định ẩn | Giữ nút bật/tắt rõ ràng; không cần hai nơi điều khiển cùng xuất hiện trong một màn. |
| Điều kiện bảo quản | Không | Có thể bỏ ô nhập; nội dung hiện dùng ở trang sản phẩm cho khách. Giữ dữ liệu cũ. |
| Quản lý hạn sử dụng | Có giá trị mặc định bật | Giữ cho mỹ phẩm/hàng có hạn. Túi/phụ kiện có thể mặc định không quản lý hạn, nhưng cần quy tắc đúng theo sản phẩm. Không tắt hàng loạt mỹ phẩm. |
| Hạn sau mở nắp | Không | Có thể bỏ khỏi màn nhập chính. Khác với hạn dùng của từng lô. |
| Thành phần INCI | Không | Có thể bỏ khỏi màn nhập chính nếu chưa cần mô tả chuyên sâu; không áp dụng máy móc cho sản phẩm cần công bố thông tin này theo hoạt động của shop. |

### Nội dung và ảnh

| Hạng mục | Hiện tại | Đề xuất |
|---|---|---|
| Tên Myanmar | Bắt buộc | Giữ tên theo ngôn ngữ khách sử dụng. |
| Tên tiếng Anh | Cũng bắt buộc | Có thể giảm thành một ô Tên sản phẩm với quy tắc dùng chung/dự phòng; cần sửa kiểm tra dữ liệu và cách hiển thị trước. |
| Mô tả Myanmar/Anh | Không bắt buộc khi lưu | Ưu tiên một mô tả ngắn bằng ngôn ngữ chính; bản dịch bổ sung khi cần. Hiện thiếu mô tả chỉ là cảnh báo. |
| Cách dùng Myanmar/Anh | Không bắt buộc khi lưu | Có thể bỏ ô riêng với túi/phụ kiện, ghi thông tin cần thiết vào mô tả; lưu ý điều chỉnh cảnh báo thiếu cách dùng nếu bỏ giao diện. |
| Loại da | Không | Có thể bỏ bộ lọc này nếu chưa bán mỹ phẩm theo loại da. |
| Vấn đề da | Không | Có thể bỏ. |
| Thành phần nổi bật | Không | Có thể bỏ. Nếu bỏ các tag cần đồng bộ bộ lọc trang khách. |
| Ảnh sản phẩm | Thiếu ảnh là cảnh báo, không chặn mở bán | Nên giữ ít nhất một ảnh để bán hàng; không bắt buộc nhập nhiều ảnh. |
| Mô tả ảnh (alt) | Không bắt buộc với ảnh sản phẩm | Có thể tự điền từ tên sản phẩm và giữ khả năng sửa; không nên loại bỏ thuộc tính alt khỏi ảnh hiển thị. |
| Sắp xếp ảnh | Tiện ích | Không cần hiện nhiều nút khi chỉ có một ảnh; vẫn cần cách chọn ảnh đại diện khi có nhiều ảnh. |
| Kiểm tra trước khi mở bán | Có lỗi chặn và cảnh báo | Giữ lỗi chặn; thu gọn các cảnh báo bổ sung, không buộc người dùng đọc toàn bộ mỗi lần. |

### Biến thể

| Trường | Đề xuất | Ràng buộc |
|---|---|---|
| SKU | Giữ, có thể sinh tự động cho hàng mới | Hiện bắt buộc và duy nhất; không đổi mã hàng cũ tùy tiện. |
| Tên biến thể | Giữ khi có màu/dung tích | Hàng chỉ có một loại có thể tự điền “Tiêu chuẩn”; trường hiện bắt buộc. |
| Giá MMK | Giữ | Cho phép lưu nháp giá 0 nhưng mở bán yêu cầu giá dương. |
| Khối lượng | Giữ theo nghiệp vụ | Bắt buộc mở bán đối với kho hàng nhập VN; kho LOCAL_MMK là cảnh báo, nhưng xuất thông tin VTP có thể cần khối lượng. |
| Báo tồn thấp | Đã bỏ ô nhập theo yêu cầu trước | Giá trị cũ vẫn được giữ; biến thể mới mặc định 5. |
| Thời gian VN→MM | Đã bỏ ô nhập theo yêu cầu trước | Giá trị cũ vẫn được giữ; biến thể mới mặc định 21 ngày. |
| Tồn an toàn | Đã bỏ ô nhập theo yêu cầu trước | Giá trị cũ vẫn được giữ; biến thể mới mặc định 0. |
| Đang dùng | Có thể không hiện cho biến thể mới | Mặc định bật; biến thể cũ vẫn cần cách ngừng dùng, tránh phải xóa lịch sử. |
| Là combo / Thành phần combo | Có thể hoãn nếu chỉ bán từng món | Nếu đã có combo phải giữ thông tin thành phần vì liên quan trừ tồn. |
| Thêm biến thể | Chỉ dùng khi cần | Có thể đưa thành nút “Thêm màu/dung tích”; sản phẩm một loại không cần thao tác. |

### Các tiện ích trên danh sách sản phẩm

- Giữ tìm kiếm, lọc danh mục/trạng thái và nút sửa; lọc thương hiệu/kho đưa vào Lọc thêm khi ít dùng.
- Giữ Hiện/Ẩn/Xóa khi đã chọn dòng; thanh thao tác hàng loạt có thể chỉ xuất hiện sau khi tick.
- Đổi kho hàng loạt có thể đưa vào Thao tác khác. Đổi kho của sản phẩm không tự chuyển hàng tồn.
- Sao chép sản phẩm, import Excel/CSV là tiện ích không bắt buộc nhưng có lợi với danh sách lớn; đưa vào menu Thêm thay vì nút lớn thường trực.
- Thêm thương hiệu và Thêm danh mục không cần chiếm hai khối ở cuối trang; chuyển sang nút nhỏ tại ô chọn hoặc trang quản lý tương ứng.
- Cột biến thể có thể hiện số biến thể và giá, mở chi tiết mới thấy toàn bộ SKU; giảm chữ ở bảng chính.

## 3. Danh mục

| Trường | Đề xuất |
|---|---|
| Tên Myanmar/Anh | Hiện cả hai bắt buộc; có thể dùng một tên chính và dự phòng bản dịch sau khi chỉnh quy tắc lưu. |
| Slug | Sinh tự động khi tạo mới; giữ cơ chế chuyển hướng đường dẫn cũ khi đổi. |
| Danh mục cha | Có thể bỏ ô ở giai đoạn đầu, tạo một cấp; giữ quan hệ cũ nếu đã có. |
| Thứ tự | Tự xếp theo lúc tạo hoặc dùng nút lên/xuống; không cần ô số trên mỗi mục. |
| Icon/ảnh danh mục | Không bắt buộc; trang chủ đã có hiển thị chữ cái thay thế khi thiếu ảnh. |

## 4. Đơn hàng, giao hàng, thanh toán

| Hạng mục | Đề xuất | Điều kiện |
|---|---|---|
| Sản phẩm, số lượng, tên người nhận, SĐT chính, thị trấn và địa chỉ | Giữ | Dữ liệu thiết yếu tạo và giao đơn. |
| SĐT phụ | Có thể bỏ ô thường trực | Không bắt buộc; mở qua “Thêm số liên hệ” nếu cần. |
| Ghi chú đơn | Không bắt buộc, có thể thu gọn | Hữu ích cho giờ giao/yêu cầu của khách nên chưa cần xóa chức năng. |
| Kênh Facebook/Viber/Điện thoại | Có thể tự chọn một mặc định nếu shop chỉ dùng một kênh | Giữ dữ liệu kênh cũ và WEB cho đơn khách tự đặt. |
| Gán CTV / hoa hồng / hoa hồng cấp trên | Có thể hoãn nếu chưa dùng CTV | Phải đồng bộ luồng mã giới thiệu và cổng CTV, giữ giao dịch cũ. |
| Người trả phí vận chuyển | Có thể mặc định người nhận nếu luôn áp dụng chính sách đó | Không thay đổi các đơn đã chốt người gửi trả phí. |
| COD và chuyển khoản | Chỉ hiện phương thức thực sự nhận | Hiện cả hai đang được hỗ trợ; muốn bỏ một phương thức cần sửa đồng bộ lựa chọn/kiểm tra và giữ xử lý đơn cũ. |
| Đối soát COD | Giữ khi bán COD | Khách đã trả cho đơn vị vận chuyển khác với shop đã nhận được tiền. Không gộp hai mốc. |
| Phí, tiền nhận, mã đối soát COD | Đang bắt buộc trong biểu mẫu đối soát | Có thể tự điền phí 0 nếu thật sự không có; muốn bỏ ô mã đối soát phải thiết kế cách truy vết thay thế. |
| Điều chỉnh/ghi chú chênh lệch COD | Chỉ hiện khi có ngoại lệ | Không cần cho đơn bình thường. |
| Phiếu soạn/in hàng loạt | Có thể hoãn khi ít đơn | Cấu hình bắt buộc in phiếu hiện mặc định tắt; không thay đổi cấu hình đã bật nếu đang dùng. |
| In nhãn giao hàng | Tiện ích, có thể giữ trong menu In | Không cần nhiều nút in trên màn chính. |
| Xuất VTP Excel / sao chép thông tin VTP | Có thể hoãn nếu đang nhập đơn vận chuyển thủ công | Nếu VTP là công cụ giao hàng chính thì vẫn nên giữ như thao tác phụ. |
| Mã vận đơn, đơn vị vận chuyển | Nên giữ khi giao hàng | Không cần lặp lại nhiều khối nhập; hiển thị đúng giai đoạn bàn giao. |
| Hủy / trả hàng / hoàn tiền | Giữ, hiện theo trạng thái | Những thao tác này liên quan tiền và tồn, không chỉ đổi nhãn trạng thái. |
| Lịch sử đơn, lô đã xuất | Có thể thu gọn | Giữ dữ liệu để truy vết, mở khi cần. |
| Bộ lọc nhiều chiều | Đưa vào Lọc thêm | Mặc định chỉ cần tìm mã/SĐT, trạng thái, ngày. |

## 5. Tồn kho, phiếu kho, lô và chuyến hàng

| Hạng mục | Đề xuất | Ràng buộc |
|---|---|---|
| Nhập kho: sản phẩm/SKU, kho nhận, số lượng, giá mua | Giữ | Giá mua dùng đúng VND/MMK theo kho. |
| Số lô | Cần dữ liệu, có thể sinh tự động | Backend hiện yêu cầu. Muốn giảm nhập tay cần mã tự động không trùng và không gộp lô khác giá/hạn. |
| Hạn sử dụng/trạng thái hạn | Giữ với hàng có hạn | Hàng không quản lý hạn thì không cần hiện ô ngày; không biến hàng chưa biết hạn thành không có hạn. |
| Ngày sản xuất | Không bắt buộc | Có thể bỏ ô khỏi biểu mẫu chính. |
| Loại tồn Bán được/Tester | Có thể mặc định Bán được nếu không dùng tester | Không gộp tồn tester đã có vào hàng bán. |
| Ghi chú phiếu nhập/chuyển | Không bắt buộc | Có thể thu gọn. Lý do xuất khác/điều chỉnh vẫn bắt buộc. |
| Chọn chuyến hàng | Có thể bỏ khỏi nhập hàng nếu chưa dùng quản lý chuyến | Với lô đã thuộc chuyến, cần giữ quan hệ đúng. |
| Cước ước tính theo kg | Có thể hoãn nếu chấp nhận chưa tính đủ vốn hàng nhập | Không được gọi lãi hiển thị là lãi đầy đủ khi thiếu các chi phí này. |
| Giá trị mặc định / Dán Excel / Tách lô | Tiện ích phụ | Thu gọn, chỉ mở khi nhập nhiều mặt hàng/lô; có thể giữ import để giảm công nhập dữ liệu. |
| Chọn lô khi xuất/chuyển | Có thể để tự động FEFO nơi hệ thống cho phép | Điều chỉnh tồn vẫn cần chọn lô; không bỏ quản lý lô phía sau. |
| Phiếu chuyển kho | Chỉ hiện khi nhiều kho hoặc có hàng cần chuyển | Giữ luồng chuyển hàng thật, phân biệt với đổi kho gán sản phẩm. |
| Phiếu xuất khác/điều chỉnh | Đưa vào Thao tác khác | Giữ lý do và lịch sử; không sửa tồn trực tiếp ngoài phiếu. |
| Nháp → Ghi sổ | Giữ | Chỉ ghi sổ mới thay đổi tồn; nên làm lời hướng dẫn/nút rõ hơn thay vì bỏ bước. |
| Xem theo lô/sổ kho/giá vốn chi tiết | Thu gọn vào chi tiết | Danh sách chính tập trung tên, SKU, tồn thực, giữ hàng và khả dụng. |
| Khu chờ kiểm tra hàng trả | Giữ cơ chế, gộp lối vào | Tránh đưa hàng khách trả vào bán ngay trước kiểm tra. |
| Chuyến hàng: mã, ngày đi, chi phí, phân bổ | Có thể hoãn cả quy trình khi chưa cần | Mã chuyến bắt buộc nếu tạo; ngày đi/ghi chú tùy chọn. Nếu cần tính vốn thực tế theo chuyến, giữ chi phí và một phương pháp phân bổ thống nhất. |
| Phương pháp phân bổ theo giá trị/số lượng/khối lượng | Có thể dùng một mặc định trong cấu hình | Giữ phương pháp cũ của chuyến đã xử lý và lịch sử phân bổ. |

## 6. Giá & tỷ giá

- **Nếu nhập giá bán trực tiếp:** không bắt buộc chạy tính giá hàng loạt cho từng sản phẩm. Giữ công cụ ở vị trí phụ.
- **Nếu tính giá tự động cho hàng VN:** giữ tỷ giá, mức lãi, cước/kg, khối lượng và vốn phù hợp. Bỏ những đầu vào này làm thay đổi cách tính giá.
- **Nếu tính giá tự động cho kho mua MMK:** giữ vốn lô và lãi cố định; không cần nhập tỷ giá USD/VND cho công thức LOCAL_MMK.
- Ghi chú tỷ giá không bắt buộc. Lọc thương hiệu/danh mục, mức làm tròn, lịch sử lần chạy có thể thu gọn; giữ cấu hình làm tròn đã lưu.
- Xem trước → Áp dụng nên giữ khi cập nhật nhiều giá; không áp giá hàng loạt ngay sau khi nhập tham số mà thiếu bước kiểm tra.
- Lịch sử giá và cảnh báo dữ liệu đầu vào thay đổi phải giữ phía sau; không cần bày toàn bộ trên màn tạo giá.

## 7. Báo cáo và cảnh báo

| Hạng mục | Đề xuất |
|---|---|
| Số đơn, doanh thu, giá vốn, lãi gộp và lọc ngày | Giữ bản cơ bản. Hiển thị rõ số liệu tính theo đơn nào, có trừ hàng trả hay chưa. |
| Cảnh báo thiếu vốn/vốn tạm | Giữ, để không hiểu nhầm lợi nhuận. |
| Hoa hồng bán hàng/cấp trên/lãi sau hoa hồng | Có thể ẩn nếu chưa dùng CTV; không xóa số phát sinh. |
| Phí COD/lãi sau chi phí đã ghi nhận | Đưa vào chi tiết, vẫn giữ nếu nhận COD và đã ghi phí. |
| Top sản phẩm, hàng bán chậm, giá trị tồn, hàng đang về | Có thể hoãn hoặc đặt trong báo cáo chi tiết. |
| Phân tích truy cập/phễu/chuyển đổi | Có thể hoãn giao diện giai đoạn đầu. Không tác động luồng đặt hàng chỉ để bỏ báo cáo. |
| Sức khỏe dữ liệu | Đưa vào Công cụ quản trị; không cần là tab dùng hằng ngày. |
| Cảnh báo tồn thấp/hạn dùng | Giữ phần liên quan mặt hàng đang bán; gộp vào Kho/Tổng quan. |
| Gợi ý đặt thêm: tốc độ bán, số ngày đủ hàng, thời gian nhập | Có thể hoãn; đây là phần dùng ba trường tồn kho đã được bỏ khỏi giao diện biến thể. |

## 8. Nội dung, khách hàng, nhân viên và cài đặt

### Banner / Bộ sưu tập

- Không bắt buộc có banner để đặt hàng. Nếu dùng banner, ảnh desktop và mô tả alt hiện bắt buộc; ảnh mobile riêng, đường dẫn bấm, ngôn ngữ riêng, ngày bắt đầu/kết thúc đều có thể bỏ khỏi màn chính.
- Dùng một banner phù hợp nhiều cỡ màn hình cần kiểm tra cắt ảnh trên điện thoại; không kết luận mọi ảnh desktop đều dùng tốt cho mobile.
- Bộ sưu tập có thể hoãn hoàn toàn. Nếu vẫn dùng, slug và hai tên hiện bắt buộc; lịch hiển thị, sắp xếp chi tiết và lựa chọn hiện trang chủ có thể dùng mặc định.

### CTV

- Nếu chưa dùng, có thể ẩn cả phân hệ: danh sách, đăng ký, duyệt, cổng CTV, gán đơn, mã giới thiệu, hoa hồng và chi trả.
- Nếu vẫn bán qua CTV nhưng muốn gọn: giữ CTV một tầng; có thể hoãn cấp trên/tuyến dưới, % cấp trên riêng, lời mời tuyển thêm và chỉnh % trên từng đơn. Các khoản đã chốt phải được giữ.
- Thông tin nhận tiền và ảnh chứng từ chi trả là tùy chọn; thực tế vẫn nên có thông tin đủ để chi đúng người. Tên, SĐT, mã, tỷ lệ và thông tin tạo tài khoản hiện có ràng buộc riêng khi sử dụng phân hệ.

### Nhân viên / khách hàng

- Một chủ shop không cần tạo nhiều nhân viên; đưa quản lý nhân viên vào Cài đặt. Tạo tài khoản hiện cần tên, email, mật khẩu, vai trò phù hợp.
- Giữ đổi mật khẩu, đăng xuất, phân quyền, khóa tài khoản và nhật ký thao tác. Chúng có thể ít xuất hiện nhưng không nên bỏ cơ chế.
- Quản lý tài khoản khách là trang hỗ trợ, có thể đưa vào Cài đặt. Việc bỏ đăng ký/đăng nhập của khách là thay đổi luồng thanh toán riêng, không phải bỏ vài ô.

### Cài đặt

| Cài đặt | Đề xuất |
|---|---|
| Bật nhận đơn web | Giữ, dùng khi cần tạm dừng bán. |
| Bắt buộc phiếu soạn | Có thể giữ tắt giai đoạn đầu nếu chưa dùng; mặc định trong mã là tắt, giá trị thực tế đã lưu cần được bảo toàn. |
| Thời gian giữ hàng COD/chuyển khoản | Dùng cấu hình, không cần chỉnh hằng ngày; giữ cơ chế hết hạn giữ hàng. Mặc định trong mã là 24 giờ mỗi loại. |
| Ngưỡng ngừng bán/cảnh báo hạn dùng | Đưa nâng cao, áp dụng theo hàng có hạn. Mặc định trong mã là 90/180 ngày, cần shop xác định phù hợp trước khi vận hành. |
| Làm tròn giá / hạn bản xem trước | Có thể ẩn ô thường trực, giữ cấu hình. Mặc định 100 MMK / 3 ngày. |
| Kỳ dự báo đặt hàng / cửa sổ doanh số | Có thể ẩn nếu hoãn gợi ý nhập hàng. Mặc định 30/60 ngày. |
| Ngày chờ hoa hồng / % CTV / % cấp trên | Có thể ẩn nếu chưa dùng CTV; giữ số đã lưu. |
| Hướng dẫn chuyển khoản | Giữ khi nhận chuyển khoản, không để khách thiếu hướng dẫn thanh toán. |
| Tạo kho, loại kho, cách tính giá | Chỉ chủ shop cấu hình; tên/mã/cách tính giá là dữ liệu quan trọng khi có kho. |
| Địa bàn giao hàng | Không cần sửa thường xuyên; giữ dữ liệu và cờ vùng đang giao. Mã VTP đang dùng cho đơn không phải trường trang trí. |

Lưu ý triển khai: biểu mẫu Cài đặt hiện gửi một lần nhiều trường; action đọc checkbox không gửi thành false và lấy các số trực tiếp từ form. Nếu chỉ xóa ô HTML có thể ghi đè cấu hình hoặc gây lỗi lưu. Phải sửa cách giữ giá trị hiện tại ở server trước khi tinh gọn.

## 9. Trang khách hàng

| Phần | Đề xuất giai đoạn đầu |
|---|---|
| Trang chủ | Có thể chỉ giữ nhóm danh mục, sản phẩm mới và một banner nếu cần; bỏ các dải bộ sưu tập hoặc dải sản phẩm lặp lại. |
| Tìm kiếm/danh mục | Giữ tìm tên, nhóm hàng và phân trang; lọc loại da/vấn đề da có thể bỏ nếu không phù hợp hàng đang bán. Lọc hãng, sắp xếp giá là tiện ích có thể thu gọn. |
| Chi tiết sản phẩm | Giữ ảnh, tên, giá, chọn màu/dung tích khi có, tình trạng hàng, mua hàng và mô tả ngắn. |
| Cách dùng/thành phần/bảo quản/hạn sau mở nắp | Có thể không tách thành nhiều phần nếu chưa cần; dữ liệu trống đã được lọc khỏi các khối thông tin sản phẩm. Hàng mỹ phẩm vẫn nên cung cấp thông tin cần thiết cho người mua. |
| Đánh giá sao/bình luận | Có thể hoãn đồng bộ cả hiển thị, gửi và duyệt đánh giá. |
| Ngôn ngữ | Chọn theo khách thực tế; có thể giảm lựa chọn ngôn ngữ phụ, nhưng phải xử lý dữ liệu dự phòng và đường dẫn hiện có. Không tự bỏ MY/EN chỉ để giảm ô nhập. |
| Liên hệ Messenger/Viber | Có thể ưu tiên một kênh; không cần lặp cùng liên hệ ở nhiều vị trí. Giữ ít nhất một cách liên hệ rõ ràng. |
| Giỏ hàng | Giữ sản phẩm, số lượng, giá/tổng tiền và đi thanh toán. |
| Thanh toán | Giữ tên, SĐT chính, địa chỉ gồm thị trấn, mặt hàng, số lượng, phương thức trả tiền và tổng tiền. |
| SĐT phụ / ghi chú / lưu sổ địa chỉ | Có thể bỏ hoặc thu gọn; địa chỉ đã lưu là tiện ích, không bắt buộc tạo đơn ở tầng nghiệp vụ. |
| Bắt buộc đăng nhập trước thanh toán | Có thể cân nhắc cho mua không cần tài khoản để bớt bước, nhưng hiện cả trang và action đều yêu cầu khách đăng nhập. Cần thiết kế lại xác nhận/tra cứu quyền xem đơn và luồng theo dõi, không chỉ bỏ màn đăng nhập. |
| Hồ sơ/sổ địa chỉ/nhận lại đơn cũ | Có thể hoãn các tiện ích nâng cao nếu thay đổi luồng tài khoản; vẫn phải bảo vệ thông tin đơn. |
| Tra cứu đơn | Nên giữ để khách biết tình trạng và giảm số tin nhắn hỏi. |
| Giới thiệu/giao hàng/thanh toán/đổi trả/quyền riêng tư | Có thể viết ngắn, dễ hiểu; không đề xuất loại bỏ toàn bộ thông tin shop, thanh toán, đổi trả và xử lý dữ liệu khách. Đây là đề xuất sản phẩm, không phải đánh giá nghĩa vụ pháp lý. |

## 10. Cấu trúc gọn đề xuất

Menu chính chỉ cần 7 mục:

1. Tổng quan.
2. Đơn hàng — bên trong có COD, giao hàng, in/xuất.
3. Sản phẩm — bên trong có Danh mục, Thương hiệu, Import và công cụ Giá nếu dùng.
4. Tồn kho — bên trong có Hàng trả cần kiểm tra và Cảnh báo.
5. Nhập/Xuất kho — tập trung Nhập hàng, các phiếu khác trong Thao tác khác.
6. Báo cáo — mặc định bản cơ bản.
7. Cài đặt — Kho, Địa bàn giao hàng, Nhân viên, hỗ trợ Tài khoản khách, Nội dung và tham số nâng cao.

CTV và Chuyến hàng thêm lại khi shop cần nghiệp vụ đó; nếu đang sử dụng thì giữ lối vào phù hợp.

Màn tạo sản phẩm mặc định: Tên, ảnh, mô tả ngắn, thương hiệu, danh mục, kho nếu có nhiều kho, giá, khối lượng theo nghiệp vụ; phần màu/dung tích chỉ thêm khi có. Slug/SKU có thể được sinh tự động sau khi triển khai quy tắc phù hợp. Hạn dùng hiển thị theo loại hàng.

## 11. Thứ tự nên làm

1. **Ít ảnh hưởng:** bỏ các ô tùy chọn khỏi màn chính, gộp menu, chỉ hiện thao tác theo ngữ cảnh, giữ dữ liệu cũ.
2. **Cần chỉnh quy tắc lưu:** tự sinh slug/SKU/số lô; một tên/ngôn ngữ chính; cài đặt mặc định và điều kiện hiển thị theo loại hàng/kho.
3. **Thay đổi nghiệp vụ:** hoãn CTV, chuyến hàng, đánh giá; mua không cần tài khoản; thay đổi cách tính giá. Thực hiện sau khi xác định shop có đang dùng hay không.

Các thay đổi đã làm trước báo cáo: Sửa/Xóa thành icon cùng hàng; bỏ ba ô thiết lập tồn kho khỏi biến thể. Điều kiện bảo quản vẫn còn trong biểu mẫu ở thời điểm rà soát này.

## Căn cứ mã nguồn chính

- Menu: `D:/2. BO NAO/WEB TC/src/server/admin/nav.ts`.
- Biểu mẫu sản phẩm: `D:/2. BO NAO/WEB TC/src/components/admin/product-form.tsx`.
- Ràng buộc sản phẩm: `D:/2. BO NAO/WEB TC/src/server/catalog/products.ts`, `src/server/catalog/readiness-rules.ts` (cùng thư mục gốc dự án).
- Đơn hàng: `D:/2. BO NAO/WEB TC/src/server/orders/orders.ts`, `D:/2. BO NAO/WEB TC/src/server/orders/state-machine.ts`.
- Kho: `D:/2. BO NAO/WEB TC/src/server/inventory/documents.ts`, `D:/2. BO NAO/WEB TC/src/server/inventory/warehouses.ts`.
- Giá: `D:/2. BO NAO/WEB TC/src/server/pricing/runs.ts`.
- Cài đặt: `D:/2. BO NAO/WEB TC/src/server/settings.ts`, `D:/2. BO NAO/WEB TC/src/server/settings-actions.ts`.
- Nội dung/CTV: `D:/2. BO NAO/WEB TC/src/server/content/`, `D:/2. BO NAO/WEB TC/src/server/affiliates/`.
- Checkout: `D:/2. BO NAO/WEB TC/src/app/[locale]/checkout/page.tsx`, `D:/2. BO NAO/WEB TC/src/server/cart/actions.ts`.
- Trang khách: `D:/2. BO NAO/WEB TC/src/components/store/home-catalog.tsx`, `D:/2. BO NAO/WEB TC/src/components/store/catalog-filters.tsx`, `D:/2. BO NAO/WEB TC/src/app/[locale]/p/[slug]/page.tsx`.
