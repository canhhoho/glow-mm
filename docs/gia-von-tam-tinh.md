# Giá bán và giá vốn hàng nhập VN

Giá bán theo kho VN_IMPORT dùng **giá mua gốc VND × tỷ giá × (1 + % lãi) + cước MMK/kg × khối lượng**. Lãi chỉ tính trên giá mua gốc. Chi phí chuyến không được đưa trở lại đầu vào này. Cách tính cũ không chọn kho, không cộng cước/kg, vẫn dùng giá vốn đã phân bổ nếu có.

## Nhập hàng không có chuyến

Trên phiếu nhập, điền **Cước tạm tính VN → MM (MMK/kg)**. Giá trị gợi ý lấy từ lần tính giá gần nhất; người nhập có thể sửa hoặc để trống. Số 0 thể hiện cước bằng 0, khác với để trống là chưa biết.

Khi ghi sổ, lô VND chưa có giá vốn được tính tạm bằng giá mua quy đổi MMK cộng cước theo khối lượng. Tỷ giá gắn với lô, cước và khối lượng được lưu lại. Thiếu tỷ giá, khối lượng hoặc cước thì lô vẫn báo **Thiếu giá vốn**, không được coi là giá vốn thực tế bằng 0. Không tạo giá vốn tạm cho lô MMK vì lô này có giá vốn ngay từ giá mua.

Lô cũ đã ghi sổ có thể tính hoặc tính lại giá vốn tạm tại trang chi tiết lô. Thao tác yêu cầu quyền nhập kho, có kiểm tra dữ liệu và ghi nhật ký. Tỷ giá đã gắn với lô được giữ; nếu chưa có thì dùng tỷ giá hiện hành.

## Thứ tự ưu tiên và báo cáo

1. Có giá vốn thực tế MMK: dùng **Thực tế**.
2. Chưa có thực tế, có giá vốn tạm: dùng **Tạm tính**.
3. Không có cả hai: **Thiếu giá vốn**.

Trang tồn kho và báo cáo tồn tính cả phần tạm, đồng thời hiển thị số lượng dùng vốn tạm. Báo cáo lợi nhuận cảnh báo các đơn dùng giá vốn tạm hoặc thiếu giá vốn.

Đơn hàng chụp cả giá vốn và trạng thái khi xuất hàng. Phân bổ chuyến hoặc tính lại vốn tạm sau đó không đổi số liệu đã chụp của đơn cũ. Do đó lợi nhuận lịch sử dùng vốn tạm vẫn có cảnh báo, kể cả khi lô đã có vốn thực tế.

## Cập nhật dữ liệu

Migration `20261105090000_estimated_inventory_cost` thêm các trường cần thiết. Các bản xem trước giá có cước/kg đang chờ được huỷ để người dùng tạo lại bằng công thức đã sửa. Giá bán đã áp dụng và lịch sử giá được giữ.

Giá vốn tạm của lô cũ không được tự điền bằng cước hiện tại. Người dùng tính tại trang chi tiết lô sau khi kiểm tra cước. Các giá vốn 0 trong đơn cũ được đánh dấu thiếu do dữ liệu cũ không phân biệt được vốn 0 hợp lệ với thiếu vốn; các đơn mới lưu trạng thái rõ ràng.
