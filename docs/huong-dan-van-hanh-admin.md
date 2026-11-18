# Hướng dẫn vận hành web Admin — T&C Cosmetics

Tài liệu dành cho người **không biết lập trình** vận hành web quản trị (đường dẫn `/admin`). Viết dựa trên chức năng thực tế có trong hệ thống tại ngày 15/11/2026; phần giá (mục 6, 7, 9, 10.6) cập nhật 16/11/2026 theo luồng giá mới; mục 4.3, 5.8, 7.2–7.4 cập nhật 17/11/2026. Hướng dẫn riêng cho cộng tác viên: [huong-dan-cong-ctv.md](huong-dan-cong-ctv.md).

## Mục lục

- [0. Cách dùng tài liệu](#0-cách-dùng-tài-liệu)
- [1. Bắt đầu nhanh](#1-bắt-đầu-nhanh)
- [2. Checklist vận hành](#2-checklist-vận-hành)
- [3. Vai trò và quyền](#3-vai-trò-và-quyền)
- [4. Khái niệm cần biết](#4-khái-niệm-cần-biết)
- [5. Sản phẩm](#5-sản-phẩm)
- [6. Nhập và cập nhật sản phẩm bằng Excel](#6-nhập-và-cập-nhật-sản-phẩm-bằng-excel)
- [7. Giá bán và tỷ giá](#7-giá-bán-và-tỷ-giá)
- [8. Kho hàng](#8-kho-hàng)
- [9. Duyệt và đăng bán](#9-duyệt-và-đăng-bán)
- [10. Đơn hàng](#10-đơn-hàng)
- [11. Đối soát tiền COD](#11-đối-soát-tiền-cod)
- [12. Cộng tác viên (phía admin)](#12-cộng-tác-viên-phía-admin)
- [13. Tài khoản](#13-tài-khoản)
- [14. Tổng quan và báo cáo](#14-tổng-quan-và-báo-cáo)
- [15. Cài đặt và nội dung web](#15-cài-đặt-và-nội-dung-web)
- [16. Thao tác không hoàn tác được](#16-thao-tác-không-hoàn-tác-được)
- [17. Tra cứu thông báo lỗi](#17-tra-cứu-thông-báo-lỗi)
- [18. Những gì hệ thống hiện chưa có](#18-những-gì-hệ-thống-hiện-chưa-có)
- [19. Phụ lục](#19-phụ-lục)

---

## 0. Cách dùng tài liệu

**Tìm theo việc cần làm:** xem mục lục ở trên. **Tìm theo vai trò:** xem [mục 2](#2-checklist-vận-hành) và [mục 3](#3-vai-trò-và-quyền). **Tìm theo thông báo lỗi:** xem [mục 17](#17-tra-cứu-thông-báo-lỗi).

**Cách ghi trong tài liệu**

- Tên menu và nút được viết **in đậm, đúng như trên màn hình**. Đường đi viết dạng **Đơn hàng › Danh sách đơn › Tạo đơn** (bấm lần lượt từ trái sang phải).
- Mỗi nghiệp vụ theo thứ tự: **Mục đích → Ai làm được → Cần chuẩn bị → Các bước → Kết quả → Lỗi thường gặp**.
- Các ký hiệu cảnh báo đứng đầu dòng:

| Ký hiệu | Nghĩa |
|---|---|
| 💰 | Ảnh hưởng **giá hoặc tiền** |
| 📦 | Ảnh hưởng **tồn kho** |
| 👁 | Ảnh hưởng **cái khách nhìn thấy** trên web |
| ⛔ | **Không hoàn tác được** — kiểm tra kỹ trước khi bấm |

- **[CHƯA XÁC MINH]** = điều chưa kiểm chứng được (chưa thử trên server thật hoặc chưa đối chiếu bằng mắt trên màn hình). Danh sách đầy đủ ở [Phụ lục](#19-phụ-lục).
- Số tiền trong ví dụ chỉ để minh hoạ, **không phải giá thật**.
- Tài liệu **không có ảnh chụp màn hình**; hãy dựa vào tên menu/nút. Nếu bạn không thấy một menu, rất có thể tài khoản của bạn không có quyền đó ([mục 3](#3-vai-trò-và-quyền)).
- Lỗi do hệ thống trả về thường có dạng **"Không thực hiện được: …"**. Một số lỗi biểu mẫu bắt đầu bằng tên ô kỹ thuật, ví dụ `my.name: Cần ít nhất một tên…` — phần sau dấu hai chấm mới là nội dung cần đọc.

---

## 1. Bắt đầu nhanh

### 1.1. Đăng nhập lần đầu

1. Mở `https://tandcstore.com/admin` (nếu chưa đăng nhập, hệ thống tự chuyển sang `/admin/login`).
2. Nhập **Email** và **Mật khẩu** do quản trị viên cấp, bấm **Đăng nhập**. Nút con mắt (**Hiện mật khẩu** / **Ẩn mật khẩu**) giúp xem mật khẩu đang gõ.
3. Việc đầu tiên: bấm tên bạn ở góc phải trên cùng → trang **Tài khoản của tôi** → **Đổi mật khẩu** (ít nhất 12 ký tự). Đổi xong, các thiết bị khác của bạn bị đăng xuất.

Lưu ý:
- Sai mật khẩu quá **10 lần trong 10 phút** (tính theo tài khoản) → báo "Đăng nhập quá nhiều lần. Vui lòng thử lại sau ít phút." Ngoài ra còn giới hạn 10 lần/phút theo địa chỉ mạng; nhiều người dùng chung một mạng cửa hàng có thể bị chặn cùng lúc.
- Đăng nhập kéo dài tối đa khoảng **12 giờ**; hết hạn thì đăng nhập lại.
- **Không có nút "Quên mật khẩu" cho nhân viên.** Nhờ quản trị viên bấm **Đặt mật khẩu tạm** cho bạn ([mục 13.1](#131-nhân-viên)).
- Tài khoản bị khoá hiện: "Tài khoản đã bị khoá. Liên hệ quản trị viên."
- Tài khoản cộng tác viên không đăng nhập được ở `/admin`; dùng `/ctv/login`.

### 1.2. Đổi ngôn ngữ

Ba nút **VI / EN / MY** nằm ở góc phải thanh trên cùng (và ở góc phải trang đăng nhập). Lựa chọn được nhớ 1 năm **trên trình duyệt đó**; mặc định là tiếng Việt.

### 1.3. Đọc giao diện

- Thanh bên trái là menu. Nhóm menu tự mở khi bạn đang ở trang thuộc nhóm đó. Trên điện thoại, bấm **Mở menu** / **Đóng menu**.
- Số nhỏ cạnh một số mục (huy hiệu) là việc đang chờ: đơn chờ xác nhận, đơn chờ hàng về, lô chờ kiểm tra, cảnh báo, yêu cầu đặt lại mật khẩu của khách, đơn đăng ký CTV, số sản phẩm theo từng trạng thái đăng bán.
- Dòng "Vị trí trang" phía trên nội dung cho biết bạn đang ở đâu (Nhóm › Mục › Trang).
- Bấm **Đăng xuất** (góc phải trên cùng) khi dùng máy chung.
- Nếu vào trang không đủ quyền, hệ thống đưa về **Tổng quan** kèm thông báo "Bạn không có quyền truy cập trang đó."

Menu đầy đủ (mỗi người chỉ thấy các mục mình có quyền):

| Nhóm | Mục |
|---|---|
| (không có nhóm) | **Tổng quan** |
| **Đơn hàng** | **Danh sách đơn**, **Đơn đặt trước**, **Đối soát COD**, **Đánh giá** |
| **Sản phẩm** | **Danh sách sản phẩm**, **Danh mục**, **Giá bán** (gồm các tab Tỷ giá, Lịch sử giá) |
| **Kho hàng** | **Tồn kho**, **Phiếu kho**, **Chờ kiểm tra**, **Cảnh báo**, **Chuyến hàng** |
| **Đăng bán** | **Chờ hoàn thiện**, **Chờ duyệt**, **Đang bán** (lối tắt vào danh sách sản phẩm đã lọc sẵn) |
| **Tài khoản** | **Nhân viên**, **Khách hàng** |
| **Cộng tác viên** | **Danh sách CTV**, **Đơn đăng ký**, **Hoa hồng & chi trả** |
| **Báo cáo** | **Bán hàng & lợi nhuận**, **Hành vi mua hàng**, **Sức khoẻ dữ liệu** |
| **Cài đặt** | **Cấu hình cửa hàng**, **Quản lý kho**, **Địa bàn giao hàng**, và nhóm con **Nội dung trang chủ** (**Banner**, **Bộ sưu tập**) |

### 1.4. Ba luồng công việc chính

**Luồng 1 — đưa sản phẩm lên bán** (chi tiết: [mục 5](#5-sản-phẩm) đến [mục 9](#9-duyệt-và-đăng-bán))

```
Bước 1 Tạo sản phẩm → Bước 2 Nhập kho + giá vốn → Bước 3 Giá bán → Bước 4 Duyệt → Bước 5 Đăng bán
```

**Luồng 2 — một đơn hàng** (chi tiết: [mục 10](#10-đơn-hàng) và [mục 11](#11-đối-soát-tiền-cod))

```
Chờ xác nhận → Chuẩn bị giao → Đang giao → Hoàn tất → (COD) Đối soát tiền về
```

**Luồng 3 — thiết lập một lần trước khi mở bán** (làm theo thứ tự)

1. **Cài đặt › Quản lý kho**: kiểm tra các kho bán ([mục 8.7](#87-quản-lý-kho)).
2. **Sản phẩm › Giá bán › tab Tỷ giá**: thêm tỷ giá hiện hành ([mục 7.1](#71-tỷ-giá)).
3. **Sản phẩm › Danh mục**: tạo danh mục ([mục 15.5](#155-danh-mục)).
4. **Cài đặt › Cấu hình cửa hàng**: soát từng ô ([mục 15.1](#151-cấu-hình-cửa-hàng)), đặc biệt **Nhận đơn trên web**, thời gian giữ hàng, hướng dẫn chuyển khoản.
5. **Cài đặt › Địa bàn giao hàng**: bật/tắt các khu vực giao ([mục 15.2](#152-địa-bàn-giao-hàng-vtp)).
6. **Tài khoản › Nhân viên**: tạo tài khoản cho từng người ([mục 13.1](#131-nhân-viên)).
7. **Cài đặt › Nội dung trang chủ**: banner, bộ sưu tập ([mục 15.3](#153-banner-trang-chủ)).

---

## 2. Checklist vận hành

Làm theo vai trò. Mục ghi "(QTV)" chỉ Quản trị viên mới thấy.

### 2.1. Đầu ngày (mọi vai trò)

- [ ] Mở **Tổng quan**, đọc khối **Việc cần làm**: mỗi ô bấm vào sẽ ra danh sách đã lọc sẵn.
- [ ] **COD chờ gọi xác nhận**: gọi khách ngay trong ngày — đơn không được xác nhận sau thời gian giữ hàng (mặc định 24 giờ) sẽ **tự huỷ** ([mục 10.3](#103-giữ-hàng-và-tự-huỷ-quá-hạn)).
- [ ] **Chờ nhận chuyển khoản**: đối chiếu tài khoản ngân hàng, đúng số tiền mới bấm **Đã nhận tiền**.
- [ ] **Đơn quá hạn giữ hàng** và **Đang giao từ 7 ngày**: xử lý hoặc hỏi hãng vận chuyển.
- [ ] (QTV) Mở **Tài khoản › Khách hàng**: có **Yêu cầu đặt lại mật khẩu** thì kiểm tra và **Xác nhận** hoặc **Từ chối** ([mục 13.2](#132-khách-hàng)).
- [ ] (QTV) Mở **Cộng tác viên › Đơn đăng ký** nếu huy hiệu có số.

### 2.2. Trong ngày

**Nhân viên đơn hàng / Quản trị viên**
- [ ] Đơn mới từ Facebook, Viber, điện thoại: **Đơn hàng › Danh sách đơn › Tạo đơn** ([mục 10.2](#102-tạo-đơn-thủ-công)).
- [ ] **Xác nhận đơn** (COD) / **Đã nhận tiền** (chuyển khoản) cho các đơn đã gọi/đối chiếu.
- [ ] **Đơn đặt trước**: đơn nào hiện **Đủ hàng** thì bấm **Hàng đã về — chuyển xử lý** ([mục 10.9](#109-đơn-đặt-trước)).
- [ ] Duyệt **Đánh giá** của khách (**Đăng** / **Từ chối**).

**Quản lý kho / Quản trị viên**
- [ ] Hàng về: tạo phiếu **Nhập kho**, kiểm tra rồi **Ghi sổ** ([mục 8.2](#82-phiếu-nhập-kho)).
- [ ] In **phiếu lấy hàng** (**Chốt lô & In**), soạn hàng, đóng gói ([mục 10.5](#105-in-nhãn-phiếu-lấy-hàng-và-xuất-file-vtp)).
- [ ] **Chờ kiểm tra**: hàng khách trả về — **Nhập lại kho bán** hoặc **Huỷ hàng** ([mục 8.5](#85-chờ-kiểm-tra-hàng-khách-trả)).

### 2.3. Cuối ngày

- [ ] Bàn giao các đơn **Chuẩn bị giao** cho hãng vận chuyển: **Đã bàn giao vận chuyển** (nhập **Đơn vị vận chuyển**, **Mã vận đơn** nếu có) ⛔📦 ([mục 10.6](#106-bàn-giao-giao-thành-công-huỷ-và-trả-hàng)).
- [ ] Đơn khách báo đã nhận hàng: **Giao thành công** (COD: **Giao thành công · Đã thu tiền** — chỉ bấm khi hãng đã thu tiền của khách).
- [ ] Soát lại danh sách đơn **Chờ xác nhận** và **Chuẩn bị giao** không còn sót.

### 2.4. Hằng tuần (Quản trị viên)

- [ ] **Kho hàng › Cảnh báo**: tồn thấp, hạn dùng, gợi ý đặt hàng.
- [ ] **Báo cáo › Sức khoẻ dữ liệu**: xử lý các mục mức "Lỗi" trước, rồi "Cảnh báo".
- [ ] **Sản phẩm › Giá bán**: lọc **Giá cũ hơn phiếu nhập** và **Chưa có giá**; tính lại giá khi cần ([mục 7.2](#72-trang-giá-bán-danh-sách)).
- [ ] **Đối soát COD**: đơn nào quá vài ngày chưa có tiền về thì hỏi hãng ([mục 11](#11-đối-soát-tiền-cod)).
- [ ] **Cộng tác viên › Hoa hồng & chi trả**: ai có **Đến hạn** thì chuyển tiền rồi bấm **Ghi nhận đã trả** ([mục 12.4](#124-chi-trả-hoa-hồng)).
- [ ] **Kho hàng › Chuyến hàng**: chuyến nào báo **Cần phân bổ lại — đầu vào đã thay đổi** thì phân bổ lại ([mục 8.6](#86-chuyến-hàng-vn--mm-và-giá-vốn)).

### 2.5. Hằng tháng (Quản trị viên)

- [ ] **Giá bán › tab Tỷ giá**: cập nhật tỷ giá nếu thị trường đổi; chạy lại **Tính giá** cho hàng bị cảnh báo tỷ giá mới.
- [ ] **Báo cáo › Bán hàng & lợi nhuận**: chọn khoảng ngày của tháng, xem doanh thu, lợi nhuận, hoa hồng.
- [ ] Rà soát tài khoản nhân viên: khoá người đã nghỉ ([mục 13.1](#131-nhân-viên)).
- [ ] **Banner** / **Bộ sưu tập**: tắt cái đã hết đợt khuyến mãi.

---

## 3. Vai trò và quyền

Có 3 vai trò nhân viên. Cộng tác viên là loại tài khoản riêng, dùng cổng `/ctv`, **không bao giờ** vào được `/admin`.

| Việc | Quản trị viên | Quản lý kho | Nhân viên đơn hàng |
|---|:-:|:-:|:-:|
| Xem Tổng quan, tồn kho, đơn hàng | ✓ | ✓ | ✓ |
| Ghi nhận trả hàng | ✓ | ✓ | ✓ |
| Nhập/chuyển/xuất/điều chỉnh kho; xử lý hàng Chờ kiểm tra | ✓ | ✓ | |
| Chuyến hàng VN → MM | ✓ | ✓ | |
| Chốt lô & in phiếu lấy hàng | ✓ | ✓ | ✓ |
| Tạo đơn, xác nhận, nhận tiền, bàn giao, hoàn tất, huỷ | ✓ | | ✓ |
| Xuất Excel VTP | ✓ | | ✓ |
| Gán CTV vào đơn | ✓ | | ✓ |
| Duyệt đánh giá của khách | ✓ | | ✓ |
| Đối soát COD | ✓ | | |
| Sản phẩm, danh mục, Excel, **duyệt**, **đăng bán**, giá, tỷ giá | ✓ | | |
| Banner, bộ sưu tập, cấu hình cửa hàng, kho, địa bàn | ✓ | | |
| Tài khoản nhân viên/khách, cộng tác viên, báo cáo | ✓ | | |

Menu mỗi vai trò thấy:
- **Quản trị viên:** toàn bộ.
- **Quản lý kho:** Tổng quan; **Đơn hàng** → Danh sách đơn, Đơn đặt trước; toàn bộ nhóm **Kho hàng** (kể cả Chuyến hàng).
- **Nhân viên đơn hàng:** Tổng quan; **Đơn hàng** → Danh sách đơn, Đơn đặt trước, Đánh giá; **Kho hàng** → Tồn kho, Phiếu kho, Chờ kiểm tra, Cảnh báo (không có Chuyến hàng).

Quy tắc cần nhớ:
- **Chỉ Quản trị viên** thao tác sản phẩm, giá, duyệt, đăng bán. Hệ thống **không bắt buộc hai người khác nhau**: một Quản trị viên có thể tự gửi duyệt rồi tự duyệt sản phẩm của mình.
- Luôn phải còn **ít nhất 1 Quản trị viên đang hoạt động**.
- Không thể tự đổi vai trò, email, khoá, xoá hay đặt lại mật khẩu cho **chính mình** ở trang nhân viên (đổi mật khẩu của mình ở **Tài khoản của tôi**).

---

## 4. Khái niệm cần biết

Phần này giải thích **một lần**; các mục sau chỉ dẫn lại.

### 4.1. Kho bán và hai cách tính giá

Mỗi sản phẩm thuộc **đúng một kho bán**. Nhập, chuyển, giữ hàng và xuất cho đơn đều theo kho của sản phẩm. Có hai kiểu kho (chọn khi tạo kho ở **Cài đặt › Quản lý kho**, ô **Cách tính giá**):

| Kiểu | Trên màn hình | Hàng | Tiền mua nhập bằng | Giá bán tính theo |
|---|---|---|---|---|
| Nhập từ Việt Nam | **Hàng nhập VN (VND)** | nhập từ VN về Myanmar | VND | vốn VND × tỷ giá × (1 + % lãi) + cước/kg × khối lượng |
| Mua tại Myanmar | **Hàng mua MMK** | mua trong nước | MMK | vốn MMK + **lãi cố định** của sản phẩm |

Theo tài liệu thiết kế của dự án, hai kho đang dùng là Kho Thắm (nhập VN) và Kho Chi (mua MMK). Combo và các thành phần của nó phải cùng kho.

### 4.2. Sản phẩm, biến thể, SKU, combo, tester

- **Sản phẩm** có một hoặc nhiều **biến thể** (màu, dung tích) — trên form, trang sản phẩm, danh sách và file Excel đều ghi là **Phân loại (dung tích/màu)**. Mỗi biến thể có **SKU** (mã nội bộ) riêng. Không chia loại thì hệ thống tạo biến thể **"Tiêu chuẩn"**.
- Giá, tồn kho, khối lượng tính **theo biến thể**. Biến thể đã lưu **không xoá được**, chỉ tắt (bỏ chọn **Đang dùng**).
- **Combo** gồm các sản phẩm khác (cùng kho). Tồn combo tính từ thành phần; khi bán, hệ thống trừ kho **từng thành phần**. Không nhập kho trực tiếp cho combo.
- **Tester/quà** là loại tồn riêng (**Loại tồn** = "Tester/quà"). Tester **không bao giờ bán được**.

### 4.3. Lô và hạn sử dụng

> **Từ 17/11/2026 quản lý hạn sử dụng đang TẮT.** Hệ thống **không chặn bán theo hạn** (kể cả lô đã quá hạn — cần tự kiểm hàng trước khi giao), form nhập kho không còn ô hạn dùng, trang Cảnh báo không còn tab Hạn dùng, Cấu hình cửa hàng không còn nhóm hạn dùng. Phần dưới đây chỉ áp dụng khi tính năng được bật lại.

Hàng nhập về được ghi theo **lô** (số lô, hạn dùng, giá mua). Ba tình trạng hạn:

| Tình trạng | Trên màn hình | Bán được? |
|---|---|---|
| Có hạn | "Đã biết hạn" | Có, nếu còn hạn đủ ngưỡng |
| Sản phẩm không áp dụng hạn | "Không áp dụng hạn sử dụng" | Có (bật/tắt ở ô **Quản lý hạn sử dụng cho sản phẩm này**) |
| Chưa biết hạn | "Chưa biết hạn · Chưa được bán" | **Không** — đến khi vào trang lô bấm **Xác nhận hạn sử dụng** |

**FEFO:** khi xuất hàng, hệ thống lấy **lô hết hạn sớm nhất trước**. Lô còn hạn **dưới 90 ngày** (ô **Ngừng bán khi còn hạn dưới (ngày)**, đổi được ở Cấu hình cửa hàng) bị **ngừng bán**: không xuất cho đơn, không tính vào tồn "Còn bán".

### 4.4. Giữ hàng và xuất kho

- **Giữ hàng:** khi đơn được tạo hoặc xác nhận, hàng chỉ bị **giữ** — tồn "Còn bán" giảm nhưng chưa có phiếu xuất kho.
- **Xuất kho thật** xảy ra đúng lúc bấm **Đã bàn giao vận chuyển** ([mục 10.6](#106-bàn-giao-giao-thành-công-huỷ-và-trả-hàng)): hệ thống tự chọn lô theo FEFO và tạo phiếu **Xuất kho** (mỗi kho một phiếu).

### 4.5. Phiếu kho: Nháp và Ghi sổ

- **Nháp**: lưu để kiểm tra, **chưa ảnh hưởng tồn**. Phiếu nhập nháp sửa được (**Sửa phiếu**); mọi phiếu nháp có thể **Huỷ phiếu**.
- **Ghi sổ** 📦⛔: tồn thay đổi thật. Sổ kho chỉ được **ghi thêm**, không sửa hay xoá. Phiếu đã ghi sổ không sửa được — muốn sửa sai hãy tạo phiếu **Điều chỉnh** ([mục 8.3](#83-chuyển-kho-xuất-kho-và-điều-chỉnh)).
- Tồn kho **không bao giờ âm**: hệ thống từ chối phiếu làm tồn âm.

### 4.6. Giá vốn

Mỗi lô có giá vốn theo thứ tự ưu tiên:
1. **Thực tế** — từ phân bổ chi phí chuyến hàng, hoặc cột **Phí đưa về kho** trong Excel.
2. **Tạm tính** — giá mua × tỷ giá + cước ước tính × khối lượng.
3. **Thiếu giá vốn**.

Báo cáo lợi nhuận dùng giá vốn của lô lúc xuất. Xem thêm `docs/gia-von-tam-tinh.md`.

### 4.7. Nhập thêm vào lô đã có nhưng khác giá

Được phép nếu **cùng hạn dùng, cùng loại tiền và cùng chuyến hàng (hoặc cùng không thuộc chuyến nào)**; khác một trong các điều đó thì bị chặn. Giá vốn lô = **bình quân theo số lượng nhập**. Nhưng **giá dùng để gợi ý giá bán** là giá của **lần nhập gần nhất**, không phải bình quân.

### 4.8. Trạng thái sản phẩm

| Trạng thái | Nghĩa |
|---|---|
| **Nháp** | Mới tạo, hoặc bị rút khỏi hàng chờ duyệt |
| **Chờ duyệt** | Đã gửi duyệt |
| **Bị từ chối** | Người duyệt từ chối, kèm lý do |
| **Đang bán** | Đã duyệt và bật hiển thị — khách thấy trên web |
| **Tạm ẩn** | Đã duyệt nhưng đang tắt hiển thị |
| **Ngừng kinh doanh** | Đã "xoá" nhưng có lịch sử kho/đơn nên được giữ lại, ẩn khỏi web |

Khách chỉ thấy sản phẩm **Đang bán** và chưa ngừng kinh doanh. Danh sách còn có các tab **Chờ hoàn thiện**, **Hết hàng**, **Tất cả**.

### 4.9. Sản phẩm đã duyệt và "bản đang sửa"

Sau khi sản phẩm đã được duyệt một lần, sửa các trường quan trọng **không đổi ngay** cái khách thấy: thay đổi nằm trong **bản đang sửa** (nháp) cho đến khi được duyệt ([mục 9.4](#94-sửa-sản-phẩm-đã-duyệt)).

---

## 5. Sản phẩm

Chỉ **Quản trị viên** làm các việc trong mục này.

### 5.1. Tạo sản phẩm mới (bước 1 trong 5)

**Mục đích:** tạo "vỏ" sản phẩm chỉ với thông tin cơ bản. Giá, ảnh, mô tả, hiển thị làm ở các bước sau.

**Cần chuẩn bị:** danh mục đã có (**Sản phẩm › Danh mục**); biết sản phẩm thuộc kho nào nếu có nhiều kho bán.

**Các bước**
1. **Sản phẩm › Danh sách sản phẩm › Thêm sản phẩm**.
2. Điền 5 ô:
   - **Tên sản phẩm** — gõ bằng ngôn ngữ admin đang dùng. Muốn thêm tên ngôn ngữ khác, bấm **+ Thêm Tên tiếng Myanmar** (hoặc **+ Thêm Tên tiếng Anh**). Chỉ điền một tên cũng được; tên còn lại tự chép theo khi lưu.
   - **Thương hiệu** — chọn trong danh sách hoặc gõ tên mới (hiện "Thương hiệu mới — sẽ được tạo khi lưu").
   - **Danh mục** — bắt buộc.
   - **Kho** — chỉ hiện khi có nhiều hơn một kho bán.
   - **Phân loại (dung tích/màu)** — gõ từng loại, bấm Enter hoặc dấu phẩy để thêm (ví dụ "Đỏ", "50ml"). Để trống nếu chỉ có một loại → hệ thống tạo "Tiêu chuẩn".
3. Bấm **Tạo sản phẩm**.

**Sao chép từ sản phẩm cũ:** mở khối **Sao chép từ sản phẩm cũ**, chọn **Sản phẩm nguồn**, bấm **Nạp thông tin** (điền sẵn tên, thương hiệu, danh mục, phân loại). Hoặc bấm **Nhân bản** ở trang một sản phẩm. Khi tạo, hệ thống chép mô tả, ảnh và thiết lập; **không chép giá, hoa hồng CTV, lãi cố định và tồn kho**.

**Tạo combo:** trên trang **Thêm sản phẩm** bấm **Tạo combo** (hoặc menu ⋯ **Tạo khác** → **Tạo combo**). Ô Phân loại được thay bằng **Thành phần combo** (chọn sản phẩm + **Số lượng**, bấm **Thêm thành phần**). Thành phần phải **cùng kho bán**.

**Kết quả:** trang sản phẩm mở ra với thông báo "Đã tạo sản phẩm. Làm tiếp bước 2: nhập kho." Mã đường dẫn (slug) và SKU được tạo tự động. Giá = 0, sản phẩm **ẩn**, trạng thái **Nháp**. 👁 Khách chưa thấy gì.

**Lỗi thường gặp**
| Thông báo | Cách xử lý |
|---|---|
| "Cần nhập tên sản phẩm" | Điền ít nhất một tên |
| "Cần chọn hoặc nhập tên thương hiệu" | Điền thương hiệu |
| "Combo cần ít nhất 1 thành phần" | Thêm thành phần cho combo |
| "Phân loại bị trùng tên" | Hai loại cùng tên — sửa lại một loại |
| "Sản phẩm nguồn không còn tồn tại" | Chọn lại sản phẩm nguồn khác |

### 5.2. Trang sản phẩm: 5 bước và các lưu ý

Mở sản phẩm từ **Danh sách sản phẩm**. Ở đầu trang có nút **Nhân bản**, **Sửa sản phẩm**, **Xem như khách** (chỉ khi đang bán) và thanh **Tiến độ đăng bán** với 5 bước. Mỗi bước mang một trong các nhãn: **Xong**, **Có lưu ý**, **Cần làm**, **Chờ bước trước**. Các thẻ nội dung: **Tổng quan**, **Biến thể**, **Tồn kho**, **Giá bán**, **Lịch sử giá**, **Nhật ký** (xem lịch sử thay đổi sản phẩm).

| Bước | Tên | Làm gì |
|---|---|---|
| 1 | **Tạo sản phẩm** | Ảnh và thông tin sản phẩm ([5.3](#53-sửa-thông-tin-sản-phẩm), [5.4](#54-ảnh-sản-phẩm)) |
| 2 | **Nhập kho + giá vốn** | Nút **Nhập hàng**, **Xem tồn kho** ([mục 8](#8-kho-hàng)) |
| 3 | **Giá bán** | Nút **Đặt giá** (Thủ công) hoặc **Tính tự động** — cả hai mở trang **Giá bán** ([mục 7](#7-giá-bán-và-tỷ-giá)) |
| 4 | **Duyệt** | Gửi duyệt/duyệt ([mục 9](#9-duyệt-và-đăng-bán)) |
| 5 | **Đăng bán** | **Bật hiển thị trên web** / **Ẩn khỏi web**, **Đặt trước khi hết hàng** |

Khối **Kiểm tra điều kiện đăng bán** bên cạnh có ba dòng, mỗi dòng **Đạt** hoặc **Thiếu**: **Thông tin sản phẩm**, **Giá bán**, **Tồn kho / Khả năng bán**.

**Lỗi (chặn gửi duyệt, duyệt và bật hiển thị):**
| Nội dung | Cách sửa |
|---|---|
| "Không có phân loại đang dùng" | Bật ít nhất một phân loại (**Đang dùng**) |
| "Kho bán đã ngừng hoặc không phải kho bán" | Đổi kho sản phẩm ([5.8](#58-xoá-khôi-phục-đổi-kho-ẩnhiện)) |
| "Giá bán ≤ 0" | Đặt giá ở bước 3 |
| "Thiếu khối lượng (cần cho cước/kg)" | Chỉ khi **giá tự động đang bật** và kho **Hàng nhập VN**: điền **Khối lượng (g)** (ở phiếu nhập hoặc **Thiết lập khác**). Giá tự động đang tắt (18/11/2026) → không còn chặn, chỉ là lưu ý "cần khi gửi VTP" |

**Lưu ý (không chặn, nhưng nên xử lý):** "Chưa có ảnh"; "Thiếu mô tả (MY/EN)"; "Thiếu khối lượng (cần khi gửi VTP)" (kho Hàng mua MMK, và mọi kho khi giá tự động tắt); "Tồn bán thiếu giá vốn"; "Tồn bán đang dùng giá vốn tạm"; "Hết hàng và không nhận đặt trước (trang SP hiện "Hết hàng")"; "Có tồn ở kho bán khác — chuyển kho để bán"; "Có phiếu nhập mới sau lần đặt giá gần nhất — nên tính lại giá"; "Có tỷ giá mới hơn lần đổi giá gần nhất — nên tính lại giá" (kho nhập VN).

Điều cần biết:
- Chưa nhập hàng (bước 2 báo **Cần làm**) **không phải lỗi**: sản phẩm vẫn duyệt và đăng được, chỉ là khách thấy "Hết hàng" hoặc đặt trước.
- Sản phẩm **đang bán không bao giờ tự ẩn**, kể cả khi còn lỗi. Nhưng **lưu** một sản phẩm đang bán sẽ bị từ chối nếu làm nó có giá ≤ 0 hoặc không còn biến thể dùng ("Chưa bật hiển thị / lưu được: …").

### 5.3. Sửa thông tin sản phẩm

**Sản phẩm › Danh sách sản phẩm › (mở sản phẩm) › Sửa sản phẩm.**

- **Thông tin chung:** **Tên tiếng Myanmar**, **Tên tiếng Anh**, **Thương hiệu**, **Danh mục**.
- **Mô tả:** **Mô tả tiếng Myanmar**, **Mô tả tiếng Anh**. Trang tiếng Anh **không** tự lấy mô tả tiếng Myanmar.
- **Phân loại:** mỗi dòng có ô **Phân loại (dung tích/màu)** và ô **Đang dùng**. Bấm **Thêm phân loại** để thêm; biến thể mới có giá 0, và nếu sản phẩm đang bán thì biến thể mới **được tạo ở trạng thái tắt**.
- **Thiết lập khác (mã, kho, hạn dùng)** (khối đóng sẵn, bấm để mở):
  - **Slug (URL)** — **khoá sau lần đăng bán đầu tiên** (đường dẫn khách đã dùng).
  - **SKU** từng biến thể — tự điền, sửa được; trùng thì hệ thống tự thêm hậu tố khi lưu. Chỉ gồm chữ, số và `. _ -`.
  - **Khối lượng (g)** từng biến thể.
  - **Kho** — chỉ hiện khi có nhiều kho. Đổi kho: hàng còn ở kho cũ chỉ bán lại sau khi tạo phiếu chuyển kho sang kho mới.
  - **Quản lý hạn sử dụng cho sản phẩm này**.
- Giá, hoa hồng CTV và lãi cố định **không sửa được ở form này** — chỉ ở bước 3 ([mục 7](#7-giá-bán-và-tỷ-giá)).

**Ba nút lưu**
| Nút | Làm gì |
|---|---|
| **Lưu** | Chỉ lưu |
| **Lưu & Gửi duyệt** | Lưu rồi gửi duyệt |
| **Lưu & Duyệt** | Lưu, gửi duyệt và duyệt luôn. Nếu sản phẩm chưa từng duyệt và bạn có quyền đăng bán, **đăng luôn** 👁 |

**Lỗi thường gặp**
| Thông báo | Cách xử lý |
|---|---|
| "Cần ít nhất một tên (Myanmar hoặc tiếng Anh)" | Điền một tên |
| "SKU {sku} đã được dùng" | Đổi SKU khác |
| "SKU {sku} bị lặp trong sản phẩm" | Hai biến thể trùng SKU |
| "SKU {sku} đang chờ duyệt ở sản phẩm khác" | Đổi SKU |
| "Tên loại … bị trùng (SKU a và b)" | Đổi tên một loại |
| "Slug chỉ gồm a-z, 0-9 và -" | Sửa slug |
| "Đường dẫn (slug) … đã được sản phẩm khác dùng" | Đổi slug |
| "Đường dẫn (slug) đã khoá sau lần đăng bán đầu tiên — giữ …" | Không đổi slug được nữa |
| "Kho của sản phẩm phải là kho bán" / "Kho {name} đã ngừng dùng" | Chọn kho bán đang hoạt động |
| "Thành phần {sku} của combo {sku} thuộc kho khác" | Thành phần phải cùng kho |
| "Đã lưu nhưng chưa gửi duyệt: …" | Lưu thành công; đọc phần sau dấu hai chấm để biết cần sửa gì rồi **Gửi duyệt** lại |

### 5.4. Ảnh sản phẩm

Ở bước 1: **Chọn ảnh sản phẩm** → **Tải lên**. JPG/PNG/WebP, tối đa **5MB mỗi ảnh**, chọn nhiều ảnh cùng lúc (tối đa 10 ảnh mỗi lần). **Ảnh đầu tiên là ảnh đại diện.**

Mỗi ảnh có: **Mô tả ảnh (alt)** + **Lưu mô tả**, **Lên** / **Xuống** (đổi thứ tự), **Xoá ảnh** (có hỏi lại).

Lỗi: "File ảnh không hợp lệ (JPG/PNG/WebP, tối đa 5MB)", "Chưa chọn ảnh", "Tối đa 10 ảnh mỗi lần".

Với sản phẩm **đã duyệt**, thêm/xoá ảnh được giữ lại chờ duyệt: "Ảnh chờ duyệt: thêm {add}, xoá {remove} (khách chưa thấy)." Đổi thứ tự và mô tả ảnh thì áp dụng ngay.

### 5.5. Combo

- Thành phần phải là sản phẩm thường **cùng kho bán**.
- Tồn combo tính từ thành phần. Không nhập kho cho combo: "Không nhập kho trực tiếp cho combo — nhập từng thành phần".
- Combo chưa khai báo khối lượng thì dùng tổng khối lượng thành phần.
- Combo **không nhận đặt trước**. Excel không sửa được combo ("SKU {sku} là combo — sửa combo trong trang sản phẩm").
- Đổi kho: combo và thành phần phải đổi **cùng lúc**.

### 5.6. Thương hiệu

**Không có trang quản lý thương hiệu.** Thương hiệu được **tạo khi bạn gõ tên mới** (ở form sản phẩm hoặc Excel) và **tự xoá khi không còn sản phẩm nào dùng**. Tên được so khớp không phân biệt hoa/thường và dấu ("Estée Lauder" và "Estee Lauder" là một). Thương hiệu chỉ còn sản phẩm ngừng kinh doanh vẫn được giữ nhưng không gợi ý ở form.

### 5.7. Đặt trước khi hết hàng (bước 5)

Khối **Đặt trước khi hết hàng** (đang nhận / đã tắt):
- Mặc định **bật**: sản phẩm hết hàng vẫn cho **khách đặt trên web** (đơn vào trạng thái **Chờ hàng về**, không giữ hàng). Tắt bằng cách bỏ chọn **Cho đặt trước khi hết hàng** → **Lưu đặt trước**.
- **Hạn mức (cái)** từng biến thể: để trống thì dùng ô **Hạn mức đặt trước mặc định mỗi phân loại (cái, 0 = không nhận)** ở Cấu hình cửa hàng (mặc định 20; **0 = không nhận**). Trang sản phẩm hiện "Đang chờ hàng: {n} cái".
- Chỉ đơn **khách tự đặt trên web** mới thành đặt trước. Đơn do nhân viên/CTV tạo mà thiếu hàng sẽ báo "Không đủ hàng". Combo không đặt trước được.

Xử lý đơn đặt trước: [mục 10.9](#109-đơn-đặt-trước).

### 5.8. Xoá, khôi phục, đổi kho, ẩn/hiện

**Xoá** — ở danh sách: menu ⋯ của dòng → **Xoá**, hoặc tick nhiều dòng → **Xoá đã chọn**.
- Sản phẩm **chưa nhập kho** (không có phiếu kho **đã ghi sổ**, không giữ hàng, không đơn, không phải thành phần combo khác) → **xoá hẳn** cùng ảnh và lịch sử giá ⛔. Sản phẩm đang nằm trong **phiếu nhập nháp** cũng xoá hẳn được: dòng của sản phẩm đó bị gỡ khỏi phiếu nháp (phiếu không còn dòng nào thì bị xoá).
- Có lịch sử → chuyển sang **Ngừng kinh doanh** (ẩn khỏi web, giữ lịch sử). Hệ thống báo "Đã xoá {deleted} sản phẩm; {archived} sản phẩm có lịch sử kho/đơn đã chuyển sang Ngừng kinh doanh."
- **Khôi phục:** tab **Ngừng kinh doanh** → tick → **Khôi phục đã chọn** (hoặc **Khôi phục** ở dòng). Sản phẩm khôi phục **đang ẩn**; bật hiển thị khi muốn bán lại. Sản phẩm ngừng kinh doanh không bật hiển thị và không cập nhật bằng Excel được cho đến khi khôi phục.

**Đổi kho hàng loạt:** tick sản phẩm → chọn kho → **Đổi kho**. Hàng còn ở kho cũ chỉ bán được sau khi chuyển kho ([8.3](#83-chuyển-kho-xuất-kho-và-điều-chỉnh)).

**Bán đặt trước khi chưa có hàng (18/11/2026):** sản phẩm chưa nhập hàng thì chưa có kho bán → lỗi "Chưa có kho bán". Vào trang sản phẩm → tab **Tồn & nhập hàng** → khối **Chưa có kho bán** → chọn **Kho bán** → **Gán kho** (hoặc dùng **Đổi kho** ở danh sách). Sau đó đặt giá → gửi duyệt → duyệt → bật hiển thị; web hiện **Pre-order**, đơn khách vào **Đơn đặt trước**. Khi hàng về, nhập hàng vào đúng kho đã gán rồi chuyển xử lý đơn.

**Hiện/ẩn:** từng sản phẩm ở bước 5 (**Bật hiển thị trên web** / **Ẩn khỏi web**); hàng loạt: tick → **Hiện trên web** / **Ẩn khỏi web**. Điều kiện bật: không còn lỗi ở [5.2](#52-trang-sản-phẩm-5-bước-và-các-lưu-ý) **và** đã được duyệt ít nhất một lần.

**Thao tác hàng loạt khác ở danh sách:** **Chọn tất cả ({count})**, **Gửi duyệt**.

---

## 6. Nhập và cập nhật sản phẩm bằng Excel

**Mục đích:** tạo nhiều sản phẩm cùng lúc, cập nhật thông tin/giá sản phẩm đã có, và nhập tồn đầu kỳ.

**Ai làm được:** Quản trị viên. Quyền cần có tuỳ nội dung file: sửa giá/hoa hồng CTV cần quyền quản lý giá; có cột số lượng cần quyền nhập kho; **Duyệt luôn** cần quyền duyệt.

**Cần chuẩn bị trước:** Danh mục · Kho bán · Tỷ giá (khi nhập tồn hàng VND). Thiếu tỷ giá: "Cần thiết lập tỷ giá đang có hiệu lực (Giá bán › tab Tỷ giá) trước khi nhập tồn hàng VND."

### 6.1. Lấy file mẫu

**Sản phẩm › Danh sách sản phẩm › Nhập Excel** (trang "Nhập từ Excel / CSV"). Có hai file:
- **Tải file mẫu trống** → `mau-nhap-san-pham.xlsx`: để **tạo sản phẩm mới**.
- **Tải danh sách sản phẩm hiện có (để cập nhật)** → `san-pham-hien-co-YYYYMMDD.xlsx`: có sẵn dữ liệu hiện tại và SKU; cột **Giá bán (MMK)** và **Hoa hồng CTV** chỉ có nếu bạn có quyền quản lý giá.

Nút **Xuất Excel** ở danh sách sản phẩm cũng tải danh sách hiện có.

Cấu trúc file: sheet **Nhap hang** (dòng tiêu đề ở dòng 6, dữ liệu từ dòng 7), sheet **Huong dan** (quy tắc), sheet **Danh sach** (ẩn, cấp danh sách chọn). Một số cột phụ được thu gọn sau nút **+** ở lề trái. **Chỉ dùng file tải từ hệ thống** — file mẫu cũ hai sheet bị từ chối ("Đây là file mẫu cũ (hai sheet)…").

### 6.2. Các cột

Dấu * = bắt buộc khi tạo sản phẩm mới.

| Cột | Ý nghĩa và quy tắc |
|---|---|
| Tên Myanmar / Tên tiếng Anh | Cần ít nhất một tên. Các dòng **cùng tên + cùng thương hiệu** được gộp thành các biến thể của một sản phẩm |
| Thương hiệu * | Chọn hoặc gõ tên mới (tự tạo thương hiệu) |
| Danh mục * | Tên hoặc mã danh mục — danh mục phải có sẵn |
| Phân loại (dung tích/màu) | Màu/dung tích. Trống = "Tiêu chuẩn" |
| Giá bán (MMK) | 💰 Điền = đặt giá (> 0) cho SKU có sẵn **và SKU mới**; **trống = giữ nguyên** (kể cả giá đang chờ duyệt). SKU mới để trống → giá 0, lưu nháp. Cần quyền quản lý giá |
| Khối lượng (g) | Số nguyên gam. Kho Hàng nhập VN bắt buộc có trước khi gửi duyệt/đăng |
| Hoa hồng CTV (MMK/cái) | 💰 Số tiền cố định/cái. Trống = giữ nguyên (SKU mới: không có hoa hồng). SP đã duyệt: chờ duyệt **cùng giá**. Không xoá được qua Excel |
| Mô tả Myanmar / Mô tả tiếng Anh | Tuỳ chọn |
| Cách dùng, Thành phần, Bảo quản, Hạn sau mở nắp (tháng) | Tuỳ chọn; hạn sau mở nắp tối đa 120 tháng. **Đây là nơi duy nhất sửa các trường này** (form sản phẩm không có ô) |
| Kho bán | Mã kho. Trống = kho mặc định. Không đổi được kho của sản phẩm đã có |
| Có hạn dùng | "Có" (mặc định) hoặc "Không" |
| SKU | **Trống = tạo mới; có SKU đã tồn tại = cập nhật sản phẩm đó** |
| Số lượng nhập | Điền thì tạo **phiếu nhập nháp** |
| Hạn sử dụng | dd/mm/yyyy. Trống ở sản phẩm có quản lý hạn = lô "chưa biết hạn", chưa bán được |
| Giá mua/đv | VND với kho Hàng nhập VN, MMK với kho Hàng mua MMK |
| Phí đưa về kho (VND/đv) | Chỉ kho VND. Điền số (kể cả **0** = không phát sinh phí) → giá vốn thực tế = giá mua + phí. **Để trống = chưa biết** → lô **chưa có giá vốn** (không tự coi là 0; đơn dùng lô này không bàn giao được đến khi có giá vốn tạm/thực tế) |
| Số lô | Trống = hệ thống tự đặt `NK<yymmdd>[-n]` |

Dấu phân cách hàng nghìn kiểu 150,000 hoặc 150.000 đều được nhận. Tối đa **2 MB** và **5000 dòng** mỗi lần.

### 6.3. Các bước

1. Mở file, **điền dữ liệu từ dòng 7** (không sửa dòng tiêu đề).
2. Ở trang nhập: chọn file → bấm **Xem trước**. **Xem trước chỉ đọc, chưa lưu gì.**
3. Đọc kết quả: tóm tắt "{created} SP mới · {updated} SP cập nhật · {unchanged} SP không đổi · {stock} dòng nhập tồn"; từng dòng có nhãn **Tạo mới** / **Cập nhật** / **Không đổi**. Mục **Cần sửa trong file trước khi nhập:** là lỗi bắt buộc sửa; mục **Lưu ý:** là cảnh báo.
4. Sửa file và **Xem trước** lại cho đến khi hết lỗi.
5. Chọn tuỳ chọn: **Gửi duyệt ngay** (đã tick sẵn) và **Duyệt luôn** (chỉ người có quyền duyệt; không bao giờ tự đăng sản phẩm mới).
6. Bấm **Xác nhận nhập**. Nút bị khoá khi còn lỗi ("Chưa thể xác nhận vì file còn lỗi…"). Hệ thống kiểm tra lại toàn bộ trong một lần ghi duy nhất.

### 6.4. Điều gì thay đổi

- **SKU có sẵn** → cập nhật. **Ô trống = giữ nguyên** (không xoá được dữ liệu bằng Excel). Không đổi kho, không sửa combo.
- **SKU mới hoặc không có SKU** → tạo sản phẩm **ẩn, chưa duyệt** 👁 (khách chưa thấy), giá = cột Giá bán (trống → 0, lưu nháp). Nếu tên trùng sản phẩm đã có, hệ thống cảnh báo "đã có sản phẩm cùng tên … Muốn cập nhật sản phẩm đó thì điền SKU của nó."
- **Sản phẩm đã duyệt:** nội dung, giá **và hoa hồng CTV** đổi qua Excel đi vào **bản đang sửa** chờ duyệt ([9.4](#94-sửa-sản-phẩm-đã-duyệt)) — giá và hoa hồng có hiệu lực cùng lúc khi duyệt; khối lượng áp dụng ngay. Ô giá để trống **không** đụng tới giá đang chờ duyệt.
- **Tải "danh sách sản phẩm hiện có"** ghi giá / hoa hồng **hiệu lực** (đang chờ duyệt nếu có) → tải về rồi nhập lại không sửa gì sẽ không đổi giá.
- **Có Số lượng nhập** → 📦 tạo **phiếu Nhập kho NHÁP** (lý do "Nhập hàng từ Excel"), mỗi kho một phiếu. **Tồn chưa tăng cho đến khi bạn mở phiếu, kiểm tra và Ghi sổ** ([8.2](#82-phiếu-nhập-kho)). Hộp kết quả có link "{code} · kiểm tra và ghi sổ".
- **Gửi duyệt ngay** bỏ qua sản phẩm chưa đủ điều kiện (vd chưa có giá): "Chưa gửi được {n} sản phẩm (chưa đủ điều kiện): … Giá bán ≤ 0". Đặt giá ([mục 7](#7-giá-bán-và-tỷ-giá)) rồi gửi duyệt.
- **Duyệt luôn** chỉ duyệt sản phẩm mà lượt nhập này là thay đổi duy nhất. Sản phẩm đã có thay đổi / đang chờ duyệt từ trước được liệt kê "Chưa duyệt luôn … — mở xem đầy đủ rồi duyệt".
- **Xem trước giá vốn** chỉ hiện giá vốn sẽ thực sự được ghi; dòng để trống Phí đưa về kho hiện "—" và cảnh báo "để trống Phí đưa về kho → lô CHƯA CÓ giá vốn".
- 💰 **Tỷ giá được chốt:** preview hiện "Tỷ giá tính giá vốn: 1 VND = {rate} MMK (chốt cho các lô nhập lần này)"; giá vốn các lô lấy theo tỷ giá đó.

### 6.5. Hệ thống tự chặn

- **Nhập lại cùng một file:** "File này đã được nhập lúc … (UTC). Không nhập lại — sửa file nếu cần cập nhật tiếp." Chỉ khi file có tồn mới bị chặn lặp.
- **Tỷ giá đổi giữa lúc xem trước và xác nhận:** "Tỷ giá vừa thay đổi. Tải file lên xem trước lại trước khi xác nhận."
- **Giá đã bị sửa ở nơi khác giữa chừng:** "Giá bán của {skus} vừa thay đổi ở nơi khác. Tải file lên xem trước lại…"
- **Thiếu quyền giá:** "File có đổi giá bán / hoa hồng CTV — cần quyền quản lý giá…"

### 6.6. Lỗi thường gặp (hiện kèm "Dòng N:")

| Thông báo (rút gọn) | Cách xử lý |
|---|---|
| Chỉ nhận Excel .xlsx hoặc CSV… | Lưu đúng định dạng |
| File quá lớn (tối đa 2 MB) / Tối đa 5000 dòng mỗi lần nhập | Chia file |
| Không tìm thấy hàng tiêu đề… / File có cột trùng tên… | Dùng lại file mẫu, giữ nguyên dòng tiêu đề |
| ngày "x" không hợp lệ — nhập theo dd/mm/yyyy | Sửa định dạng ngày |
| phải là số / phải là số nguyên / không được âm / phải lớn hơn 0 | Sửa ô số |
| Danh mục "x" chưa có — tạo ở trang Danh mục trước | Tạo danh mục trước ([15.5](#155-danh-mục)) |
| Có nhiều danh mục tên … — điền mã danh mục | Điền mã thay vì tên |
| Chưa điền thương hiệu / Chưa điền danh mục | Điền ô còn thiếu |
| {cột} khác nhau giữa các dòng | Các dòng cùng sản phẩm phải khớp nhau ở cột đó |
| Sản phẩm đang thuộc kho X — đổi kho trong trang sản phẩm, không đổi qua Excel | Để trống hoặc điền đúng kho hiện tại |
| Có thông tin tồn nhưng chưa điền Số lượng nhập | Điền số lượng hoặc xoá thông tin tồn |
| Chưa điền giá mua (VND/đv) — kho … nhập từ Việt Nam | Điền giá mua |
| Sản phẩm không quản lý hạn dùng: để trống hạn sử dụng | Xoá ô hạn sử dụng |
| Trùng SKU và số lô X — gộp số lượng thành một dòng | Gộp dòng |
| Lô X … đã có với hạn dùng khác… | Dùng số lô khác hoặc đúng hạn cũ |
| Lô X … thuộc chuyến hàng — nhập thêm qua phiếu nhập của chuyến | Nhập qua phiếu kho ([8.2](#82-phiếu-nhập-kho)) |
| Hoa hồng CTV … lớn hơn giá bán | Giảm hoa hồng |
| …đã ngừng kinh doanh — khôi phục trước khi cập nhật | Khôi phục sản phẩm ([5.8](#58-xoá-khôi-phục-đổi-kho-ẩnhiện)) |

Cảnh báo (không chặn) về lô: đã hết hạn, còn dưới ngưỡng ngừng bán (mặc định 90 ngày) hoặc chưa có hạn.

---

## 7. Giá bán và tỷ giá

Chỉ **Quản trị viên** làm. 💰 Mọi thao tác trong mục này ảnh hưởng đến giá khách trả.

**Nơi đặt giá chính là trang Sản phẩm › Giá bán** (cập nhật 16/11/2026). Ở đây tick các SKU rồi chọn **Nhập thủ công** hoặc **Tính tự động**. Ngoài ra chỉ còn **Excel** nhập thẳng giá ([mục 6](#6-nhập-và-cập-nhật-sản-phẩm-bằng-excel)). Bước 3 trang sản phẩm, phiếu nhập ("Tính giá SKU vừa nhập") đều dẫn về trang Giá bán. Trang **Giá & tỷ giá** cũ đã gộp vào đây (16/11/2026): tỷ giá và lịch sử giá là hai tab **Tỷ giá**, **Lịch sử giá** của trang Giá bán; đường dẫn cũ tự chuyển sang đúng tab.

Nguyên tắc chung:
- **Giá áp dụng chung cho SKU.** "Lô nguồn" chỉ là lần nhập dùng để tính; khách không chọn lô, không có giá riêng theo lô.
- **Đổi tỷ giá hoặc giá vốn KHÔNG tự đổi giá trên web.** Hệ thống chỉ gắn nhãn **"Đầu vào mới — nên tính lại"** (có phiếu nhập / tỷ giá mới hơn lần đặt giá gần nhất, kể cả giá đang chờ duyệt). Giá thủ công khác công thức tự động **không** bị coi là lỗi.
- **Sản phẩm chưa từng duyệt:** giá ghi thẳng (khách chưa thấy vì sản phẩm chưa đăng). **Sản phẩm đã duyệt:** giá **và hoa hồng CTV** vào **bản đang sửa**, khách vẫn thấy giá cũ đến khi **Duyệt thay đổi**; giá và hoa hồng có hiệu lực **cùng lúc**. Đơn cũ giữ nguyên giá / hoa hồng đã chốt.
- Được **thay giá đang chờ duyệt** bằng kết quả mới (các thay đổi khác của bản đang sửa giữ nguyên). Nếu giá / hoa hồng vừa bị người khác đổi sau khi bạn mở trang → báo "vừa được đổi ở nơi khác — tải lại trang" (không ghi đè).
- Mọi đường đều chặn **hoa hồng CTV lớn hơn giá bán**.
- Lịch sử giá ghi nguồn: "Bảng tính giá" (cả tự động lẫn thủ công) / "Excel" / "Sửa tay" (kho MMK), kèm hoa hồng khi đổi cùng lúc.

### 7.1. Tỷ giá

**Sản phẩm › Giá bán › tab Tỷ giá.**

1. Điền **1 USD = … MMK**, **1 USD = … VND**, **Ghi chú**. Dòng xem trước hiện "1 MMK = x VND · 1 VND = y MMK".
2. Bấm **Thêm tỷ giá** → "Đã thêm tỷ giá".

Kết quả: tỷ giá mới nhất thành **Đang dùng**. ⛔ **Tỷ giá chỉ thêm, không sửa, không xoá** — nhập sai thì thêm tỷ giá đúng ngay sau đó.

Tỷ giá được chốt vào lô lúc **ghi sổ phiếu nhập** (phiếu tay) hoặc lúc **xác nhận Excel**; sửa phiếu nháp mà không đổi giá mua thì giữ tỷ giá đã chốt. Lỗi: "Tỷ giá USD→MMK phải > 0, tối đa 2 chữ số thập phân".

### 7.2. Trang Giá bán (danh sách)

> **Cập nhật 17/11/2026:** trang Giá bán **sửa giá ngay trong bảng** — chọn kho ở ô **Kho** (bảng tự lọc), bấm nút **bút chì (Sửa giá)** ở dòng cần đổi, điền lãi / vận chuyển / CTV rồi **Lưu giá** (chỉ các dòng đã bấm Sửa giá được lưu). Bảng gồm: Sản phẩm (tên, SKU dòng phụ) · Giá mua (VND) / Lô nguồn · Lãi (VND) · Vận chuyển (MMK) · CTV (MMK) · Giá bán (MMK) · Thao tác. Chưa đủ dữ liệu thì Giá bán hiện "—" kèm lý do (thiếu tỷ giá / giá mua / lãi, vận chuyển, CTV); số nhập sai báo ngay dưới ô. Công thức và lưu ý về lãi nằm ở mục mở rộng **Cách tính và lưu ý** (cột trung gian "Giá mua + lãi (MMK)" đã bỏ, phép tính không đổi). Kho hàng mua MMK không còn ô **Lãi cố định**. Mô tả "tick SKU → Nhập thủ công" bên dưới là cách cũ, vẫn dùng được qua trang `/admin/selling-prices/manual`.

**Sản phẩm › Giá bán**, thẻ **Danh sách · Thủ công**. Mỗi SKU hiện:
- giá **đang bán**, giá **chờ duyệt** (nếu có), **CTV: …** (hoa hồng đang áp dụng; chưa đặt = không có hoa hồng) và hoa hồng chờ duyệt;
- **nguồn giá** (bảng tính / Excel / sửa tay + ngày), **giá mua gần nhất** (lần nhập đã ghi sổ, hàng bán được, đúng kho bán);
- nhãn **Đầu vào mới — nên tính lại**.

Thẻ lọc: **Chưa có giá** (phân loại đang dùng), **Giá chờ duyệt**, **Giá cũ hơn phiếu nhập**. Nút **Đặt giá** ở từng dòng mở trang thủ công cho SKU đó; tick nhiều dòng rồi bấm **Nhập thủ công** hoặc **Tính tự động** ở thanh phía trên bảng.

### 7.3. Thủ công — kho hàng nhập VN (công thức VND)

**Mục đích:** đặt giá theo lãi mong muốn bằng tiền VND trên giá mua của nhà cung cấp.

**Cần chuẩn bị:** phiếu nhập **đã ghi sổ** cho SKU (để có giá mua NCC); tỷ giá.

**Công thức** (máy chủ tự tính lại khi lưu, không nhận giá từ trình duyệt):

```
Giá bán VND = Giá mua NCC (VND) + Lãi mong muốn (VND)
Giá bán MMK = Giá bán VND ÷ tỷ giá (VND cho 1 MMK) + Vận chuyển (MMK/sp) + CTV (MMK/sp)
→ làm tròn LÊN theo "Làm tròn giá lên bội số (MMK)" ở Cấu hình cửa hàng
```

**Ví dụ (đã kiểm bằng test):** giá mua 100.000 + lãi 50.000 VND = 150.000 VND; tỷ giá 1 MMK = 6 VND → 25.000 MMK; + vận chuyển 800 + CTV 2.000 → **27.800 MMK**.

**Các bước**
1. Tick SKU ở trang Giá bán → **Nhập thủ công** (hoặc **Đặt giá** ở bước 3 của sản phẩm).
2. Chọn **Tỷ giá** (hiện "1 MMK = … VND · từ ngày…", mặc định tỷ giá **đang dùng**; chọn tỷ giá cũ sẽ hiện cảnh báo).
3. Mỗi dòng:
   - **Lô nguồn** (cùng ô với giá mua): chọn lần nhập ("Lô … · phiếu … · ngày … · giá … VND"). Lô nhập nhiều lần với giá khác nhau hiện **từng lần nhập riêng** — giá mua lấy đúng lần đã chọn, **không bình quân**. Combo dùng tổng giá mua gần nhất của thành phần.
   - **Giá mua NCC (VND)**: tự hiện theo lô đã chọn (là giá mua, **không phải** tổng giá vốn về kho).
   - Điền **Lãi mong muốn (VND/sp)**, **Vận chuyển (MMK/sp)**, **CTV (MMK/sp)** (gợi ý lấy từ lần thủ công trước / cước tính giá gần nhất).
   - **Giá bán VND** và **Giá bán cuối (MMK)** tự tính; giá cuối **không sửa tay**. Muốn đổi giá thì đổi lãi / vận chuyển / CTV.
4. Tuỳ chọn **Gửi duyệt ngay** / **Duyệt luôn**, rồi bấm **Lưu giá**.

**Lưu ý**
- **CTV** nhập ở đây là **hoa hồng CTV của SKU** cho đơn có CTV — nguồn duy nhất của hoa hồng bán hàng (18/11/2026); trống = không có hoa hồng.
- **Lãi mong muốn chưa phải lợi nhuận cuối**: chưa trừ chi phí về kho / chuyến hàng, phí COD, hàng trả, chi phí vận hành.
- Dòng chưa có phiếu nhập đã ghi sổ hiện "Chưa có phiếu nhập đã ghi sổ" và không lưu được.

Lỗi: "Giá / hoa hồng của … vừa được đổi ở nơi khác — tải lại trang"; "… không thuộc kho …"; "Giá và hoa hồng không đổi so với hiện tại"; "Chế độ thủ công theo VND chỉ dùng cho kho hàng nhập Việt Nam".

### 7.4. Thủ công — kho hàng mua MMK

Giữ cách cũ, không dùng công thức VND: mỗi sản phẩm một khung, điền **Giá bán (MMK)**, **CTV (MMK/sp)** (trống = không có hoa hồng), **Lãi cố định (MMK/đv)** (dùng cho Tính tự động), **Lý do sửa giá** (bắt buộc khi giá đổi) → **Lưu giá**. Lỗi: "Nhập lý do sửa giá", "Giá bán phải lớn hơn 0", "Hoa hồng CTV của … lớn hơn giá bán".

### 7.5. Tự động (bảng tính giá)

**Công thức**

| Kho | Giá bán = |
|---|---|
| **Hàng nhập VN (VND)** | giá mua VND của **lần nhập cơ sở** × tỷ giá × (1 + % lãi) + cước (MMK/kg) × khối lượng, **làm tròn lên** |
| **Hàng mua MMK** | giá mua MMK của lần nhập cơ sở + **lãi cố định** của sản phẩm, làm tròn lên |
| Combo | tổng giá mua thành phần; khối lượng = của combo hoặc tổng thành phần |

"Lần nhập cơ sở" mặc định là lần nhập **đã ghi sổ gần nhất**, chỉ tính **hàng bán được** vào **đúng kho bán** của sản phẩm (hoặc kho chưa bán như kho VN); dòng **Tester/quà**, khu chờ kiểm tra và kho bán khác bị loại. % lãi chỉ tính trên tiền hàng. Chi phí chuyến hàng chỉ ảnh hưởng **giá vốn**, không ảnh hưởng giá bán.

**Các bước**
1. Tick SKU → **Tính tự động** (hoặc thẻ **Tự động**; lối tắt **Tính tự động** ở bước 3 sản phẩm, **Tính giá SKU vừa nhập** ở phiếu nhập).
2. Chọn **Kho**, **Tỷ giá**, **% lãi**, **Phí ship VN → MM (MMK/kg)**, **Làm tròn lên (MMK)** → **Xem trước**.
3. Trang bản tính hiện giá **đang bán**, **đang chờ duyệt**, **đề xuất**, nguồn giá mua và cảnh báo (đổi ≥ 20%, lãi thấp). Muốn dùng lô khác: chọn **Lô cơ sở** ở từng dòng → **Tính lại với lô đã chọn** (tạo bản mới).
4. Tick dòng, tuỳ chọn **Gửi duyệt ngay** / **Duyệt luôn** → **Áp dụng giá đã chọn**.

Dòng bị bỏ qua khi xem trước: "Thiếu giá mua đã ghi sổ", "Thiếu khối lượng", "Thiếu lãi cố định", "Giá tính ra bằng 0". Khi áp: "Giá / hoa hồng đã bị sửa sau khi xem trước", "Đầu vào đã đổi … — tạo bản mới", "Hoa hồng CTV lớn hơn giá mới — sửa hoa hồng ở trang Giá bán". Bản xem trước hết hạn sau **3 ngày** (Cấu hình cửa hàng).

### 7.6. Lãi cố định và hoa hồng CTV theo sản phẩm

- **Lãi cố định (MMK/đơn vị):** chỉ kho **Hàng mua MMK**, đặt ở trang Giá bán (khung thủ công MMK); áp dụng ngay (không cần duyệt).
- **Hoa hồng CTV (MMK/cái):** đặt ở trang Giá bán (thủ công) hoặc Excel. Với sản phẩm đã duyệt, hoa hồng chờ duyệt **cùng giá** và có hiệu lực cùng lúc ([12.3](#123-cách-tính-hoa-hồng)). Hoa hồng được chép vào dòng đơn lúc tạo đơn — đổi sau không ảnh hưởng đơn cũ.

---

## 8. Kho hàng

### 8.1. Tồn kho

**Kho hàng › Tồn kho** cho thấy tồn theo sản phẩm và vị trí, và các nút tạo phiếu (**Tạo phiếu**: Nhập kho, Chuyển kho, Xuất kho, Điều chỉnh). Tồn **"Còn bán"** = tồn thực tế trừ hàng đang giữ cho đơn, trừ lô hết hạn/ngừng bán/chưa biết hạn.

### 8.2. Phiếu nhập kho

**Mục đích:** ghi hàng mới về. **Ai làm được:** Quản trị viên, Quản lý kho.

**Cần chuẩn bị:** sản phẩm đã tạo; số lượng, số lô, hạn dùng, giá mua theo từng dòng; (kho nhập VN) tỷ giá đã có.

**Các bước** (hai bước trên màn hình)
1. **Kho hàng › Phiếu kho** hoặc **Tồn kho › Tạo phiếu › Nhập kho** (hoặc **Nhập hàng** ở bước 2 của sản phẩm).
2. **Bước 1 — Chọn sản phẩm nhập kho:** chọn **Chọn vị trí nhận**, tick các SKU, bấm **Tiếp tục nhập thông số**. Mỗi phiếu nhập vào **một kho bán**; sản phẩm thuộc kho khác sẽ báo "sản phẩm thuộc A, không nhập vào B".
3. **Bước 2 — Nhập thông số nhập kho:**
   - **Chuyến hàng** (nếu hàng thuộc một chuyến VN → MM), **Lý do / ghi chú**.
   - **Giá trị chung** để điền nhanh: **Số lô chung**, **Hạn dùng chung**, **Ngày SX chung**, **Loại tồn chung**; **Cước tạm tính VN → MM (MMK/kg)**.
   - Mỗi dòng: **Số lượng**, **Số lô**, **Hạn dùng** (hoặc **Chưa biết hạn · Chưa được bán**), **Ngày SX**, **Giá mua/đv (VND)** hoặc **(MMK)** tuỳ kho, **Phí về kho (VND/đv)** (chỉ hàng VND, tuỳ chọn: **0** = không phát sinh → giá vốn thực tế; **trống** = chưa biết → dùng giá vốn tạm theo cước tạm tính, không có thì thiếu giá vốn), **Loại tồn** (bán được / Tester/quà), **Khối lượng (g)** (chỉ điền cho biến thể đang trống khối lượng), **+ Lô** để thêm lô thứ hai.
   - Có thể **Dán từ Excel** với các cột: SKU · Số lượng · Số lô · Hạn dùng · Giá mua (VND) · [Ngày SX] · [SELLABLE/TESTER].
4. Bấm **Lưu nháp** → phiếu ở trạng thái **Nháp**. Phiếu nháp còn **Sửa phiếu** được — trang sửa điền lại **giá mua và phí về kho của chính dòng** (không lấy bình quân của lô); lưu lại mà không đổi giá mua thì giữ tỷ giá đã chốt (vd từ Excel).
5. Kiểm tra lại trên trang phiếu — **một bảng**: Sản phẩm (tên, SKU dòng phụ) · Số lô · Hạn dùng (ngày / **Chưa biết** = lô chưa ghi hạn / **Không áp dụng** = hàng không có hạn) · Số lượng nhập · Giá mua/đv · **Tồn hiện tại → Dự kiến** (theo SKU × loại tồn tại kho nhập, cộng mọi lô; nhiều lô cùng SKU nằm chung một dòng). Kho nhập và loại tồn (nếu mọi dòng giống nhau) ghi ở đầu phiếu; phiếu có cả hàng bán và tester thì mỗi dòng có nhãn loại tồn. Phiếu đã ghi sổ không hiện cột dự kiến. Rồi bấm **Ghi sổ** (hỏi "Ghi sổ phiếu {code}? Tồn kho sẽ thay đổi và không hoàn tác được.").

**Kết quả:** 📦⛔ tồn tăng; phiếu thành **Đã ghi sổ**. Giá mua và tỷ giá được chốt vào lô 💰: các lần tính giá sau dùng giá của phiếu nhập đã ghi sổ gần nhất. Nếu có đơn đặt trước đang chờ, phiếu cảnh báo "Có {count} đơn đặt trước đang chờ hàng trong phiếu này." kèm link **Mở danh sách đơn đặt trước**.

**Muốn bỏ phiếu nháp:** **Huỷ phiếu** (chỉ phiếu nháp) → phiếu thành **Đã huỷ**, được giữ để tham khảo, các lô chỉ có trong phiếu nháp bị bỏ.

**Lỗi thường gặp**
| Thông báo | Cách xử lý |
|---|---|
| "{count} dòng thiếu số lô, hạn dùng hoặc giá mua (tô đỏ)" | Điền các dòng tô đỏ |
| "{kho} nhập giá mua bằng VND" (hoặc MMK) | Dùng đúng loại tiền của kho |
| "Cần nhập hạn sử dụng hoặc chọn Chưa biết hạn" | Điền hạn hoặc chọn "Chưa biết hạn" |
| "Lô X đã có với hạn dùng khác" | Dùng số lô khác, hoặc đúng hạn của lô cũ |
| "Lô X đã có giá mua bằng loại tiền khác (VND / MMK)" | Không trộn tiền trong cùng lô |
| "Lô X có chuyến hàng khác…" | Chọn đúng chuyến hoặc đổi số lô |
| "Lô giá MMK không gắn chuyến hàng VN → MM" | Bỏ chọn chuyến (chuyến chỉ cho hàng VND) |
| "Phiếu không ở trạng thái nháp" | Phiếu đã xử lý rồi |

Nhập thêm vào lô đã có: xem [4.7](#47-nhập-thêm-vào-lô-đã-có-nhưng-khác-giá).

### 8.3. Chuyển kho, xuất kho và điều chỉnh

Tạo từ **Tồn kho › Tạo phiếu**. Mỗi loại có quyền riêng (Quản trị viên và Quản lý kho có cả bốn).

| Loại | Dùng khi | Ghi chú |
|---|---|---|
| **Chuyển kho** | Chuyển hàng giữa kho/vị trí, ví dụ sau khi **đổi kho** sản phẩm | Vị trí đi và đến phải khác nhau. Cột **Lô** để "Tự chọn theo FEFO" hoặc chọn lô |
| **Xuất kho** | Xuất ngoài đơn hàng (hỏng, tặng…) | Bắt buộc **lý do** |
| **Điều chỉnh** | **Sửa sai tồn** (kiểm kê lệch, nhập nhầm đã ghi sổ) | Bắt buộc chọn **lô** cụ thể (chỉ lô **đã có sổ kho** — lô chỉ thuộc phiếu nhập nháp thì ghi sổ phiếu nhập trước), nhập **SL (+ thêm / − bớt)** và lý do |

Tất cả: **Lưu nháp** → **Ghi sổ** ⛔📦.

- **Phiếu nháp sai:** phiếu **Nhập** có nút **Sửa phiếu**. Phiếu **Xuất / Chuyển / Điều chỉnh** bấm **Huỷ và tạo lại**: form tạo phiếu mở sẵn các dòng của phiếu nháp; khi lưu, phiếu mới được tạo và phiếu nháp cũ bị huỷ cùng lúc (lỗi thì phiếu cũ giữ nguyên).
- **Phiếu đã ghi sổ** không sửa, không xoá. Sai **số lượng**: tạo phiếu **Điều chỉnh** (hoặc phiếu chuyển/xuất ngược lại). Phiếu điều chỉnh **chỉ đổi tồn** — giá mua, tỷ giá, phí về kho và số lượng dùng để tính giá vốn lô / phân bổ chuyến **không đổi**. Sai giá, tỷ giá hoặc phí về kho trên phiếu nhập đã ghi sổ: báo quản trị; hiện chưa có chức năng sửa/đảo phiếu nhập đã ghi sổ (cần thiết kế riêng).
- Danh sách chọn: ô **đi** gồm cả kho đã ngừng dùng (dọn tồn cũ, có nhãn); ô **đến** và vị trí điều chỉnh chỉ kho đang dùng. Biến thể đã tắt / sản phẩm ngừng kinh doanh **còn tồn** vẫn chọn được (có nhãn) để xử lý nốt; việc này không mở lại quyền bán.

Lỗi hay gặp khi ghi sổ: "Tồn không đủ…"; "Không đủ hàng: cần x, khả dụng y"; "Không thể lấy hàng đang giữ cho đơn — SKU: chỉ xuất được n, còn lại đang giữ cho đơn …" (hàng bạn định xuất đang được giữ cho đơn khác); "Lô X hết hạn hoặc chưa biết hạn — không chuyển vào kho bán …".

Danh sách mọi phiếu: **Kho hàng › Phiếu kho** (phiếu **Hàng trả** do chức năng trả hàng của đơn tạo ra).

### 8.4. Lô và hạn sử dụng

Mở một lô từ danh sách tồn hoặc phiếu: trang "Lô {số lô}" có tình trạng giá vốn (**Thực tế** / **Tạm tính** / **Thiếu giá vốn**) và bảng **Lịch sử sổ kho**.

- Lô "Chưa biết hạn": bấm **Xác nhận hạn sử dụng** sau khi xem hạn thật trên bao bì → lô mới bán được.
- Lô VND chưa có giá vốn thực tế: **Tính giá vốn tạm** để có giá vốn ước tính.
- Ngưỡng ngừng bán (mặc định 90 ngày) và ngưỡng cảnh báo (mặc định 180 ngày) đổi ở **Cấu hình cửa hàng** ([15.1](#151-cấu-hình-cửa-hàng)).

### 8.5. Chờ kiểm tra (hàng khách trả)

Khi ghi nhận trả hàng ([10.6](#106-bàn-giao-giao-thành-công-huỷ-và-trả-hàng)), hàng vào khu **Chờ kiểm tra** (huy hiệu cạnh menu). **Kho hàng › Chờ kiểm tra:**
- **Nhập lại kho bán** 📦: hàng đạt → quay về kho bán, bán lại được ngay (chuyển kho ghi sổ tức thì ⛔).
- **Huỷ hàng** 📦: hàng không dùng được → nhập **Lý do huỷ**, xác nhận "Huỷ số hàng này (trừ khỏi kho)?" ⛔.

### 8.6. Chuyến hàng VN → MM và giá vốn

**Mục đích:** gom hàng VND về cùng một chuyến, cộng chi phí vận chuyển/thuế/phí rồi **phân bổ vào giá vốn từng lô**. **Ai làm được:** Quản trị viên, Quản lý kho.

1. **Kho hàng › Chuyến hàng › Tạo chuyến hàng**: điền **Mã chuyến**, **Cách phân bổ** (**Theo giá trị mua** — mặc định, **Theo số lượng**, **Theo khối lượng (kg)**), **Ngày đi**, **Ghi chú** → **Tạo**.
2. Gắn lô vào chuyến: chọn **Chuyến hàng** ngay ở phiếu nhập, hoặc sau đó dùng **Gắn lô vào chuyến** ở trang chuyến (chỉ lô VND chưa thuộc chuyến nào).
3. Ở trang chuyến: **Thêm chi phí** loại **Vận chuyển** / **Thuế** / **Phí**, nhập **Số tiền (VND)**; khi hàng tới bấm **Đánh dấu đã đến**.
4. Bấm **Phân bổ giá vốn** 💰: chi phí được chia cho **số lượng đã nhập (đã ghi sổ)** của các lô (kể cả tester) và cập nhật giá vốn về kho (VND và MMK).

Trạng thái phân bổ: "Chưa có lần phân bổ được lưu" → "Đã phân bổ — đầu vào còn khớp" → **"Cần phân bổ lại — đầu vào đã thay đổi"** (chi phí, số lượng, khối lượng hay tỷ giá đã đổi; hệ thống **không tự phân bổ lại**, bạn bấm lại).

Lưu ý: phân bổ **không** đổi giá bán và **không** sửa giá vốn của các đơn đã xuất (đơn giữ giá vốn lúc xuất).

Lỗi: "Chuyến hàng chưa có lô nào đã nhập kho"; "Thiếu khối lượng SKU: …" (cách theo khối lượng); "Chỉ gắn lô VND chưa thuộc chuyến hàng"; "Lô có phiếu nhập thuộc chuyến khác".

### 8.7. Quản lý kho

**Cài đặt › Quản lý kho** (Quản trị viên).

- **Thêm kho:** chọn **Loại** (**Kho bán** hoặc **Khu chờ kiểm tra**), **Mã kho** (2–20 ký tự: chữ, số, dấu `-`), **Tên kho**, **Cách tính giá** (**Hàng nhập VN (VND)** hoặc **Hàng mua MMK**) → **Thêm kho**.
- **Đổi tên:** sửa → **Lưu**.
- **Ngừng dùng / Dùng lại:** kho ngừng dùng biến mất khỏi mọi ô chọn.
- ⛔ **Không xoá được kho** (vì đã có sổ kho). **Cách tính giá không đổi được** khi kho đã có sản phẩm hoặc phát sinh tồn — muốn đổi, tạo kho mới.

Lỗi: "Mã kho X đã có"; "Kho X còn tồn — chuyển hoặc xuất hết hàng…" (khi ngừng dùng); "Còn n sản phẩm thuộc kho X…"; "Phải còn ít nhất một kho bán" / "…một khu chờ kiểm tra hàng trả".

### 8.8. Cảnh báo kho

**Kho hàng › Cảnh báo** (mọi vai trò xem được): ba thẻ **Tồn thấp**, **Hạn dùng** (mức **Hết hạn** / **Ngừng bán** / **Cận date** / **Chưa biết hạn**), **Gợi ý đặt hàng**. Gợi ý đặt hàng dựa vào tốc độ bán và hai ô ở Cấu hình cửa hàng: **Số ngày bán cần đủ hàng sau khi về** (mặc định 30) và **Tính tốc độ bán trong (ngày gần nhất)** (mặc định 60). Công thức: **nên đặt = bán/ngày × (thời gian về + số ngày cần đủ) + tồn an toàn − còn bán được**. Từ khi có hai kho bán, hàng nhập đi thẳng vào kho bán của sản phẩm (kể cả hàng của chuyến chưa bấm "Đánh dấu đã đến") nên đã nằm trong **còn bán được** — không cộng thêm "hàng đang về". Cột **Tồn ở vị trí khác (chưa tính)** là hàng còn ở kho cũ hoặc kho bán khác: chỉ để xem, chưa bán được cho tới khi chuyển về kho bán. Báo cáo › **Chuyến chưa đánh dấu đã đến** chỉ để theo dõi chuyến.

Ngưỡng "tồn thấp" là **5** cho mọi sản phẩm — hiện **không có ô để sửa** trên giao diện. Danh sách cảnh báo được tính lại tự động mỗi đêm (23:30) **[CHƯA XÁC MINH — phụ thuộc lịch chạy tự động trên server]**.

---

## 9. Duyệt và đăng bán

**Mục đích:** kiểm tra nội dung/giá lần cuối rồi mới cho khách thấy. **Ai làm được:** Quản trị viên.

### 9.1. Gửi duyệt

Điều kiện: không còn **lỗi** ở [5.2](#52-trang-sản-phẩm-5-bước-và-các-lưu-ý). **Duyệt luôn** (khi nhập Excel / áp giá) chỉ duyệt sản phẩm mà lượt đó là thay đổi duy nhất; sản phẩm có thay đổi khác từ trước được liệt kê để mở xem đầy đủ rồi duyệt. Cách làm: **Gửi duyệt** ở bước 4 / **Lưu & Gửi duyệt** ở form / **Gửi duyệt** ở thao tác hàng loạt trong danh sách / tuỳ chọn **Gửi duyệt ngay** khi nhập Excel hay áp dụng bảng giá. Sản phẩm đã duyệt mà không có thay đổi nào: "Không có thay đổi nào để gửi duyệt".

### 9.2. Duyệt hoặc từ chối một sản phẩm

Ở bước 4 của trang sản phẩm:
- Sản phẩm mới: **Duyệt & Đăng** (cần cả quyền đăng bán — đăng luôn 👁) hoặc **Chỉ duyệt (chưa đăng)**.
- Sản phẩm có thay đổi chờ duyệt: **Duyệt thay đổi** (giữ nguyên trạng thái hiện/ẩn).
- Hộp xác nhận: "Duyệt đúng nội dung đang xem? Khách sẽ thấy bản này."
- **Từ chối:** điền **Lý do từ chối** (ít nhất 5 ký tự — "Lý do từ chối cần ít nhất 5 ký tự") → trang hiện "Bị từ chối: {lý do}". Sửa rồi **Gửi duyệt** lại.

Nếu nội dung đã đổi sau khi bạn mở trang: "Nội dung vừa thay đổi — tải lại và xem lại trước khi duyệt".

### 9.3. Duyệt hàng loạt

**Đăng bán › Chờ duyệt** (hoặc tab **Chờ duyệt** ở danh sách): tick các sản phẩm → **Duyệt & Đăng**, **Duyệt**, hoặc điền lý do + **Từ chối**. Hộp hỏi "Duyệt {count} SP đã chọn theo đúng nội dung đang hiển thị trên danh sách?". Sản phẩm không xử lý được liệt kê dưới "{count} SP chưa xử lý được:".

### 9.4. Sửa sản phẩm đã duyệt

Với sản phẩm đã duyệt, các trường sau **cần duyệt lại**: tên, mô tả, danh mục, thương hiệu, biến thể (SKU/tên/bật-tắt), thành phần combo, **thêm/xoá ảnh**, **giá bán** và **hoa hồng CTV cố định** (có hiệu lực cùng giá khi duyệt). Lưu các trường này tạo **bản đang sửa**; 👁 **khách vẫn thấy bản đã duyệt** cho đến khi bản mới được duyệt. Nhãn: **Có thay đổi (nháp)** → **Thay đổi chờ duyệt** → **Thay đổi bị từ chối**.

Các trường **áp dụng ngay, không cần duyệt:** khối lượng, lãi cố định, kho, hạn dùng/PAO, bảo quản, cách dùng, thành phần, tag, slug (nếu chưa khoá), thứ tự và mô tả ảnh, thiết lập đặt trước.

Nút: **Gửi duyệt** → người duyệt bấm **Duyệt thay đổi**. **Huỷ thay đổi** bỏ bản đang sửa ("Huỷ mọi thay đổi đang chờ và quay về bản đang bán?").

### 9.5. Bật/ẩn hiển thị

Bước 5: **Bật hiển thị trên web** (chỉ hiện khi các bước trước xong; "Hoàn thành các bước trước để đăng bán.") / **Ẩn khỏi web**. 👁 Tác dụng tức thì với khách.

### 9.6. Điều gì tự thay đổi trạng thái duyệt

- Sản phẩm **chưa từng duyệt** đang **Chờ duyệt** mà bị sửa trường quan trọng → quay về **Nháp**, rời hàng chờ.
- Sản phẩm **đã duyệt** không bao giờ mất trạng thái duyệt; sửa chỉ tạo bản đang sửa.
- Sản phẩm **bị từ chối** vẫn bị từ chối đến khi gửi duyệt lại.
- **Không có gì tự ẩn sản phẩm.** Sản phẩm không có **lịch hiển thị** theo ngày (chỉ banner và bộ sưu tập có).
- Đổi tồn kho, khối lượng, hoa hồng, đặt trước **không** kích hoạt duyệt lại.
- Khi bật hiển thị hàng loạt mà có sản phẩm còn lỗi, hệ thống báo "{count} sản phẩm chưa bật được vì còn lỗi:" kèm lý do từng sản phẩm.

---

## 10. Đơn hàng

### 10.1. Trạng thái đơn

| Trạng thái | Nghĩa | Hàng |
|---|---|---|
| **Chờ hàng về** (kèm nhãn **Đặt trước**) | Khách đặt khi hết hàng | Không giữ hàng |
| **Chờ xác nhận** | Mới tạo, chờ gọi khách (COD) hoặc chờ nhận tiền (chuyển khoản) | **Giữ** đến hết hạn giữ hàng |
| **Chuẩn bị giao** | Đã xác nhận/đã nhận tiền, đang soạn | **Giữ không thời hạn** |
| **Đang giao** | Đã bàn giao cho hãng | Đã **xuất kho** |
| **Hoàn tất** | Khách đã nhận | — |
| **Đã huỷ** | Huỷ tay hoặc tự huỷ | Nhả hàng đã giữ |
| **Trả hàng** | Trả toàn bộ | Hàng về **Chờ kiểm tra** |

(Đơn cũ ở trạng thái "xác nhận thanh toán / xác nhận COD / đang đóng gói" đều hiển thị là **Chuẩn bị giao**.)

Tình trạng thanh toán: **Chưa trả**, **Chờ xác nhận thanh toán**, **Đã thanh toán**, **Đã hoàn tiền**.

Trang danh sách **Đơn hàng › Danh sách đơn** có bộ lọc (kể cả **Chỉ đơn quá hạn**). Mở một đơn để xem chi tiết, các nút trong khối **Thao tác**, các khối **Vận chuyển**, **Phiếu kho** (link tới phiếu xuất/trả) và **Lịch sử** (ai làm gì, lúc nào; đơn khách tự đặt ghi "Khách tự đặt", việc hệ thống tự làm ghi "Hệ thống").

### 10.2. Tạo đơn thủ công

**Mục đích:** nhập đơn khách đặt qua Facebook, Viber, điện thoại. **Ai làm được:** Quản trị viên, Nhân viên đơn hàng.

**Cần chuẩn bị:** số điện thoại, tên, địa chỉ khách; sản phẩm và số lượng; phương thức thanh toán.

**Các bước**
1. **Đơn hàng › Danh sách đơn › Tạo đơn**.
2. (Tuỳ chọn) gõ SĐT ở **Tìm khách theo SĐT** → **Tìm**: hiện "Khách cũ: {tên} · {n} đơn" hoặc "Khách mới".
3. Điền: **Kênh đặt** (Facebook, Viber, Điện thoại, Website), **Phương thức thanh toán** (COD hoặc Chuyển khoản), **CTV (không bắt buộc)**, **Người trả cước giao khách**, **Tên người nhận**, **SĐT**, **SĐT phụ (không bắt buộc)**, địa chỉ chọn lần lượt **Vùng / Bang** → **Huyện** → **Thị trấn**, **Địa chỉ**, **Ghi chú**.
4. Thêm sản phẩm: chọn **SKU / Phân loại** (hiện giá và **Còn bán được**), nhập **SL**, bấm **+ Thêm sản phẩm** nếu có nhiều dòng.
5. Xem **Ước tính (server tính lại khi lưu)** rồi bấm **Tạo đơn**.

**Kết quả**
- Đơn ở **Chờ xác nhận**; 📦 hàng được **giữ** trong thời gian giữ hàng ([10.3](#103-giữ-hàng-và-tự-huỷ-quá-hạn)).
- 💰 Giá luôn là **giá bán hiện tại** của sản phẩm. **Phí ship = 0** (hãng thu khi giao).
- Khách được tạo/cập nhật theo số điện thoại.
- Tạo đơn tay **không bị chặn** khi ô **Nhận đơn trên web** đang tắt.

**Lỗi thường gặp**
| Thông báo | Cách xử lý |
|---|---|
| "Số điện thoại không hợp lệ" | Nhập số Myanmar đúng định dạng |
| "Khu vực giao hàng không hợp lệ hoặc chưa có bảng phí" | Chọn lại Vùng/Huyện/Thị trấn (chỉ thị trấn đang giao mới chọn được — [15.2](#152-địa-bàn-giao-hàng-vtp)) |
| "Có sản phẩm đã ngừng bán" | Bỏ dòng đó |
| "Có sản phẩm chưa có giá bán (giá ≤ 0): SKU" | Đặt giá trước ([7.2](#72-trang-giá-bán-danh-sách)) |
| "Không đủ hàng (còn/cần): SKU (còn/cần)" | Giảm số lượng hoặc nhập thêm hàng. **Nhân viên không tạo được đơn đặt trước** |
| "CTV không tồn tại hoặc đã bị khoá" | Chọn CTV khác hoặc bỏ trống |

### 10.3. Giữ hàng và tự huỷ quá hạn

- Đơn **Chờ xác nhận** giữ hàng theo **Giữ hàng chờ chuyển khoản (giờ)** (đơn chuyển khoản) và **Tự huỷ COD chưa xác nhận sau (giờ)** (đơn COD), mặc định **24 giờ** mỗi loại (1–168), đổi ở [15.1](#151-cấu-hình-cửa-hàng).
- Hết hạn mà chưa xác nhận → hệ thống **tự huỷ** đơn (lý do "Quá hạn gọi xác nhận COD" hoặc "Quá hạn chuyển khoản", người thực hiện "Hệ thống"). Việc này do tác vụ chạy định kỳ mỗi 15 phút **[CHƯA XÁC MINH — phụ thuộc lịch chạy tự động trên server]**.
- Trang đơn hiện **Giữ hàng đến** với giờ cụ thể hoặc **Không thời hạn**; đơn trễ có nhãn **Quá hạn** và lọc được bằng **Chỉ đơn quá hạn**.
- Nếu bạn xác nhận khi đã quá hạn nhưng đơn chưa bị tự huỷ, hệ thống **kiểm lại tồn**; hết hàng thì báo "Không đủ hàng".

### 10.4. Xác nhận đơn và ghi nhận tiền

Ở trang đơn, khối **Thao tác**. **Ai làm được:** Quản trị viên, Nhân viên đơn hàng.

| Nút | Dùng khi | Hệ quả |
|---|---|---|
| **Xác nhận đơn** | Đơn **COD** đã gọi khách xác nhận sản phẩm, số lượng, địa chỉ | Sang **Chuẩn bị giao**; 📦 giữ hàng **không thời hạn** |
| **Đã nhận tiền** | Đơn **chuyển khoản** — chỉ khi đã kiểm tài khoản ngân hàng và **đúng số tiền** | Sang **Chuẩn bị giao**; 💰 thanh toán thành **Đã thanh toán** |

Khách **không còn tải được ảnh biên lai**; chuyển khoản chỉ được xác nhận bằng nút **Đã nhận tiền**.

### 10.5. In nhãn, phiếu lấy hàng và xuất file VTP

**Phiếu lấy hàng (soạn hàng)**
1. Ở danh sách đơn tick các đơn cần soạn → **In phiếu lấy hàng**.
2. Phiếu gom theo kho → SKU → lô gợi ý (**Lô / HSD**), có phần **Đóng gói theo đơn**.
3. Bấm **Chốt lô & In** để **khoá lô** cho các đơn đã xác nhận rồi in → "Đã chốt lô cho {count} đơn". Trạng thái từng đơn: "Đã có lô đề xuất", "Chưa xác nhận — không chốt lô", "Thiếu hàng — không chốt được".
4. Phiếu đã chốt **không giữ thêm hàng**, nhưng khi bàn giao hệ thống xuất **đúng các lô đã chốt**; nếu không còn khớp: "Phiếu soạn không còn khớp (lô không đủ / hết hạn bán hoặc đơn đã đổi) — in lại phiếu soạn".
5. Nếu ô **Bắt buộc in phiếu soạn (chốt lô) trước khi bàn giao** đang bật mà chưa chốt: "Cần in phiếu soạn (Chốt lô & In) trước khi bàn giao".

Lỗi khác: "Tồn kho vừa thay đổi — tải lại phiếu rồi in lại"; "Không có đơn nào chốt lô được".

**In nhãn ship:** tick đơn → **In nhãn** (mỗi nhãn một trang, khổ A6), hoặc **In nhãn ship** ở trang đơn. Nhãn ghi **Thu hộ (COD)** + số tiền (hoặc "Đã thanh toán — không thu tiền"), **Số món**, **Mã vận đơn**, và "Cửa hàng trả cước" hoặc "Phí ship do đơn vị vận chuyển thu khi giao". Chỉ in được từ trạng thái **Chuẩn bị giao** trở đi.

**Xuất file Excel cho VTP Myanmar:** **Xuất Excel VTP** (ở danh sách/trang đơn; Quản trị viên, Nhân viên đơn hàng).
1. Chỉ đơn **Chuẩn bị giao**, tối đa 200 đơn.
2. Chọn **Dịch vụ VTP**, **Người trả cước** (**Theo từng đơn đã lưu** / **Người nhận trả cước** / **Người gửi trả cước**), **Thời gian hẹn lấy**.
3. Từng đơn: kiểm **Khối lượng (g)** (cảnh báo "SKU chưa có khối lượng"), địa chỉ VTP (nếu "Địa chỉ chưa khớp mẫu VTP; vui lòng đối chiếu và chọn lại:"), **Ghi chú** (≤ 150 ký tự).
4. Số tiền COD trong file = tổng đơn nếu là COD chưa thanh toán, ngược lại 0.
5. **Tải Excel VTP ({count} đơn)**.

Xuất file **không** chuyển đơn sang **Đang giao** và **không** trừ kho. Với từng đơn lẻ, khối **Thông tin tạo đơn lẻ VTP** có **Sao chép**, **Sao chép toàn bộ**, **Tải thông tin đơn (.txt)**.

### 10.6. Bàn giao, giao thành công, huỷ và trả hàng

**Bàn giao vận chuyển** — nút **Đã bàn giao vận chuyển** (từ **Chuẩn bị giao**)
- Cần **Đơn vị vận chuyển**; **Mã vận đơn** không bắt buộc (sửa sau bằng **Lưu vận đơn**).
- ⛔📦 **Xuất kho thật**: lấy lô theo FEFO (hoặc đúng lô đã chốt trên phiếu lấy hàng), bỏ qua lô dưới ngưỡng ngừng bán, trừ từng thành phần của combo, mỗi kho một phiếu **Xuất kho**, ghi giá vốn từng lô cho báo cáo lợi nhuận. Không hoàn tác được; nếu khách trả hàng, dùng chức năng **Trả hàng**.
- **Lô chưa có giá vốn** (cả thực tế lẫn tạm tính) → **không bàn giao được** (16/11): "Không bàn giao được: lô sắp xuất chưa có giá vốn … SKU · lô". Vào trang lô bấm **Tính giá vốn tạm**, hoặc phân bổ chi phí chuyến hàng, rồi bàn giao lại. Phiếu lấy hàng ghi sẵn "Thiếu giá vốn — chưa bàn giao được" cạnh lô đó.
- **Lô dùng giá vốn tạm** → vẫn bàn giao, hiện lưu ý "… lô xuất đang dùng giá vốn tạm — lợi nhuận của đơn là tạm tính" (bàn giao hàng loạt: "… đơn xuất lô đang dùng giá vốn tạm").

**Giao thành công** — nút **Giao thành công** (đơn COD: **Giao thành công · Đã thu tiền**), từ **Đang giao**
- Chỉ bấm khi khách đã nhận hàng và (COD) hãng đã thu tiền: "Chỉ hoàn tất khi khách đã nhận hàng và tiền COD đã được thu."
- 💰 Đơn COD: thanh toán thành **Đã thanh toán** và đơn xuất hiện ở **Đối soát COD** ([mục 11](#11-đối-soát-tiền-cod)). Bắt đầu tính thời gian chờ hoa hồng CTV ([12.3](#123-cách-tính-hoa-hồng)).

**Huỷ đơn** (nút đỏ **Huỷ đơn**, tuỳ chọn **Lý do**) — được khi đơn ở **Chờ hàng về**, **Chờ xác nhận**, **Chuẩn bị giao**; không huỷ được khi **Đang giao**.
- Hộp hỏi "Huỷ đơn này và nhả hàng đang giữ?". 📦 Nhả hàng đã giữ.
- 💰 **Không tự hoàn tiền**: đơn chuyển khoản đã nhận tiền mà huỷ vẫn ghi **Đã thanh toán** — bạn tự hoàn tiền cho khách ngoài hệ thống. Hệ thống **không có nút hoàn tiền riêng** ngoài biểu mẫu trả hàng.
- Huỷ hàng loạt không có (cố ý).

**Trả hàng** — khối **Trả hàng** ở trang đơn (đơn **Đang giao** hoặc **Hoàn tất**; mọi vai trò)
1. Nhập số lượng từng dòng (không quá **Còn trả được**).
2. Điền **Lý do trả** (bắt buộc); chọn **Vị trí chờ kiểm tra** nếu có nhiều khu.
3. Tick **Đã hoàn tiền cho khách** nếu bạn đã hoàn tiền.
4. Bấm **Ghi nhận trả hàng** (hỏi "Ghi nhận trả hàng và nhập vào khu Chờ kiểm tra?").

Kết quả ⛔📦: phiếu **Hàng trả** ghi sổ ngay, hàng về **đúng các lô cũ** trong khu **Chờ kiểm tra**. Trả một phần: trạng thái đơn giữ nguyên và ghi vào **Lịch sử**. Trả hết: đơn thành **Trả hàng** (nếu có tick hoàn tiền → thanh toán thành **Đã hoàn tiền**). Sau đó xử lý hàng ở [8.5](#85-chờ-kiểm-tra-hàng-khách-trả). Trả hàng cũng làm giảm hoa hồng CTV.

Lỗi: "Chỉ trả hàng cho đơn đang giao hoặc đã hoàn tất"; "Trả vượt số đã mua (SKU: còn n)"; "Hàng trả phải vào vị trí Chờ kiểm tra".

### 10.7. Thao tác hàng loạt

Ở danh sách đơn: **Chọn / bỏ chọn tất cả**, tick từng đơn ("Đã chọn {count} đơn"), rồi dùng thanh công cụ: **In nhãn**, **In phiếu lấy hàng**, **Xác nhận đơn COD**, ô đơn vị vận chuyển (mặc định "VTP") + **Đã bàn giao vận chuyển**, **Giao thành công**.

- Tối đa **100 đơn** một lần; mỗi đơn xử lý độc lập, kết quả "Đã xử lý {done}/{total} đơn" kèm danh sách đơn lỗi.
- Hộp xác nhận: "Bàn giao {count} đơn đã chọn? Hàng sẽ được xuất kho theo FEFO, không hoàn tác được."
- **Huỷ đơn** và **Đã nhận tiền** **không** làm hàng loạt được (cố ý, tránh nhầm).

### 10.8. Người trả cước, địa chỉ, phí ship

- **Người trả cước:** **Người nhận trả cước** (mặc định; đơn khách tự đặt luôn thế) hoặc **Cửa hàng trả cước**. Đổi bằng **Lưu người trả cước** — chỉ khi đơn ở **Chuẩn bị giao**.
- **Phí ship luôn bằng 0** trên đơn mới: hệ thống **không tính phí ship**, hãng VTP thu của người nhận khi giao ("Phí ship do đơn vị vận chuyển thu khi giao"). Dòng "Phí ship" chỉ còn trên đơn cũ có phí.
- **Địa chỉ** chọn theo danh mục VTP Myanmar 3 cấp **Vùng / Bang → Huyện → Thị trấn** + địa chỉ chi tiết. Chỉ chọn được thị trấn đang bật **Đang giao**.

### 10.9. Đơn đặt trước

**Đơn hàng › Đơn đặt trước** (huy hiệu = số đơn đang chờ hàng).

- Đơn thành đặt trước khi **khách đặt trên web**, sản phẩm thiếu hàng và **đang nhận đặt trước** ([5.7](#57-đặt-trước-khi-hết-hàng-bước-5)). Cả đơn chuyển sang **Chờ hàng về**, **không giữ hàng**.
- Trang liệt kê đơn theo **thứ tự đặt**; tồn hiện có được chia lần lượt từ đơn sớm nhất. Mỗi đơn có số thứ tự `#n`, nhãn **Đủ hàng** hoặc **Chưa đủ hàng**, từng dòng **Đủ** hoặc **Thiếu {n}**. Đây chỉ là **mô phỏng**, chưa giữ hàng thật.

**Khi hàng về:**
1. Nhập kho và **Ghi sổ** phiếu nhập ([8.2](#82-phiếu-nhập-kho)).
2. Vào **Đơn đặt trước**; đơn **Đủ hàng** thì bấm **Hàng đã về — chuyển xử lý**.
3. Hệ thống kiểm tồn, 📦 **giữ hàng**, đơn sang **Chờ xác nhận** và **thời gian giữ hàng bắt đầu tính từ lúc này**. Sau đó xử lý như đơn thường ([10.4](#104-xác-nhận-đơn-và-ghi-nhận-tiền)).

Muốn bỏ đơn đặt trước: **Huỷ đơn** ở trang đơn.

### 10.10. Đánh giá của khách

**Đơn hàng › Đánh giá** (Quản trị viên, Nhân viên đơn hàng): ba thẻ **Chờ duyệt**, **Đã đăng**, **Đã từ chối**; nút **Đăng** / **Từ chối**. 👁 Đánh giá đã đăng hiện ngay trên trang sản phẩm. Có thể đổi quyết định bằng cách chuyển sang thẻ còn lại. Khách chỉ đánh giá được sản phẩm trong đơn đã hoàn tất, mỗi sản phẩm một lần.

---

## 11. Đối soát tiền COD

**Mục đích:** ghi nhận tiền COD hãng vận chuyển **đã chuyển về cửa hàng**. **Ai làm được:** **chỉ Quản trị viên.**

Bấm **Giao thành công · Đã thu tiền** chỉ ghi nhận **khách đã trả tiền cho hãng**, **chưa phải** tiền đã về tay cửa hàng.

**Cần chuẩn bị:** bảng đối soát của hãng và sao kê tài khoản nhận tiền. Chỉ xác nhận sau khi đã kiểm.

### 11.1. Xem danh sách

**Đơn hàng › Đối soát COD** ("Đối soát tiền COD"): tóm tắt "{n} đơn chờ tiền về · COD gốc … MMK (chưa trừ phí hãng)", số đơn ngoại lệ, ô tuổi nợ ("{ngày} ngày · {n} đơn"), ba tab **Tất cả** / **Chờ tiền về cửa hàng** / **Có hoàn hàng / hoàn tiền · Cần đối soát riêng**. Cột: **Mã đơn**, **Hãng / Mã vận đơn**, **Hãng đã thu khách lúc**, **Số ngày chờ**, **COD đã thu (MMK)**, **Tình trạng tiền về**. **Việc đối soát làm ở trang chi tiết đơn**, khối **Đối soát tiền COD**.

### 11.2. Trường hợp thường (đơn Hoàn tất, đã thu tiền, không trả hàng)

1. Mở đơn → khối **Đối soát tiền COD**.
2. Điền **Tiền thực nhận (MMK)** (mặc định = tổng đơn), **Phí hãng khấu trừ (MMK)**, **Mã giao dịch / bảng đối soát** (bắt buộc).
3. Bấm **Xác nhận tiền đã về cửa hàng**.

**Quy tắc:** *tiền thực nhận + phí hãng = tổng đơn*. Sai thì báo "Tiền về + phí hãng khấu trừ phải bằng số COD đã thu của đơn".

**Ví dụ:** đơn 120.000 MMK, hãng giữ phí 3.000 → thực nhận 117.000 (117.000 + 3.000 = 120.000 ✔).

### 11.3. Trường hợp ngoại lệ (đơn có trả hàng/hoàn tiền)

1. Ngoài 3 ô trên, điền **Giảm thu do hoàn hàng / hoàn tiền (MMK)** và **Lý do và ghi chú đối soát** (bắt buộc).
2. Bấm **Đóng ngoại lệ COD** (hộp nhắc "…Thao tác không tự hoàn tiền hoặc thay đổi hàng trả.").

**Quy tắc:** *tiền thực nhận + phí hãng + giảm thu = COD gốc*. Sai thì báo "Tiền về + phí hãng + giảm thu phải bằng COD gốc".

**Ví dụ:** COD gốc 120.000, khách trả bớt hàng trị giá 40.000, hãng giữ phí 2.000 → thực nhận 78.000 (78.000 + 2.000 + 40.000 = 120.000 ✔).

### 11.4. Kết quả và lưu ý

- ⛔ Xác nhận xong, đơn hiện **Đã về cửa hàng** — **không có chức năng huỷ/sửa**. Kiểm kỹ số tiền trước khi bấm.
- 💰 Phí hãng khấu trừ đi vào báo cáo: **Phí hãng khấu trừ COD** và **Sau chi phí bán đã ghi nhận** ([14.2](#142-bán-hàng--lợi-nhuận)).
- Lỗi: "Đơn chưa ghi nhận hãng vận chuyển đã thu COD"; "Đơn đã được đối soát tiền về"; "Chỉ đối soát trực tiếp đơn hoàn tất chưa có hoàn hàng/hoàn tiền" (đơn có trả hàng dùng ngoại lệ); "Chỉ đóng ngoại lệ cho đơn đã hoàn tất hoặc trả hàng"; "Đơn không có ngoại lệ; dùng đối soát COD thông thường"; "Không có quyền đối soát COD".

---

## 12. Cộng tác viên (phía admin)

**Ai làm được:** Quản trị viên (gán CTV vào đơn: cả Nhân viên đơn hàng). Hướng dẫn cho chính CTV: [huong-dan-cong-ctv.md](huong-dan-cong-ctv.md).

### 12.1. Thêm CTV và duyệt đơn đăng ký

**Thêm trực tiếp:** **Cộng tác viên › Danh sách CTV › Thêm CTV**. Điền **Tên**, **Email đăng nhập**, **Số điện thoại**, **Mã giới thiệu** (4–12 ký tự A–Z/0–9, có gợi ý sẵn; đổi mã thì link cũ ngừng tính), **% hưởng từ tuyến dưới** (0–20; trống = theo cài đặt chung), **Thông tin nhận tiền** (chỉ admin thấy), **Mật khẩu tạm** (≥ 12 ký tự), **Cấp trên** (không bắt buộc) → **Tạo CTV**. Sau đó gửi cho CTV email đăng nhập, mật khẩu tạm và link giới thiệu.

**Duyệt đơn đăng ký:** CTV tự đăng ký qua link mời (do CTV khác gửi) → **Cộng tác viên › Đơn đăng ký**. **Duyệt**: điền **Mã giới thiệu**, **Thông tin nhận tiền**; CTV mới nằm dưới người đã mời họ và đăng nhập bằng mật khẩu họ tự đặt. Hoặc **Từ chối** (tuỳ chọn **Lý do**).

### 12.2. Trang chi tiết CTV

**Cộng tác viên › Danh sách CTV › (mở một CTV):**
- Thống kê: **Đơn tháng này**, **Doanh số tháng này**, **Hoa hồng chờ**, **Đến hạn trả**, **Đã trả**.
- **Cấp trên** + **Lưu cấp trên** ("Đổi cấp trên chỉ áp cho đơn mới…"). Không chọn được chính CTV hoặc tuyến dưới của họ làm cấp trên.
- **Đơn của CTV** (lọc theo **Tháng**, **Hoa hồng**: Chờ / Đến hạn / Không tính; nguồn: **Link giới thiệu**, **CTV tự lên đơn**, **Nhân viên gán**), **Đơn tuyến dưới**, **Lịch sử chi trả**.
- **Thông tin** → **Lưu**; **Đặt lại mật khẩu** → **Đặt lại**.
- **Truy cập:** **Khoá tài khoản** (CTV không đăng nhập được, link ngừng tính, hoa hồng đã có được giữ) / **Mở khoá tài khoản**; **Xoá tài khoản** chỉ khi CTV chưa có đơn, chi trả, tuyến dưới hay đơn đăng ký — nếu không: "CTV đã có đơn hàng, chi trả, tuyến dưới hoặc đơn đăng ký liên quan. Hãy khoá tài khoản để giữ lịch sử."

### 12.3. Cách tính hoa hồng

- **Cơ sở tính** = tiền hàng **thực giữ** = (số lượng − số lượng trả) × đơn giá. **Phí ship không tính.**
- **Hoa hồng người bán (từ 18/11/2026)** = Σ hoa hồng CTV theo sản phẩm × số lượng giữ. Hoa hồng theo sản phẩm là ô **CTV (MMK/sp)** ở trang Giá bán ([7.3](#73-thủ-công--kho-hàng-nhập-vn-công-thức-vnd)) hoặc cột Excel. **Sản phẩm để trống = không có hoa hồng.** Không còn % hoa hồng theo từng CTV. Mức được **chốt vào đơn** lúc tạo đơn / gắn CTV; đổi mức ở Giá bán sau đó chỉ áp cho đơn mới.
- **Hoa hồng tầng trên** = % cấp trên × **toàn bộ** tiền hàng giữ (không xét hoa hồng theo sản phẩm). **Cửa hàng trả**, không trừ vào CTV bán. % tầng trên chốt vào đơn, chỉnh được trên đơn chưa chi trả.
- Đơn tạo **trước 18/11/2026** đã chốt % CTV vẫn tính như cũ (% cho dòng không có hoa hồng cố định) và vẫn chỉnh được % đó trên đơn.

**Ví dụ (số giả định):** đơn có sản phẩm A 50.000 × 1 (hoa hồng 5.000/cái) và B 30.000 × 2 (để trống hoa hồng); cấp trên 2%. Tiền hàng 110.000.
- Người bán: 5.000 × 1 = **5.000** (B không có hoa hồng). Cấp trên: 2% × 110.000 = **2.200**.
- Sau đó khách trả 1 cái B: người bán vẫn **5.000**; cấp trên 2% × 80.000 = **1.600**.

**Trạng thái:** **Chờ** (đơn chưa hoàn tất, hoặc còn trong thời gian chờ) → **Đến hạn** (sau **Hoa hồng đến hạn sau khi đơn hoàn thành (ngày)**, mặc định 7 ngày kể từ **Hoàn tất**) → **Đã trả**. **Không tính** = đơn huỷ hoặc trả hàng trước khi hoàn tất.

**Gán CTV vào đơn:** ở trang đơn, khối **Cộng tác viên** → chọn → **Lưu CTV** (chọn **— Không gán CTV —** để bỏ). Không đổi được nếu "Đơn đã chi trả hoa hồng — không đổi CTV được." hoặc "Đơn đã huỷ — không đổi CTV được.". Chỉ Quản trị viên sửa được riêng **% hoa hồng CTV** và **% tầng trên** của đơn → **Lưu %** (hoa hồng tính lại ngay).

### 12.4. Chi trả hoa hồng

**Cộng tác viên › Hoa hồng & chi trả**: mỗi CTV một dòng với **Chờ**, **Đến hạn**, **Đã trả**; **Xem** nhảy tới phần chi trả của CTV đó.

**Các bước chi trả**
1. Mở CTV có **Đến hạn trả**. Đọc "{n} đơn · tổng {amount} MMK".
2. **Chuyển tiền cho CTV bên ngoài hệ thống** (ngân hàng, KBZPay, Wave… theo **Thông tin nhận tiền**).
3. Điền **Ghi chú (mã giao dịch, kênh chuyển…)**; đính **Ảnh biên nhận (không bắt buộc)** (JPG/PNG/WebP/PDF, tối đa 5MB).
4. Bấm **Ghi nhận đã trả** (hỏi "Xác nhận đã chuyển {amount} MMK cho {name}?").

**Kết quả:** 💰⛔ **trả hết một lần** toàn bộ khoản đến hạn (không trả một phần; gồm cả khoản âm phát sinh do trả hàng sau lần trả trước). Hệ thống chỉ **ghi nhận**, **không** chuyển tiền thật. Các đơn đó bị khoá không đổi CTV hay % nữa. Không có màn hình hoàn tác.

Lỗi: "Chưa có hoa hồng đến hạn để trả"; "File biên nhận không hợp lệ (JPG/PNG/WebP/PDF, tối đa 5MB)".

---

## 13. Tài khoản

### 13.1. Nhân viên

**Tài khoản › Nhân viên** (Quản trị viên).

- **Tạo:** **Thêm nhân viên** → **Họ tên**, **Email**, **Vai trò** (**Quản trị viên** / **Quản lý kho** / **Nhân viên đơn hàng**), **Mật khẩu tạm** (≥ 12 ký tự) → **Tạo tài khoản**. Báo cho nhân viên đổi mật khẩu ở **Tài khoản của tôi**.
- **Sửa:** mở nhân viên → đổi tên/email/vai trò → **Lưu**.
- **Đặt lại mật khẩu:** **Đặt mật khẩu tạm** — nhân viên bị đăng xuất khỏi mọi thiết bị.
- **Khoá/Mở khoá:** **Khoá tài khoản** (đăng xuất ngay, giữ lịch sử) / **Mở khoá tài khoản** (mật khẩu cũ dùng lại được). **Nên khoá khi nhân viên nghỉ việc.**
- **Xoá:** **Xoá tài khoản** ⛔ chỉ cho tài khoản tạo nhầm **chưa có bất kỳ thao tác nào**. Đã có thao tác: "Nhân viên đã có thao tác hoặc dữ liệu liên quan; hãy khoá tài khoản để giữ lịch sử."

Quy tắc/lỗi: "Không thể tự thay đổi vai trò, email, khoá, xoá hay đặt lại mật khẩu cho chính mình"; "Phải còn ít nhất 1 quản trị viên đang hoạt động"; "Email đã được dùng cho tài khoản khác".

Trên danh sách, mỗi dòng có biểu tượng: bút chì **Sửa**, ổ khoá **Khoá/Mở khoá tài khoản**, thùng rác đỏ **Xoá tài khoản** (đều có hỏi lại). Danh sách Khách hàng và CTV dùng cùng bộ nút này.

### 13.2. Khách hàng

**Tài khoản › Khách hàng** (Quản trị viên). Khách đăng nhập web bằng **số điện thoại + mật khẩu**.

**Yêu cầu đặt lại mật khẩu** (khối đầu trang, huy hiệu ở menu): khách quên mật khẩu tự gõ mật khẩu mới ở trang web; yêu cầu **chờ bạn duyệt**.
1. Kiểm tra bạn tin đúng chủ số điện thoại (nên gọi xác nhận).
2. **Xác nhận** → mật khẩu mới có hiệu lực, khách bị đăng xuất khỏi mọi thiết bị (**không** mở khoá tài khoản đã khoá). Hoặc **Từ chối** → mật khẩu cũ giữ nguyên.
3. Yêu cầu hết hạn sau **7 ngày**. Lỗi: "Yêu cầu đã được xử lý"; "Yêu cầu đã hết hạn — khách cần gửi lại".

**Danh sách:** thống kê **Trong danh sách**, **Đang dùng**, **Đã khoá**; ô **Tìm (SĐT, email, tên)**; hiện tối đa 100 tài khoản mới nhất. Mở khách để **Lưu** tên/số điện thoại ("Đổi số thì khách đăng nhập bằng số mới."), **Đặt lại mật khẩu** (mật khẩu tạm ≥ 8 ký tự), **Khoá/Mở khoá**, **Xoá tài khoản** — chỉ xoá được khi khách **chưa có đơn** ("Khách đã có đơn hàng; hãy khoá tài khoản để giữ lịch sử.").

### 13.3. Tài khoản của tôi

Bấm tên bạn (góc phải trên) → **Tài khoản của tôi** → **Đổi mật khẩu** (≥ 12 ký tự; đăng xuất các thiết bị khác).

---

## 14. Tổng quan và báo cáo

### 14.1. Tổng quan

**Tổng quan** (chọn xem 7 hoặc 30 ngày). Mỗi người thấy các khối theo quyền:
- **Việc cần làm** (mọi vai trò; mỗi ô bấm vào ra danh sách lọc sẵn): **COD chờ gọi xác nhận**, **Chờ nhận chuyển khoản**, **Chờ hàng về (đặt trước)**, **Chuẩn bị giao**, **Đang giao**, **Đang giao từ 7 ngày**, **Đơn quá hạn giữ hàng**; Quản trị viên thêm **Chờ tiền về cửa hàng**.
- **Cảnh báo kho** (mọi vai trò): **Tồn thấp**, **Hết hạn / ngừng bán / cận date**, **Nên đặt thêm**, **Lô chưa biết hạn sử dụng**.
- (Quản trị viên) khối sản phẩm: **Sản phẩm**, **SKU còn hàng**, **SP chờ duyệt**, **Đang bán**, số đơn; **Công việc cần xử lý**; **Phiếu nhập kho gần đây**; **Sản phẩm cập nhật gần đây**; **Quy trình đăng bán sản phẩm**.
- (Quản trị viên) **Kinh doanh 30 ngày**: doanh thu hôm nay, doanh thu, biên lợi nhuận, đơn hoàn tất, **Xem báo cáo**.

### 14.2. Bán hàng & lợi nhuận

**Báo cáo › Bán hàng & lợi nhuận** (Quản trị viên). Chọn **Từ ngày** / **Đến ngày** → **Xem**.

Cách tính: **doanh thu = đơn Hoàn tất theo ngày hoàn tất** (giờ Yangon), trừ hàng trả. Ý nghĩa các ô:

| Ô | Hiểu là |
|---|---|
| **Doanh thu** | Tiền hàng các đơn hoàn tất, đã trừ hàng trả |
| **Giá vốn** | Giá vốn của lô đã xuất cho các đơn đó |
| **Lợi nhuận gộp** / **Biên lợi nhuận** | Doanh thu − giá vốn; tỷ lệ trên doanh thu |
| **Đơn hoàn tất** | Số đơn |
| **Hàng trả (giảm doanh thu)** | Giá trị hàng khách trả |
| **Phí ship thu** | Phí ship đã thu (đơn mới = 0) |
| **Hoa hồng CTV** (và **Trong đó: hoa hồng tuyến dưới**) | Hoa hồng phát sinh |
| **Lợi nhuận sau hoa hồng** | Lợi nhuận gộp − hoa hồng |
| **Phí hãng khấu trừ COD** | Phí hãng ghi ở bước đối soát COD |
| **Sau chi phí bán đã ghi nhận** | Lợi nhuận sau hoa hồng − phí hãng đã ghi nhận |

Trang có cảnh báo khi thiếu giá vốn hoặc dùng giá vốn tạm (con số lợi nhuận khi đó chỉ là ước tính), và các bảng **Theo ngày**, **Bán chạy**, **Bán chậm**, **Tồn kho theo vị trí**, **Hàng đang vận chuyển**.

### 14.3. Hành vi mua hàng

**Báo cáo › Hành vi mua hàng**: phễu từ **Xem sản phẩm** → **Thêm giỏ** → … → **Giao thành công**, chia theo thiết bị và tốc độ trải nghiệm; xem tối đa 90 ngày. Hệ thống chỉ ghi nhận dữ liệu tối thiểu. Theo nhóm phát triển, **chưa nên bật cho khách đặt COD không đăng nhập** trước khi có ít nhất hai tuần dữ liệu thực (hiện checkout bắt buộc đăng nhập).

### 14.4. Sức khoẻ dữ liệu

**Báo cáo › Sức khoẻ dữ liệu**: trang **chỉ đọc**, không tự sửa gì; mỗi mục có mức **Lỗi** / **Cảnh báo** / **Theo dõi**. Xử lý theo thứ tự Lỗi → Cảnh báo. Các kiểm tra: sản phẩm đang bán giá ≤ 0; sản phẩm ẩn chưa có giá; sản phẩm chưa có ảnh; thiếu khối lượng; sản phẩm thuộc kho đã ngừng dùng; lô chưa có giá vốn; chỉ có giá vốn tạm; combo thiếu giá vốn; chuyến hàng cần phân bổ lại; lô lệch chuyến hàng; đơn chờ xác nhận quá hạn; đơn **Đang giao** quá lâu; đơn COD ngoại lệ; hàng đang **Chờ kiểm tra**; phiếu nháp để quá lâu. Bảng **Mốc vận hành** cho biết thời gian xử lý từng bước, tuổi nợ COD, tổng hoa hồng đã trả; nút **Tải mốc (JSON)** dành cho kỹ thuật viên.

---

## 15. Cài đặt và nội dung web

Chỉ **Quản trị viên**.

### 15.1. Cấu hình cửa hàng

**Cài đặt › Cấu hình cửa hàng.** Sửa các ô rồi bấm **Lưu cài đặt** (một nút lưu tất cả, mọi thay đổi đều được ghi nhận). Đầu trang có lối tắt tới **Nhân viên**, **Cộng tác viên**, **Khách hàng**.

| Nhóm | Ô | Mặc định | Tác động |
|---|---|---|---|
| **Cửa hàng web** | **Nhận đơn trên web** | bật | 👁 **Tắt** → khách vẫn xem hàng nhưng không đặt được ("Đang tạm ngừng nhận đơn trên web"). **Đơn tạo trong admin không bị ảnh hưởng.** Dùng khi nghỉ lễ, kiểm kê, sự cố |
| | **Bắt buộc in phiếu soạn (chốt lô) trước khi bàn giao** | tắt | Bật → không bàn giao được nếu chưa **Chốt lô & In** |
| **Hạn dùng** | **Ngừng bán khi còn hạn dưới (ngày)** | 90 | 📦 Lô cận hạn hơn mức này không bán/xuất, không tính vào **Còn bán** |
| | **Cảnh báo cận date dưới (ngày)** | 180 | Hiện cảnh báo "Cận date". Phải ≥ ngưỡng ngừng bán, nếu không: "Ngưỡng cảnh báo phải ≥ ngưỡng ngừng bán" |
| **Đơn hàng** | **Giữ hàng chờ chuyển khoản (giờ)** | 24 (1–168) | Quá giờ → tự huỷ đơn chuyển khoản |
| | **Tự huỷ COD chưa xác nhận sau (giờ)** | 24 (1–168) | Quá giờ → tự huỷ đơn COD |
| | **Hạn mức đặt trước mặc định mỗi phân loại (cái, 0 = không nhận)** | 20 | Số lượng đặt trước tối đa; 0 = tắt đặt trước |
| **Giá** | **Làm tròn giá lên bội số (MMK)** | 100 | 💰 Dùng khi tính giá |
| | **Bản xem trước giá hết hạn sau (ngày)** | 3 | Bảng tính giá cũ hơn phải làm lại |
| **Gợi ý đặt hàng** | **Số ngày bán cần đủ hàng sau khi về** | 30 | Cho gợi ý ở **Cảnh báo** |
| | **Tính tốc độ bán trong (ngày gần nhất)** | 60 | Cho gợi ý ở **Cảnh báo** |
| **Cộng tác viên** | **Hoa hồng đến hạn sau khi đơn hoàn thành (ngày)** | 7 | Thời gian chờ trước khi **Đến hạn** |
| | **% bán hàng mặc định khi duyệt CTV mới (%)** | 10 | Điền sẵn khi duyệt đơn đăng ký |
| | **Cấp trên hưởng trên đơn của CTV mình tuyển (%)** | 2 | % tầng trên dùng chung. Ô cho gõ đến 50 nhưng máy chủ **từ chối trên 20** |
| **Thanh toán** | **Hướng dẫn chuyển khoản (hiện cho khách)** | trống | 👁 Nội dung khách thấy khi chọn chuyển khoản (tối đa 1000 ký tự) — nhớ điền số tài khoản |

### 15.2. Địa bàn giao hàng (VTP)

**Cài đặt › Địa bàn giao hàng.** Danh mục Vùng → Huyện → Thị trấn theo VTP Myanmar. Bỏ tick **Đang giao** để ẩn một khu khỏi form địa chỉ (tắt một vùng thì mọi huyện/thị trấn bên dưới cũng ẩn). Sửa **Tên tiếng Myanmar** → **Lưu thay đổi**. Mã VTP **không sửa được**.

### 15.3. Banner trang chủ

**Cài đặt › Nội dung trang chủ › Banner** → **Thêm banner**.
- **Ảnh desktop** (tỷ lệ 3:1), **Ảnh mobile** (3:2, không bắt buộc), mỗi ảnh ≤ 5MB.
- **Mô tả ảnh (alt)**, **Link khi bấm**, **Hiện cho ngôn ngữ**, **Đang bật**, **Bắt đầu** / **Kết thúc** (giờ Yangon).
- Trong danh sách: **Lên** / **Xuống** (thứ tự), **Bật** / **Tắt**, **Sửa**, **Xoá**. Trạng thái: **Đang hiện**, **Đã tắt**, **Chờ đến lịch**, **Hết lịch**.
- 👁 Không có banner nào thì trang chủ dùng banner mặc định.

### 15.4. Bộ sưu tập

**Cài đặt › Nội dung trang chủ › Bộ sưu tập** → **Tạo bộ sưu tập**: **Slug (URL /collection/...)**, tên tiếng Myanmar/Anh, lịch hiển thị, **Đang bật**, **Hiện trên trang chủ**. Thêm tối đa 200 sản phẩm; sản phẩm chưa đăng ghi "Chưa đăng — không hiện trên web". 👁 Trang chủ chỉ hiện dải tối đa 10 sản phẩm và chỉ khi có ít nhất một sản phẩm đang hiển thị. **Xoá bộ sưu tập** không ảnh hưởng sản phẩm.

### 15.5. Danh mục

**Sản phẩm › Danh mục** → **Thêm danh mục** (tối đa 2 cấp). 👁 Danh mục gốc hiện ở khối "Nhóm hàng" trang chủ; danh mục không có sản phẩm đang bán thì ẩn khỏi web. Đổi slug thì link cũ `/c/…` tự chuyển hướng. Xoá: "Xoá danh mục…? Không hoàn tác được." ⛔ — bị chặn nếu còn sản phẩm hoặc danh mục con.

### 15.6. Đánh giá

Xem [10.10](#1010-đánh-giá-của-khách).

---

## 16. Thao tác không hoàn tác được

| Thao tác | Vì sao không hoàn tác | Nếu lỡ tay |
|---|---|---|
| **Ghi sổ** phiếu kho | Sổ kho chỉ ghi thêm | Tạo phiếu **Điều chỉnh** hoặc **Chuyển kho** ngược lại ([8.3](#83-chuyển-kho-xuất-kho-và-điều-chỉnh)) |
| **Đã bàn giao vận chuyển** | Xuất kho thật | Nếu hàng trả về: **Trả hàng** ([10.6](#106-bàn-giao-giao-thành-công-huỷ-và-trả-hàng)) |
| **Ghi nhận trả hàng**, **Nhập lại kho bán**, **Huỷ hàng** | Phiếu kho ghi sổ ngay | Phiếu điều chỉnh |
| **Xác nhận tiền đã về cửa hàng** / **Đóng ngoại lệ COD** | Không có nút sửa | Liên hệ kỹ thuật viên **[CHƯA XÁC MINH — không có công cụ sửa trên giao diện]** |
| **Ghi nhận đã trả** (hoa hồng) | Trả hết một lần, khoá đơn | Khoản trả nhầm xử lý ngoài hệ thống |
| **Thêm tỷ giá** | Không sửa/xoá | Thêm tỷ giá đúng ngay sau đó |
| **Áp dụng giá đã chọn**, **Lưu giá** | Lịch sử giá giữ vĩnh viễn | Đặt lại giá đúng ở trang Giá bán (SP đã duyệt: còn chờ duyệt thì có thể **Huỷ thay đổi**) |
| **Xác nhận nhập** Excel | File đó không nhập lại được | Sửa file rồi nhập (khác nội dung) |
| **Xoá** sản phẩm chưa có lịch sử | Xoá hẳn cùng ảnh và lịch sử giá | Tạo lại |
| Slug sau lần **đăng bán** đầu | Link khách đã dùng | Không đổi được |
| Kho đã có sổ kho | Chỉ **Ngừng dùng**; không xoá, không đổi cách tính giá | Tạo kho mới |
| **Xoá danh mục**, **Xoá tài khoản** | Mất hẳn | Tạo lại |
| **Huỷ đơn** | Hàng được nhả; **không tự hoàn tiền** | Tạo đơn mới; hoàn tiền ngoài hệ thống |

Cách an toàn: dùng **Lưu nháp** trước khi **Ghi sổ**; **Xem trước** trước khi **Xác nhận nhập** Excel hoặc **Áp dụng giá**; kiểm số liệu hai lần trước khi bấm các nút ⛔.

---

## 17. Tra cứu thông báo lỗi

Bảng này chỉ gom các thông báo **hay gặp nhất**; các lỗi đặc thù từng chức năng nằm ngay trong mục tương ứng. Tìm bằng Ctrl+F.

| Thông báo | Nghĩa | Xem |
|---|---|---|
| "Bạn không có quyền truy cập trang đó." | Vai trò của bạn không có quyền | [mục 3](#3-vai-trò-và-quyền) |
| "Sai email hoặc mật khẩu" | Đăng nhập sai | [1.1](#11-đăng-nhập-lần-đầu) |
| "Đăng nhập quá nhiều lần. Vui lòng thử lại sau ít phút." | Bị giới hạn số lần thử | [1.1](#11-đăng-nhập-lần-đầu) |
| "Tài khoản đã bị khoá. Liên hệ quản trị viên." | Tài khoản bị khoá | [13.1](#131-nhân-viên) |
| "Không đủ hàng (còn/cần)" / "Không đủ hàng: cần x, khả dụng y" | Tồn không đủ, hoặc hàng đang được giữ cho đơn khác | [8.3](#83-chuyển-kho-xuất-kho-và-điều-chỉnh), [10.2](#102-tạo-đơn-thủ-công) |
| "Giá bán ≤ 0" / "Có sản phẩm chưa có giá bán (giá ≤ 0)" | Chưa đặt giá | [7.2](#72-trang-giá-bán-danh-sách) |
| "Nhập lý do sửa giá" | Đổi giá (kho MMK) phải có lý do | [7.4](#74-thủ-công--kho-hàng-mua-mmk) |
| "Không bàn giao được: lô sắp xuất chưa có giá vốn …" | Lô chưa có giá vốn | [10.6](#106-bàn-giao-giao-thành-công-huỷ-và-trả-hàng) |
| "Hoa hồng CTV … lớn hơn giá bán" | Hoa hồng cố định vượt giá | [7.6](#76-lãi-cố-định-và-hoa-hồng-ctv-theo-sản-phẩm) |
| "Thiếu khối lượng …" | Thiếu khối lượng (gam) | [5.2](#52-trang-sản-phẩm-5-bước-và-các-lưu-ý) |
| "Chưa bật hiển thị / lưu được: …" | Sản phẩm còn lỗi chặn đăng | [5.2](#52-trang-sản-phẩm-5-bước-và-các-lưu-ý) |
| "Nội dung vừa thay đổi — tải lại và xem lại trước khi duyệt" | Người khác vừa sửa | [9.2](#92-duyệt-hoặc-từ-chối-một-sản-phẩm) |
| "Tải file lên xem trước lại…" | Giá/tỷ giá đổi giữa chừng khi nhập Excel | [6.5](#65-hệ-thống-tự-chặn) |
| "File này đã được nhập lúc … Không nhập lại" | Chặn nhập lặp một file | [6.5](#65-hệ-thống-tự-chặn) |
| "Phiếu đã ghi sổ — không sửa được." | Dùng phiếu Điều chỉnh | [8.3](#83-chuyển-kho-xuất-kho-và-điều-chỉnh) |
| "Phiếu soạn không còn khớp …" | In lại phiếu lấy hàng | [10.5](#105-in-nhãn-phiếu-lấy-hàng-và-xuất-file-vtp) |
| "Đang tạm ngừng nhận đơn trên web" | Ô **Nhận đơn trên web** đang tắt | [15.1](#151-cấu-hình-cửa-hàng) |
| "Tiền về + phí hãng khấu trừ phải bằng số COD đã thu của đơn" | Số đối soát chưa khớp | [11.2](#112-trường-hợp-thường-đơn-hoàn-tất-đã-thu-tiền-không-trả-hàng) |
| "Phải còn ít nhất 1 quản trị viên đang hoạt động" | Không khoá/hạ vai trò quản trị viên cuối cùng | [13.1](#131-nhân-viên) |
| "Không thực hiện được: …" | Lỗi chung; đọc phần sau dấu hai chấm | — |

Nếu gặp trang lỗi chung của hệ thống (không phải thông báo nghiệp vụ), thử tải lại; không hết thì ghi lại giờ và thao tác đang làm rồi báo kỹ thuật viên.

---

## 18. Những gì hệ thống hiện chưa có

Để khỏi mất công tìm — các chức năng sau **không có** trên giao diện admin hiện tại:

- **Trang xem nhật ký thao tác toàn hệ thống.** Hệ thống có ghi lại hành động, nhưng chỉ xem được lịch sử trên trang sản phẩm (thẻ **Nhật ký**, **Lịch sử giá**), các bảng tính giá, và **Lịch sử** của từng đơn.
- **Trang quản lý thương hiệu** (thương hiệu tự tạo/tự xoá — [5.6](#56-thương-hiệu)).
- **Lịch hiển thị theo ngày cho sản phẩm** (chỉ banner và bộ sưu tập có).
- **Quên mật khẩu tự phục vụ cho nhân viên** (nhờ quản trị viên **Đặt mật khẩu tạm**). Khách thì có.
- **Nút hoàn tiền cho khách**; hoàn tiền làm ngoài hệ thống.
- **Chuyển tiền thật** cho CTV hay đối soát tự động với ngân hàng/hãng: hệ thống chỉ **ghi nhận**.
- **Tính phí ship** (luôn bằng 0; hãng thu khi giao).
- **Gõ đè giá cuối ở chế độ Thủ công kho VND** (giá luôn theo công thức; muốn giá tròn / khuyến mãi thì đổi lãi, hoặc nhập thẳng qua Excel).
- **Giá bán riêng theo lô** (lô chỉ là cơ sở tính; giá áp chung cho SKU).
- **Đơn đặt trước do nhân viên hoặc CTV tạo** (chỉ khách web).
- **Sửa ở giao diện** các trường **Cách dùng**, **Thành phần (INCI)**, **Bảo quản**, **Hạn sau mở nắp** (chỉ qua Excel) và các ngưỡng **báo tồn thấp**, **thời gian VN→MM**, **tồn an toàn** theo sản phẩm (hiện cố định mặc định: 5, 21, 0).
- **Xoá hoặc sửa tỷ giá**; **huỷ/sửa đối soát COD** đã xác nhận.
- **Đăng nhập bằng Google** (đã gỡ ngày 14/11/2026).
- **Quy trình duyệt hai người**: hệ thống cho một Quản trị viên tự gửi và tự duyệt.

---

## 19. Phụ lục

### 19.1. Thuật ngữ

| Từ | Nghĩa |
|---|---|
| SKU | Mã nội bộ của từng biến thể |
| Biến thể | Một màu/dung tích của sản phẩm |
| Lô | Một đợt hàng nhập, có số lô, hạn dùng, giá vốn |
| FEFO | Hết hạn trước, xuất trước |
| PAO | Hạn dùng sau khi mở nắp (tháng) |
| Giữ hàng | Giành chỗ cho đơn, chưa xuất kho |
| Ghi sổ | Làm phiếu kho có hiệu lực, thay đổi tồn |
| COD | Thu tiền khi giao |
| VTP | Hãng vận chuyển Viettel Post Myanmar |
| CTV | Cộng tác viên |
| MMK / VND / USD | Kyat Myanmar / đồng Việt Nam / đô la Mỹ |
| Tester | Hàng dùng thử/quà tặng, không bán |
| Landed cost | Giá vốn về kho = giá mua + chi phí đưa hàng về |

### 19.2. Danh sách mục chưa xác minh

Các điểm sau đọc từ mã nguồn nhưng **chưa được thử trên server thật hoặc chưa đối chiếu trên màn hình**:

1. **Lịch chạy tự động** (mỗi 15 phút tự huỷ đơn quá hạn; 23:30 tính cảnh báo kho; 21:00 dọn dẹp, hết hạn yêu cầu đặt lại mật khẩu) phụ thuộc cấu hình crontab/dịch vụ trên server (xem `ops/cron.example`). Nếu lịch không chạy, đơn quá hạn sẽ không tự huỷ.
2. **Giới hạn thực tế 20%** của ô "Cấp trên hưởng …": ô nhập cho đến 50 nhưng mã nguồn từ chối trên 20.
3. **Giao diện điện thoại** chỉ mô tả theo mã (không chụp ảnh).
4. Không có công cụ trên giao diện để **sửa lại đối soát COD** đã xác nhận ([16](#16-thao-tác-không-hoàn-tác-được)).
5. **Nội dung cổng CTV** ngoài các nhãn đọc trong mã nguồn ([huong-dan-cong-ctv.md](huong-dan-cong-ctv.md)).
6. Bố trí chính xác từng nút trên màn hình (ví dụ nút nằm ở đầu hay cuối bảng) chưa đối chiếu bằng mắt; hãy dựa vào **tên nút**.

### 19.3. Một số dòng chữ trên màn hình chưa khớp hành vi thật

Phát hiện khi viết tài liệu (**không sửa mã** theo yêu cầu; để nhóm kỹ thuật cân nhắc):
- Trang **Giá & tỷ giá** (nay là các tab của trang Giá bán) ghi "Lãi cố định nhập ở trang Sửa sản phẩm" — thực tế lãi cố định nhập ở trang **Giá bán** (khung thủ công của kho MMK). **Đã sửa chữ trên màn hình ngày 16/11/2026.**

### 19.4. Khi cần hỗ trợ

Ghi lại: giờ xảy ra, tài khoản, màn hình/menu, thao tác vừa làm, nội dung thông báo lỗi nguyên văn (chụp màn hình bằng điện thoại cũng được) rồi gửi kỹ thuật viên. **Không gửi mật khẩu.**
