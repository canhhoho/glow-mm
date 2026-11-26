# Rà soát nút thao tác — 08/11/2026

> **LỊCH SỬ** — quy chuẩn hiện hành: [docs/design-system.md](design-system.md) (26/11/2026). Giữ để tra cứu, không cập nhật.

Đã áp dụng quy tắc hiển thị: lưu biểu mẫu và thao tác hàng loạt dùng icon kèm chữ; sửa/xóa/khóa theo dòng dùng icon đơn. Nút thêm mới và thao tác ở khối chi tiết giữ icon kèm chữ.

Đối chiếu mã nguồn sau thay đổi: **93/93 vị trí** theo quy tắc đã chọn — **31 chỉ icon**, **62 icon kèm chữ**, **0 chỉ chữ** trong phạm vi thống kê. Đây không phải số nút thực tế sau khi nhân số dòng dữ liệu.

## Cách đếm

- Đếm vị trí nút/menu thao tác quản lý dữ liệu, không nhân số bản ghi, ngôn ngữ hay quyền truy cập.
- Nút mở form và nút lưu là hai vị trí riêng vì có thể hiển thị khác nhau. Form thêm/sửa dùng chung đếm một lần trong nhóm Sửa/lưu; OrderForm dùng chung admin/CTV đếm một lần. Khóa/mở khóa chung một nút đếm một vị trí; hiện và ẩn hàng loạt là hai nút riêng. AccountRowActions được mở rộng thành 3 thao tác tại mỗi nơi sử dụng, không đếm lại phần triển khai component.
- Bao gồm nút thêm/bỏ dòng và ảnh, lưu cấu hình, địa chỉ, hồ sơ, giỏ hàng.
- Không tính liên kết tiêu đề/mã bản ghi chỉ dẫn tới chi tiết, tab điều hướng (kể cả tab Tạo đơn CTV), checkbox, nhập liệu tự động lưu, xác thực/đăng ký/đổi mật khẩu, mua ngay/đặt hàng/thêm giỏ, duyệt/từ chối, hủy nghiệp vụ, khôi phục, di chuyển/sắp xếp, thu tiền, tính giá, phân bổ, in/xuất và xem trước/import. Đây là thống kê các vị trí CRUD trong phạm vi trên, không phải số nghiệp vụ toàn hệ thống.
- Mốc so sánh: nút chỉ icon như Sản phẩm/Thương hiệu/Danh mục; icon có nhãn hỗ trợ truy cập và chú thích. “Icon + chữ” đã có icon nhưng chưa cùng cách hiển thị; “Chỉ chữ” cần bổ sung icon. Ký tự + gõ trực tiếp không tính là icon từ bộ lucide.

## Tổng hợp trước đồng bộ

| Nhóm | Tổng vị trí | Chỉ icon | Icon + chữ | Chỉ chữ | Chưa cùng kiểu chỉ icon |
|---|---:|---:|---:|---:|---:|
| Thêm mới | 30 | 5 | 5 | 20 | 25 |
| Sửa / lưu | 30 | 7 | 0 | 23 | 23 |
| Xóa / bỏ | 23 | 6 | 0 | 17 | 17 |
| Khóa / bật tắt | 10 | 3 | 0 | 7 | 7 |
| Tổng | 93 | 21 | 5 | 67 | 72 |

## Chi tiết từng vị trí sau đồng bộ

| STT | Khu vực | Nhóm | Thao tác | Trước | Sau | Mã nguồn |
|---:|---|---|---|---|---|---|
| 1 | Admin / dùng chung CTV | Sửa / lưu | Sửa Nhân viên ở danh sách | Chỉ icon | Chỉ icon | [src/app/admin/(panel)/users/page.tsx:75](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/users/page.tsx:75>) |
| 2 | Admin / dùng chung CTV | Xóa / bỏ | Xóa Nhân viên ở danh sách | Chỉ icon | Chỉ icon | [src/app/admin/(panel)/users/page.tsx:75](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/users/page.tsx:75>) |
| 3 | Admin / dùng chung CTV | Khóa / bật tắt | Khóa/mở khóa Nhân viên ở danh sách | Chỉ icon | Chỉ icon | [src/app/admin/(panel)/users/page.tsx:75](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/users/page.tsx:75>) |
| 4 | Admin / dùng chung CTV | Sửa / lưu | Sửa CTV ở danh sách | Chỉ icon | Chỉ icon | [src/app/admin/(panel)/affiliates/page.tsx:87](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/affiliates/page.tsx:87>) |
| 5 | Admin / dùng chung CTV | Xóa / bỏ | Xóa CTV ở danh sách | Chỉ icon | Chỉ icon | [src/app/admin/(panel)/affiliates/page.tsx:87](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/affiliates/page.tsx:87>) |
| 6 | Admin / dùng chung CTV | Khóa / bật tắt | Khóa/mở khóa CTV ở danh sách | Chỉ icon | Chỉ icon | [src/app/admin/(panel)/affiliates/page.tsx:87](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/affiliates/page.tsx:87>) |
| 7 | Admin / dùng chung CTV | Sửa / lưu | Sửa Khách hàng ở danh sách | Chỉ icon | Chỉ icon | [src/app/admin/(panel)/customer-accounts/page.tsx:77](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/customer-accounts/page.tsx:77>) |
| 8 | Admin / dùng chung CTV | Xóa / bỏ | Xóa Khách hàng ở danh sách | Chỉ icon | Chỉ icon | [src/app/admin/(panel)/customer-accounts/page.tsx:77](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/customer-accounts/page.tsx:77>) |
| 9 | Admin / dùng chung CTV | Khóa / bật tắt | Khóa/mở khóa Khách hàng ở danh sách | Chỉ icon | Chỉ icon | [src/app/admin/(panel)/customer-accounts/page.tsx:77](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/customer-accounts/page.tsx:77>) |
| 10 | Admin / dùng chung CTV | Thêm mới | Mở trang thêm nhân viên | Icon + chữ | Icon + chữ | [src/app/admin/(panel)/users/page.tsx:31](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/users/page.tsx:31>) |
| 11 | Admin / dùng chung CTV | Thêm mới | Mở trang thêm CTV | Icon + chữ | Icon + chữ | [src/app/admin/(panel)/affiliates/page.tsx:40](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/affiliates/page.tsx:40>) |
| 12 | Admin / dùng chung CTV | Thêm mới | Mở trang tạo đơn | Icon + chữ | Icon + chữ | [src/app/admin/(panel)/orders/page.tsx:45](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/orders/page.tsx:45>) |
| 13 | Admin / dùng chung CTV | Thêm mới | Mở trang thêm banner | Icon + chữ | Icon + chữ | [src/app/admin/(panel)/content/banners/page.tsx:24](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/content/banners/page.tsx:24>) |
| 14 | Admin / dùng chung CTV | Thêm mới | Mở form thêm thương hiệu | Chỉ icon | Icon + chữ | [src/app/admin/(panel)/products/page.tsx:47](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/products/page.tsx:47>) |
| 15 | Admin / dùng chung CTV | Thêm mới | Đi tới thêm danh mục | Chỉ icon | Icon + chữ | [src/app/admin/(panel)/products/page.tsx:52](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/products/page.tsx:52>) |
| 16 | Admin / dùng chung CTV | Thêm mới | Mở trang thêm sản phẩm | Chỉ icon | Icon + chữ | [src/app/admin/(panel)/products/page.tsx:58](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/products/page.tsx:58>) |
| 17 | Admin / dùng chung CTV | Sửa / lưu | Sửa sản phẩm ở danh sách | Chỉ icon | Chỉ icon | [src/app/admin/(panel)/products/page.tsx:160](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/products/page.tsx:160>) |
| 18 | Admin / dùng chung CTV | Sửa / lưu | Sửa danh mục ở danh sách | Chỉ icon | Chỉ icon | [src/app/admin/(panel)/categories/page.tsx:82](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/categories/page.tsx:82>) |
| 19 | Admin / dùng chung CTV | Xóa / bỏ | Xóa danh mục | Chỉ icon | Chỉ icon | [src/app/admin/(panel)/categories/page.tsx:84](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/categories/page.tsx:84>) |
| 20 | Admin / dùng chung CTV | Thêm mới | Thêm thương hiệu | Chỉ icon | Icon + chữ | [src/components/admin/catalog-forms.tsx:31](<D:/2. BO NAO/WEB TC/src/components/admin/catalog-forms.tsx:31>) |
| 21 | Admin / dùng chung CTV | Thêm mới | Thêm danh mục | Chỉ icon | Icon + chữ | [src/components/admin/catalog-forms.tsx:67](<D:/2. BO NAO/WEB TC/src/components/admin/catalog-forms.tsx:67>) |
| 22 | Admin / dùng chung CTV | Sửa / lưu | Mở sửa thương hiệu | Chỉ icon | Chỉ icon | [src/components/admin/brand-actions.tsx:30](<D:/2. BO NAO/WEB TC/src/components/admin/brand-actions.tsx:30>) |
| 23 | Admin / dùng chung CTV | Sửa / lưu | Lưu thương hiệu | Chỉ icon | Icon + chữ | [src/components/admin/brand-actions.tsx:27](<D:/2. BO NAO/WEB TC/src/components/admin/brand-actions.tsx:27>) |
| 24 | Admin / dùng chung CTV | Xóa / bỏ | Xóa thương hiệu | Chỉ icon | Chỉ icon | [src/components/admin/brand-actions.tsx:32](<D:/2. BO NAO/WEB TC/src/components/admin/brand-actions.tsx:32>) |
| 25 | Admin / dùng chung CTV | Xóa / bỏ | Xóa sản phẩm từng dòng | Chỉ icon | Chỉ icon | [src/components/admin/product-bulk-publish.tsx:32](<D:/2. BO NAO/WEB TC/src/components/admin/product-bulk-publish.tsx:32>) |
| 26 | Admin / dùng chung CTV | Thêm mới | Tạo CTV | Chỉ chữ | Icon + chữ | [src/app/admin/(panel)/affiliates/new/page.tsx:23](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/affiliates/new/page.tsx:23>) |
| 27 | Admin / dùng chung CTV | Thêm mới | Tạo nhân viên | Chỉ chữ | Icon + chữ | [src/app/admin/(panel)/users/new/page.tsx:16](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/users/new/page.tsx:16>) |
| 28 | Admin / dùng chung CTV | Sửa / lưu | Lưu tuyến trên CTV | Chỉ chữ | Icon + chữ | [src/app/admin/(panel)/affiliates/[id]/page.tsx:102](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/affiliates/[id]/page.tsx:102>) |
| 29 | Admin / dùng chung CTV | Sửa / lưu | Lưu hồ sơ CTV | Chỉ chữ | Icon + chữ | [src/app/admin/(panel)/affiliates/[id]/page.tsx:311](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/affiliates/[id]/page.tsx:311>) |
| 30 | Admin / dùng chung CTV | Khóa / bật tắt | Khóa/mở khóa CTV ở chi tiết | Chỉ chữ | Icon + chữ | [src/app/admin/(panel)/affiliates/[id]/page.tsx:349](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/affiliates/[id]/page.tsx:349>) |
| 31 | Admin / dùng chung CTV | Xóa / bỏ | Xóa CTV ở chi tiết | Chỉ chữ | Icon + chữ | [src/app/admin/(panel)/affiliates/[id]/page.tsx:357](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/affiliates/[id]/page.tsx:357>) |
| 32 | Admin / dùng chung CTV | Sửa / lưu | Lưu nhân viên | Chỉ chữ | Icon + chữ | [src/app/admin/(panel)/users/[id]/page.tsx:43](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/users/[id]/page.tsx:43>) |
| 33 | Admin / dùng chung CTV | Khóa / bật tắt | Khóa/mở khóa nhân viên ở chi tiết | Chỉ chữ | Icon + chữ | [src/app/admin/(panel)/users/[id]/page.tsx:85](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/users/[id]/page.tsx:85>) |
| 34 | Admin / dùng chung CTV | Xóa / bỏ | Xóa nhân viên ở chi tiết | Chỉ chữ | Icon + chữ | [src/app/admin/(panel)/users/[id]/page.tsx:93](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/users/[id]/page.tsx:93>) |
| 35 | Admin / dùng chung CTV | Sửa / lưu | Lưu khách hàng | Chỉ chữ | Icon + chữ | [src/app/admin/(panel)/customer-accounts/[id]/page.tsx:47](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/customer-accounts/[id]/page.tsx:47>) |
| 36 | Admin / dùng chung CTV | Khóa / bật tắt | Khóa/mở khóa khách hàng ở chi tiết | Chỉ chữ | Icon + chữ | [src/app/admin/(panel)/customer-accounts/[id]/page.tsx:78](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/customer-accounts/[id]/page.tsx:78>) |
| 37 | Admin / dùng chung CTV | Xóa / bỏ | Xóa khách hàng ở chi tiết | Chỉ chữ | Icon + chữ | [src/app/admin/(panel)/customer-accounts/[id]/page.tsx:86](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/customer-accounts/[id]/page.tsx:86>) |
| 38 | Admin / dùng chung CTV | Sửa / lưu | Lưu danh mục | Chỉ chữ | Icon + chữ | [src/app/admin/(panel)/categories/[id]/page.tsx:31](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/categories/[id]/page.tsx:31>) |
| 39 | Admin / dùng chung CTV | Xóa / bỏ | Xóa icon danh mục | Chỉ chữ | Icon + chữ | [src/app/admin/(panel)/categories/[id]/page.tsx:64](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/categories/[id]/page.tsx:64>) |
| 40 | Admin / dùng chung CTV | Sửa / lưu | Mở sửa banner | Chỉ chữ | Chỉ icon | [src/app/admin/(panel)/content/banners/page.tsx:57](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/content/banners/page.tsx:57>) |
| 41 | Admin / dùng chung CTV | Khóa / bật tắt | Bật/tắt banner | Chỉ chữ | Chỉ icon | [src/app/admin/(panel)/content/banners/page.tsx:62](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/content/banners/page.tsx:62>) |
| 42 | Admin / dùng chung CTV | Xóa / bỏ | Xóa banner | Chỉ chữ | Chỉ icon | [src/app/admin/(panel)/content/banners/page.tsx:68](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/content/banners/page.tsx:68>) |
| 43 | Admin / dùng chung CTV | Thêm mới | Tạo bộ sưu tập | Chỉ chữ | Icon + chữ | [src/app/admin/(panel)/content/collections/page.tsx:22](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/content/collections/page.tsx:22>) |
| 44 | Admin / dùng chung CTV | Sửa / lưu | Mở sửa bộ sưu tập | Chỉ chữ | Chỉ icon | [src/app/admin/(panel)/content/collections/page.tsx:52](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/content/collections/page.tsx:52>) |
| 45 | Admin / dùng chung CTV | Sửa / lưu | Lưu bộ sưu tập | Chỉ chữ | Icon + chữ | [src/app/admin/(panel)/content/collections/[id]/page.tsx:45](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/content/collections/[id]/page.tsx:45>) |
| 46 | Admin / dùng chung CTV | Xóa / bỏ | Bỏ sản phẩm khỏi bộ sưu tập | Chỉ chữ | Chỉ icon | [src/app/admin/(panel)/content/collections/[id]/page.tsx:82](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/content/collections/[id]/page.tsx:82>) |
| 47 | Admin / dùng chung CTV | Thêm mới | Thêm sản phẩm vào bộ sưu tập | Chỉ chữ | Icon + chữ | [src/app/admin/(panel)/content/collections/[id]/page.tsx:115](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/content/collections/[id]/page.tsx:115>) |
| 48 | Admin / dùng chung CTV | Xóa / bỏ | Xóa bộ sưu tập | Chỉ chữ | Icon + chữ | [src/app/admin/(panel)/content/collections/[id]/page.tsx:123](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/content/collections/[id]/page.tsx:123>) |
| 49 | Admin / dùng chung CTV | Sửa / lưu | Lưu người trả phí giao hàng | Chỉ chữ | Icon + chữ | [src/app/admin/(panel)/orders/[id]/page.tsx:164](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/orders/[id]/page.tsx:164>) |
| 50 | Admin / dùng chung CTV | Sửa / lưu | Gán/đổi CTV của đơn | Chỉ chữ | Icon + chữ | [src/app/admin/(panel)/orders/[id]/page.tsx:210](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/orders/[id]/page.tsx:210>) |
| 51 | Admin / dùng chung CTV | Sửa / lưu | Lưu tỷ lệ hoa hồng đơn | Chỉ chữ | Icon + chữ | [src/app/admin/(panel)/orders/[id]/page.tsx:233](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/orders/[id]/page.tsx:233>) |
| 52 | Admin / dùng chung CTV | Sửa / lưu | Lưu mã vận đơn | Chỉ chữ | Icon + chữ | [src/app/admin/(panel)/orders/[id]/page.tsx:424](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/orders/[id]/page.tsx:424>) |
| 53 | Admin / dùng chung CTV | Thêm mới | Thêm tỷ giá | Chỉ chữ | Icon + chữ | [src/app/admin/(panel)/pricing/page.tsx:61](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/pricing/page.tsx:61>) |
| 54 | Admin / dùng chung CTV | Sửa / lưu | Lưu mô tả ảnh sản phẩm | Chỉ chữ | Icon + chữ | [src/app/admin/(panel)/products/[id]/page.tsx:73](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/products/[id]/page.tsx:73>) |
| 55 | Admin / dùng chung CTV | Xóa / bỏ | Xóa ảnh sản phẩm | Chỉ chữ | Chỉ icon | [src/app/admin/(panel)/products/[id]/page.tsx:94](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/products/[id]/page.tsx:94>) |
| 56 | Admin / dùng chung CTV | Sửa / lưu | Lưu cấu hình địa bàn | Chỉ chữ | Icon + chữ | [src/app/admin/(panel)/settings/locations/page.tsx:65](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/settings/locations/page.tsx:65>) |
| 57 | Admin / dùng chung CTV | Sửa / lưu | Lưu cài đặt hệ thống | Chỉ chữ | Icon + chữ | [src/app/admin/(panel)/settings/page.tsx:65](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/settings/page.tsx:65>) |
| 58 | Admin / dùng chung CTV | Thêm mới | Tạo kho | Chỉ chữ | Icon + chữ | [src/app/admin/(panel)/settings/warehouses/page.tsx:29](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/settings/warehouses/page.tsx:29>) |
| 59 | Admin / dùng chung CTV | Sửa / lưu | Lưu thông tin kho | Chỉ chữ | Icon + chữ | [src/app/admin/(panel)/settings/warehouses/page.tsx:66](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/settings/warehouses/page.tsx:66>) |
| 60 | Admin / dùng chung CTV | Khóa / bật tắt | Ngừng/kích hoạt kho | Chỉ chữ | Chỉ icon | [src/app/admin/(panel)/settings/warehouses/page.tsx:90](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/settings/warehouses/page.tsx:90>) |
| 61 | Admin / dùng chung CTV | Xóa / bỏ | Xóa chi phí chuyến hàng | Chỉ chữ | Chỉ icon | [src/app/admin/(panel)/shipments/[id]/page.tsx:52](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/shipments/[id]/page.tsx:52>) |
| 62 | Admin / dùng chung CTV | Sửa / lưu | Bổ sung hạn sử dụng lô | Chỉ chữ | Icon + chữ | [src/app/admin/(panel)/inventory/batches/[id]/page.tsx:94](<D:/2. BO NAO/WEB TC/src/app/admin/(panel)/inventory/batches/[id]/page.tsx:94>) |
| 63 | Admin / dùng chung CTV | Sửa / lưu | Lưu banner (form thêm/sửa dùng chung) | Chỉ chữ | Icon + chữ | [src/components/admin/banner-form.tsx:116](<D:/2. BO NAO/WEB TC/src/components/admin/banner-form.tsx:116>) |
| 64 | Admin / dùng chung CTV | Thêm mới | Tải/thay icon danh mục | Chỉ chữ | Icon + chữ | [src/components/admin/category-icon-upload.tsx:28](<D:/2. BO NAO/WEB TC/src/components/admin/category-icon-upload.tsx:28>) |
| 65 | Admin / dùng chung CTV | Xóa / bỏ | Bỏ dòng chứng từ kho | Chỉ chữ | Chỉ icon | [src/components/admin/document-form.tsx:251](<D:/2. BO NAO/WEB TC/src/components/admin/document-form.tsx:251>) |
| 66 | Admin / dùng chung CTV | Thêm mới | Thêm dòng chứng từ kho | Chỉ chữ | Icon + chữ | [src/components/admin/document-form.tsx:257](<D:/2. BO NAO/WEB TC/src/components/admin/document-form.tsx:257>) |
| 67 | Admin / dùng chung CTV | Thêm mới | Tạo phiếu kho nháp | Chỉ chữ | Icon + chữ | [src/components/admin/document-form.tsx:265](<D:/2. BO NAO/WEB TC/src/components/admin/document-form.tsx:265>) |
| 68 | Admin / dùng chung CTV | Xóa / bỏ | Bỏ dòng đơn hàng | Chỉ chữ | Chỉ icon | [src/components/admin/order-form.tsx:224](<D:/2. BO NAO/WEB TC/src/components/admin/order-form.tsx:224>) |
| 69 | Admin / dùng chung CTV | Thêm mới | Thêm dòng đơn hàng | Chỉ chữ | Icon + chữ | [src/components/admin/order-form.tsx:233](<D:/2. BO NAO/WEB TC/src/components/admin/order-form.tsx:233>) |
| 70 | Admin / dùng chung CTV | Thêm mới | Tạo đơn (admin/CTV dùng chung) | Chỉ chữ | Icon + chữ | [src/components/admin/order-form.tsx:250](<D:/2. BO NAO/WEB TC/src/components/admin/order-form.tsx:250>) |
| 71 | Admin / dùng chung CTV | Khóa / bật tắt | Hiện sản phẩm hàng loạt | Chỉ chữ | Icon + chữ | [src/components/admin/product-bulk-publish.tsx:123](<D:/2. BO NAO/WEB TC/src/components/admin/product-bulk-publish.tsx:123>) |
| 72 | Admin / dùng chung CTV | Khóa / bật tắt | Ẩn sản phẩm hàng loạt | Chỉ chữ | Icon + chữ | [src/components/admin/product-bulk-publish.tsx:124](<D:/2. BO NAO/WEB TC/src/components/admin/product-bulk-publish.tsx:124>) |
| 73 | Admin / dùng chung CTV | Xóa / bỏ | Xóa sản phẩm hàng loạt | Chỉ chữ | Icon + chữ | [src/components/admin/product-bulk-publish.tsx:125](<D:/2. BO NAO/WEB TC/src/components/admin/product-bulk-publish.tsx:125>) |
| 74 | Admin / dùng chung CTV | Xóa / bỏ | Bỏ biến thể sản phẩm | Chỉ chữ | Chỉ icon | [src/components/admin/product-form.tsx:261](<D:/2. BO NAO/WEB TC/src/components/admin/product-form.tsx:261>) |
| 75 | Admin / dùng chung CTV | Xóa / bỏ | Bỏ thành phần combo | Chỉ chữ | Chỉ icon | [src/components/admin/product-form.tsx:300](<D:/2. BO NAO/WEB TC/src/components/admin/product-form.tsx:300>) |
| 76 | Admin / dùng chung CTV | Thêm mới | Thêm thành phần combo | Chỉ chữ | Icon + chữ | [src/components/admin/product-form.tsx:303](<D:/2. BO NAO/WEB TC/src/components/admin/product-form.tsx:303>) |
| 77 | Admin / dùng chung CTV | Thêm mới | Thêm màu/dung tích | Chỉ chữ | Icon + chữ | [src/components/admin/product-form.tsx:310](<D:/2. BO NAO/WEB TC/src/components/admin/product-form.tsx:310>) |
| 78 | Admin / dùng chung CTV | Sửa / lưu | Lưu sản phẩm (form thêm/sửa dùng chung) | Chỉ chữ | Icon + chữ | [src/components/admin/product-form.tsx:388](<D:/2. BO NAO/WEB TC/src/components/admin/product-form.tsx:388>) |
| 79 | Admin / dùng chung CTV | Thêm mới | Thêm ảnh sản phẩm | Chỉ chữ | Icon + chữ | [src/components/admin/product-images.tsx:39](<D:/2. BO NAO/WEB TC/src/components/admin/product-images.tsx:39>) |
| 80 | Admin / dùng chung CTV | Thêm mới | Tạo phiếu nhập nhanh | Chỉ chữ | Icon + chữ | [src/components/admin/receive-bulk-form.tsx:369](<D:/2. BO NAO/WEB TC/src/components/admin/receive-bulk-form.tsx:369>) |
| 81 | Admin / dùng chung CTV | Thêm mới | Thêm/tách lô nhập | Chỉ chữ | Icon + chữ | [src/components/admin/receive-bulk-form.tsx:468](<D:/2. BO NAO/WEB TC/src/components/admin/receive-bulk-form.tsx:468>) |
| 82 | Admin / dùng chung CTV | Xóa / bỏ | Bỏ dòng nhập nhanh | Chỉ chữ | Chỉ icon | [src/components/admin/receive-bulk-form.tsx:470](<D:/2. BO NAO/WEB TC/src/components/admin/receive-bulk-form.tsx:470>) |
| 83 | Admin / dùng chung CTV | Thêm mới | Tạo chuyến hàng | Chỉ chữ | Icon + chữ | [src/components/admin/shipment-forms.tsx:46](<D:/2. BO NAO/WEB TC/src/components/admin/shipment-forms.tsx:46>) |
| 84 | Admin / dùng chung CTV | Thêm mới | Thêm chi phí chuyến hàng | Chỉ chữ | Icon + chữ | [src/components/admin/shipment-forms.tsx:74](<D:/2. BO NAO/WEB TC/src/components/admin/shipment-forms.tsx:74>) |
| 85 | Admin / dùng chung CTV | Thêm mới | Gắn lô vào chuyến hàng | Chỉ chữ | Icon + chữ | [src/components/admin/shipment-forms.tsx:110](<D:/2. BO NAO/WEB TC/src/components/admin/shipment-forms.tsx:110>) |
| 86 | Admin / dùng chung CTV | Thêm mới | Mở menu tạo phiếu kho | Icon + chữ | Icon + chữ | [src/components/admin/stock-parts.tsx:31](<D:/2. BO NAO/WEB TC/src/components/admin/stock-parts.tsx:31>) |
| 87 | Admin / dùng chung CTV | Thêm mới | Chọn loại phiếu kho cần tạo | Chỉ chữ | Icon + chữ | [src/components/admin/stock-parts.tsx:38](<D:/2. BO NAO/WEB TC/src/components/admin/stock-parts.tsx:38>) |
| 88 | Khách hàng | Sửa / lưu | Mở sửa địa chỉ | Chỉ chữ | Chỉ icon | [src/app/[locale]/account/addresses/page.tsx:64](<D:/2. BO NAO/WEB TC/src/app/[locale]/account/addresses/page.tsx:64>) |
| 89 | Khách hàng | Xóa / bỏ | Xóa địa chỉ | Chỉ chữ | Chỉ icon | [src/app/[locale]/account/addresses/page.tsx:77](<D:/2. BO NAO/WEB TC/src/app/[locale]/account/addresses/page.tsx:77>) |
| 90 | Khách hàng | Sửa / lưu | Lưu địa chỉ (form thêm/sửa dùng chung) | Chỉ chữ | Icon + chữ | [src/components/store/account-forms.tsx:89](<D:/2. BO NAO/WEB TC/src/components/store/account-forms.tsx:89>) |
| 91 | Khách hàng | Sửa / lưu | Lưu hồ sơ khách | Chỉ chữ | Icon + chữ | [src/components/store/account-forms.tsx:112](<D:/2. BO NAO/WEB TC/src/components/store/account-forms.tsx:112>) |
| 92 | Khách hàng | Sửa / lưu | Cập nhật số lượng giỏ hàng | Chỉ chữ | Icon + chữ | [src/app/[locale]/cart/page.tsx:79](<D:/2. BO NAO/WEB TC/src/app/[locale]/cart/page.tsx:79>) |
| 93 | Khách hàng | Xóa / bỏ | Bỏ sản phẩm khỏi giỏ | Chỉ chữ | Chỉ icon | [src/app/[locale]/cart/page.tsx:84](<D:/2. BO NAO/WEB TC/src/app/[locale]/cart/page.tsx:84>) |

## Quy tắc dùng chung

- ActionForm mặc định có icon Save và nhãn lưu; các form tạo mới dùng Plus, thao tác khác dùng icon tương ứng.
- ActionButton hỗ trợ iconOnly để phân biệt thao tác theo dòng và thao tác tại khối chi tiết.
- Nút icon dùng kích thước 44px trên mobile và 36px từ md, có tên truy cập và chú thích.
- Nút lưu, thêm mới và các thao tác hàng loạt đều có icon kèm chữ.
- Giữ cơ chế gửi form, xác nhận xóa/khóa, phân quyền và trạng thái disabled.

## Kiểm tra

- Đối chiếu tĩnh 93 vị trí: đạt.
- TypeScript và ESLint: đạt.
- Build production và 10 kiểm thử Playwright mobile cho nội dung admin, tài khoản nhân viên và kho: đạt (10/10).
- Đã xem ảnh chụp màn hình mobile của trang Banner và form Danh mục để kiểm tra hiển thị icon/nút lưu.
- Bổ sung icon kèm chữ cho xác nhận nhập sản phẩm hàng loạt, xuất VTP và chốt phiếu soạn/in; các nút này nằm ngoài 93 vị trí CRUD ban đầu.
