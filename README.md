# T&C Cosmetics — Web bán mỹ phẩm VN → Myanmar

- Kế hoạch: [PLAN.md](PLAN.md) · Quy tắc & lệnh: [CLAUDE.md](CLAUDE.md) · Triển khai: [DEPLOY.md](DEPLOY.md)

## Chạy nhanh

```bash
npm install
docker compose up -d
cp .env.example .env
npm run db:migrate && npm run db:seed
npm run dev
```

Storefront: http://localhost:3000 (tiếng Myanmar) · http://localhost:3000/en · Admin: http://localhost:3000/admin
Tài khoản mẫu: `admin@glow.local`, `kho@glow.local`, `donhang@glow.local` — mật khẩu = `SEED_STAFF_PASSWORD` trong `.env`.

## Quản lý sản phẩm

Trong Admin → Sản phẩm, bấm **Sửa** trên từng dòng để chỉnh sản phẩm.
Để dùng sản phẩm cũ làm mẫu, vào **Thêm sản phẩm** → chọn **Sản phẩm nguồn** → **Nạp thông tin**,
chỉnh nội dung và nhập slug/SKU mới rồi bấm **Lưu**. Bản sao giữ nội dung, giá, biến thể và ảnh;
không sao chép tồn kho, lô hàng hoặc giao dịch. Sản phẩm mới mặc định ẩn trên cửa hàng.

Trang nhập sản phẩm nhận trực tiếp **Excel `.xlsx` hoặc CSV**. Tải mẫu Excel, điền
từ dòng 7 trong sheet nhập liệu rồi tải lại file; hướng dẫn và ví dụ nằm ở sheet
riêng. Mẫu tồn đầu kỳ tạo phiếu nhập nháp để kiểm tra trước khi ghi sổ.

## Xử lý đơn và xuất VTP

Quy trình: **Chờ xác nhận → Chuẩn bị giao → Đang giao → Hoàn tất**. Nhân viên gọi
xác nhận đơn COD hoặc đối chiếu tiền chuyển khoản rồi bấm **Đã nhận tiền**; khách
không cần tải biên lai. Hệ thống xuất kho FEFO khi bấm **Đã bàn giao vận chuyển**.

Trong danh sách đơn, bấm **Xuất Excel VTP** để chọn tối đa 200 đơn Chuẩn bị giao,
chọn dịch vụ và kiểm tra trọng lượng trước khi tải file theo mẫu OMS Myanmar.
Đơn đã thanh toán có tiền thu hộ COD bằng 0. Địa chỉ người gửi chọn trong VTP.
Trong chi tiết đơn, mở **Thông tin tạo đơn lẻ VTP** để sao chép từng ô hoặc tải
thông tin `.txt`. Xuất file không thay đổi trạng thái đơn hoặc tồn kho.

## Kiểm thử

```bash
npm test
```

## Bản dịch (duyệt tiếng Myanmar)

Chuỗi giao diện nằm trong `messages/` (storefront `store.{my,en}.json`, admin `admin.{vi,en,my}.json`).
Danh sách chuỗi tiếng Myanmar **cần người bản ngữ duyệt** ở `messages/review-my.json`.

```bash
npm run i18n:export
```

Lệnh trên tạo `i18n-export.csv` (mở bằng Excel). Người duyệt sửa cột `my`, rồi **xoá chữ `x` ở cột `review`** của dòng đã duyệt.

```bash
npm run i18n:import -- i18n-export.csv
```

Lệnh trên ghi lại cột `my` (tự chuyển Zawgyi → Unicode) và bỏ các dòng đã duyệt khỏi `review-my.json`. Gặp key lạ hoặc thiếu/thừa biến như `{count}` thì lệnh báo lỗi và không ghi gì.
