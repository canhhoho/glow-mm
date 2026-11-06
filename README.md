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

Trong Admin → Sản phẩm, bấm biểu tượng **Sửa** trên từng dòng để chỉnh sản phẩm. Form chỉ cần
một tên (Myanmar hoặc tiếng Anh — tên còn lại tự lấy theo), thương hiệu (chọn hoặc gõ tên mới), danh mục
và giá; slug, SKU, kho bán, hạn dùng nằm trong **Thiết lập khác** (tự điền, sửa khi cần). Để dùng sản phẩm
cũ làm mẫu, mở **Sao chép từ sản phẩm cũ** trên trang Thêm sản phẩm → chọn nguồn → **Nạp thông tin**.
Bản sao giữ nội dung, giá, biến thể và ảnh; không sao chép tồn kho. Sản phẩm mới mặc định ẩn trên cửa hàng.

**Nhập / cập nhật bằng Excel** (Sản phẩm → Nhập từ Excel): một sheet `Nhap hang`, mỗi dòng một SKU.
- **Tải file mẫu trống** để tạo mới, hoặc **Tải danh sách sản phẩm hiện có** để sửa giá/tên rồi tải lên lại.
  File sinh lúc tải, có danh sách thả xuống (thương hiệu, danh mục, kho bán, Có/Không) theo dữ liệu thật.
- Tạo mới: để trống SKU; các dòng cùng tên + thương hiệu là các màu/dung tích của một sản phẩm; mã tự sinh,
  sản phẩm mới luôn ẩn. Cập nhật: điền SKU đã có, ô trống = giữ nguyên. Không đổi kho bán/combo qua Excel.
- Nhập tồn (tuỳ chọn): Số lượng + Giá mua (VND hay MMK theo kho bán) [+ phí đưa về kho, số lô, hạn dùng].
  Hệ thống tạo **phiếu nhập nháp** theo kho bán, chốt tỷ giá đã xem trước; mở phiếu kiểm tra rồi **Ghi sổ**.
  File đã nhập tồn không nhập lại được; file chỉ sửa giá thì chạy lại được.
- Luôn **Xem trước**: từng dòng ghi Tạo mới / Cập nhật (giá cũ → mới) / Không đổi; còn lỗi thì không xác nhận.
  File cũ có cột phụ (cách dùng, thành phần, bảo quản, PAO, ngày sản xuất, loại hàng) vẫn đọc được;
  mẫu hai sheet cũ (`San pham` + `Ton dau ky`) không dùng nữa.

**Hoa hồng CTV theo sản phẩm:** ô **Hoa hồng CTV (MMK/cái)** trên từng biến thể (form sản phẩm hoặc cột cùng tên
trong file Excel). Có mức thì CTV nhận số tiền đó cho mỗi cái bán ra; để trống thì tính theo % của CTV như trước.
Mức được chốt vào đơn lúc gắn CTV — đổi mức sau không ảnh hưởng đơn cũ. Hoa hồng cấp trên vẫn là % trên tiền hàng.

Hạn dùng quản lý theo sản phẩm/lô: lô có ngày (`DATED`), không áp dụng hạn (`NONE`, chỉ với sản phẩm
không quản lý hạn) hoặc chưa biết hạn (`UNKNOWN` — để trống hạn khi nhập hàng có hạn): được nhập kho nhưng
chưa bán, có cảnh báo, xác nhận ngày thật trong chi tiết lô. Hạn sau mở nắp (PAO) là thông tin riêng.
Giá vốn = giá mua + phí đưa về kho (VND/đv), quy đổi theo tỷ giá đã xem trước và chốt khi tạo phiếu.

## Xử lý đơn và xuất VTP

Quy trình: **Chờ xác nhận → Chuẩn bị giao → Đang giao → Hoàn tất**. Nhân viên gọi
xác nhận đơn COD hoặc đối chiếu tiền chuyển khoản rồi bấm **Đã nhận tiền**; khách
không cần tải biên lai. Hệ thống xuất kho FEFO khi bấm **Đã bàn giao vận chuyển**.

Trong danh sách đơn, bấm **Xuất Excel VTP** để chọn tối đa 200 đơn Chuẩn bị giao,
chọn dịch vụ và kiểm tra trọng lượng trước khi tải file theo mẫu OMS Myanmar.
Đơn đã thanh toán có tiền thu hộ COD bằng 0. Địa chỉ người gửi chọn trong VTP.
Trong chi tiết đơn, mở **Thông tin tạo đơn lẻ VTP** để sao chép từng ô hoặc tải
thông tin `.txt`. Xuất file không thay đổi trạng thái đơn hoặc tồn kho.

**Đối soát COD:** hoàn tất đơn chỉ ghi nhận hãng đã thu tiền khách. Admin vào
Đơn hàng → Đối soát tiền COD, mở đơn rồi ghi số tiền thực nhận, phí hãng khấu
trừ và mã giao dịch. Tổng thực nhận + phí phải bằng COD gốc; chống ghi trùng,
có nhật ký người thực hiện. Đơn có hoàn hàng/hoàn tiền được đánh dấu cần đối
soát riêng, chưa hỗ trợ tự ghi nhận cho các ngoại lệ này. Bước triển khai bản
này cần `prisma migrate deploy` trước khi chạy ứng dụng mới.

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
