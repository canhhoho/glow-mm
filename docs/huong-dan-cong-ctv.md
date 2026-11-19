# Hướng dẫn cổng cộng tác viên (CTV) — T&C Cosmetics

Dành cho cộng tác viên và cho nhân viên cửa hàng cần hướng dẫn CTV. Phần quản lý CTV ở phía admin (thêm CTV, duyệt đơn đăng ký, chi trả hoa hồng) nằm ở [huong-dan-van-hanh-admin.md, mục 12](huong-dan-van-hanh-admin.md#12-cộng-tác-viên-phía-admin).

Ký hiệu: 💰 liên quan tiền · ⛔ không hoàn tác được · **[CHƯA XÁC MINH]** = chưa kiểm chứng trên màn hình thật (tài liệu không có ảnh chụp).

## Mục lục

- [1. Đăng ký và đăng nhập](#1-đăng-ký-và-đăng-nhập)
- [2. Các mục trong cổng](#2-các-mục-trong-cổng)
- [3. Link giới thiệu: cách đơn được tính cho bạn](#3-link-giới-thiệu-cách-đơn-được-tính-cho-bạn)
- [4. Tạo đơn cho khách](#4-tạo-đơn-cho-khách)
- [5. Theo dõi đơn](#5-theo-dõi-đơn)
- [6. Hoa hồng và thanh toán](#6-hoa-hồng-và-thanh-toán)
- [7. Tuyến dưới (mời thêm CTV)](#7-tuyến-dưới-mời-thêm-ctv)
- [8. Tài khoản, ngôn ngữ, đăng xuất](#8-tài-khoản-ngôn-ngữ-đăng-xuất)
- [9. Câu hỏi thường gặp](#9-câu-hỏi-thường-gặp)

---

## 1. Đăng ký và đăng nhập

**Có hai cách có tài khoản CTV**
1. **Cửa hàng tạo cho bạn:** bạn nhận email đăng nhập, mật khẩu tạm và link giới thiệu từ cửa hàng. Đăng nhập rồi đổi mật khẩu ngay ([mục 8](#8-tài-khoản-ngôn-ngữ-đăng-xuất)).
2. **Tự đăng ký qua link mời** của một CTV đang hoạt động (trang **Đăng ký làm cộng tác viên**, đường dẫn `/ctv/join`):
   1. Mở link mời. Trang hiện "Được mời bởi {tên} ({mã}). Shop duyệt xong bạn mới đăng nhập được."
   2. Điền **Họ tên**, **Số điện thoại**, **Email (dùng để đăng nhập)**, **Mật khẩu**, **Nhập lại mật khẩu** → **Gửi đăng ký**.
   3. Chờ cửa hàng duyệt. Sau khi duyệt, đăng nhập bằng email và mật khẩu vừa đặt.

**Đăng nhập:** mở `https://tandcstore.com/ctv/login` ("Đăng nhập cổng CTV", "Dùng tài khoản cộng tác viên do shop cấp"), nhập email + mật khẩu.

**Lỗi thường gặp**
| Thông báo | Cách xử lý |
|---|---|
| "Link mời không hợp lệ hoặc đã hết hiệu lực. Hãy xin lại link từ người giới thiệu." | Xin link mới |
| "Email này đã có tài khoản — hãy đăng nhập" | Đăng nhập thay vì đăng ký |
| "Email hoặc số điện thoại này đã có đơn đang chờ duyệt" | Chờ cửa hàng duyệt, không gửi lại |
| "Số điện thoại không hợp lệ" | Nhập số Myanmar đúng định dạng |
| "Hai mật khẩu không khớp" / "Mật khẩu tối thiểu {n} ký tự" | Nhập lại mật khẩu |
| "Gửi quá nhiều lần, thử lại sau" | Đợi một lúc |
| "Tài khoản này không dùng ở cổng đăng nhập này. Nhân viên đăng nhập tại /admin, cộng tác viên tại /ctv." | Bạn đang dùng nhầm cổng; CTV dùng `/ctv/login` |
| "Tài khoản đã bị khoá…" | Liên hệ cửa hàng |

Khoá tài khoản CTV: bạn không đăng nhập được và link giới thiệu ngừng tính đơn mới, nhưng hoa hồng đã có vẫn được giữ.

---

## 2. Các mục trong cổng

Trên máy tính là thanh trên cùng; trên điện thoại là thanh ở **cuối màn hình**.

| Mục | Dùng để |
|---|---|
| **Tổng quan** | Xem link giới thiệu, đơn gần đây |
| **Đơn của tôi** | Danh sách và chi tiết đơn tính cho bạn |
| **Tạo đơn** | Tạo đơn cho khách ("Tạo đơn cho khách") |
| **Tuyến dưới** | Mời CTV mới, xem tổng số của nhóm |
| **Thanh toán** | Xem hoa hồng chờ/đến hạn/đã nhận ("Thanh toán hoa hồng") |
| **Tài khoản** | Đổi mật khẩu, đổi ngôn ngữ, đăng xuất |

Bạn **chỉ thấy dữ liệu của chính mình**. Cổng CTV không vào được trang quản trị của cửa hàng.

---

## 3. Link giới thiệu: cách đơn được tính cho bạn

Ở **Tổng quan**, khối **Link giới thiệu của bạn** có nút **Sao chép** (báo **Đã chép**).

- Gửi link cho khách. Khách bấm link rồi **đặt hàng trong 30 ngày** thì đơn được tính cho bạn. Nếu khách bấm link của nhiều CTV, **link bấm sau cùng** được tính.
- Gửi link **một sản phẩm** cũng được: thêm `?ref={mã của bạn}` vào cuối link.
- **Mã giới thiệu** là mã cửa hàng cấp cho bạn. Nếu cửa hàng đổi mã thì link cũ **ngừng tính**.
- Bạn cũng có thể tự đăng nhập trang web bán hàng bằng chính tài khoản CTV; đơn đặt khi đang đăng nhập tự gắn cho bạn.
- Hoa hồng tính **theo từng sản phẩm** (số tiền cố định cửa hàng đặt cho sản phẩm đó), xem [mục 6](#6-hoa-hồng-và-thanh-toán).

---

## 4. Tạo đơn cho khách

**Mục đích:** nhập đơn khách đặt qua bạn (chat, điện thoại…). Đơn được cửa hàng xác nhận rồi giao như đơn thường.

**Cần chuẩn bị:** tên, số điện thoại, địa chỉ khách; sản phẩm và số lượng khách muốn.

**Các bước**
1. Chọn **Tạo đơn** (trang "Tạo đơn cho khách").
2. Điền thông tin người nhận (tên, số điện thoại), địa chỉ chọn lần lượt **Vùng / Bang → Huyện → Thị trấn** + địa chỉ chi tiết, ghi chú nếu cần.
3. Thêm sản phẩm: chọn biến thể (có giá bán, số còn bán được và **hoa hồng của bạn/cái**; hàng chưa có mà cửa hàng còn nhận đặt trước ghi **"Đặt trước: còn nhận N"** — đơn đó là **đơn đặt trước**, trạng thái **Chờ hàng về**, cửa hàng xử lý khi hàng về) và số lượng; thêm dòng nếu nhiều sản phẩm. Dưới phần tạm tính có **Hoa hồng dự kiến của bạn**.
4. Bấm **Tạo đơn**. Hiện "Đã tạo đơn. Shop sẽ gọi khách xác nhận."
5. Ở trang đơn, khối **Link theo dõi đơn cho khách** → **Sao chép** rồi gửi khách qua Viber/Messenger. Khách mở link (mã đơn đã điền sẵn), nhập số điện thoại nhận hàng để xem tình trạng đơn.

**Kết quả:** đơn vào trạng thái **Chờ xác nhận**; hàng được **giữ** cho đơn; cửa hàng gọi khách xác nhận. Giá là **giá bán hiện tại** của cửa hàng — bạn không tự đặt giá. **Phí ship = 0** (hãng vận chuyển thu của người nhận khi giao).

**Lưu ý**
- Cổng CTV **không có tìm khách theo số điện thoại** (để bảo vệ thông tin khách của người khác).
- **Không tạo được đơn đặt trước.** Nếu sản phẩm không đủ hàng: "Không đủ hàng (còn/cần): SKU (còn/cần)". Chọn số lượng ít hơn hoặc hỏi cửa hàng khi nào có hàng.
- Đơn **chưa xác nhận** quá thời gian giữ hàng (mặc định 24 giờ) sẽ **tự huỷ** — hãy báo khách nghe máy khi cửa hàng gọi.
- Các lỗi khác: "Số điện thoại không hợp lệ", "Khu vực giao hàng không hợp lệ hoặc chưa có bảng phí", "Có sản phẩm đã ngừng bán", "Có sản phẩm chưa có giá bán (giá ≤ 0): SKU".
- Biểu mẫu dùng chung với biểu mẫu tạo đơn của nhân viên; ô chọn CTV không hiện với bạn (đơn tự tính cho bạn). Lỗi thiếu hàng/chưa có giá/ngừng bán ghi rõ **SKU** (18/11/2026).

---

## 5. Theo dõi đơn

**Đơn của tôi** liệt kê các đơn tính cho bạn (lọc **Tháng** và **Hoa hồng**; trên điện thoại mỗi đơn một thẻ); bấm **mã đơn** để xem **Sản phẩm** (**SL**, **Đơn giá**, **Thành tiền**), **Tiền hàng**, **Phí ship**, **Tổng cộng**, **Khách hàng**, **Địa chỉ**, **Tiến trình** (lịch sử trạng thái); dòng đã trả hiện "đã trả {n}".

Các trạng thái chính: **Chờ xác nhận** → **Chuẩn bị giao** → **Đang giao** → **Hoàn tất**; hoặc **Đã huỷ** / **Trả hàng**. Nội dung gợi ý trên đơn: "Shop sẽ gọi xác nhận rồi giao hàng; bạn theo dõi trạng thái tại đây."

Bạn **chỉ xem**, không sửa/huỷ đơn được. Cần đổi gì, báo cửa hàng.

---

## 6. Hoa hồng và thanh toán

**Cách tính (thông tin 💰)**
- Cơ sở = **tiền hàng khách thực giữ** (đã trừ hàng trả). **Phí ship không tính.**
- Hoa hồng của bạn = **số tiền cố định của từng sản phẩm × số lượng** khách giữ. Sản phẩm cửa hàng chưa đặt hoa hồng thì không có hoa hồng.
- Khách trả hàng thì hoa hồng của đơn đó **giảm tương ứng**.
- Số tiền được **chốt vào đơn lúc đơn tạo**; cửa hàng đổi mức sau đó chỉ áp cho đơn mới.

**Ví dụ (số giả định):** đơn 2 sản phẩm: A × 1 (hoa hồng 5.000/cái), B × 2 (hoa hồng 3.000/cái) → hoa hồng = 5.000 + 2 × 3.000 = **11.000 MMK**.

**Ba trạng thái**
| Trạng thái | Nghĩa |
|---|---|
| **Chờ** | Đơn chưa hoàn tất, hoặc đang trong thời gian chờ đổi/trả |
| **Đến hạn** | Đã qua **{n} ngày** kể từ khi đơn **Hoàn tất** (mặc định 7 ngày) — chờ cửa hàng chuyển ("Đến hạn — chờ shop chuyển") |
| **Đã trả** | Cửa hàng đã chuyển và ghi nhận |
| (Không tính) | Đơn bị huỷ, hoặc trả hàng trước khi hoàn tất |

**Mục Thanh toán** ("Thanh toán hoa hồng"): hiện khoản **Đến hạn**, danh sách **Các lần đã nhận**, và **Thông tin nhận tiền của bạn**. Chưa nhận lần nào thì hiện "Chưa nhận lần nào."

- Cửa hàng chuyển tiền **bên ngoài hệ thống** (ngân hàng, KBZPay, Wave…) rồi bấm **Ghi nhận đã trả**. Hệ thống **không tự chuyển tiền**.
- Một lần chi trả gồm **toàn bộ** khoản đến hạn; đơn đã chi trả không đổi được nữa.
- **Muốn đổi thông tin nhận tiền (số tài khoản…), liên hệ cửa hàng** — bạn không tự sửa được trên cổng.

---

## 7. Tuyến dưới (mời thêm CTV)

Mục **Tuyến dưới** ("Tuyến dưới của bạn"):
1. Sao chép **Link mời làm CTV**, gửi cho người muốn làm CTV.
2. Họ đăng ký ([mục 1](#1-đăng-ký-và-đăng-nhập)); số người chờ duyệt hiện "{n} người đang chờ shop duyệt".
3. Cửa hàng duyệt xong, họ nằm **dưới bạn**. Bạn được thêm một **% tiền hàng trên mỗi đơn họ bán**; khoản này **cửa hàng trả, không trừ vào hoa hồng của họ**.
4. Ở **CTV bạn đã tuyển** thấy tên, ngày tham gia, "Tháng này: {đơn} đơn · {doanh số} MMK".

Các dòng hoa hồng tuyến dưới được liệt kê riêng: **Tuyến dưới — chờ**, **Tuyến dưới — đến hạn**, **Tuyến dưới — đã nhận**. Bạn **chỉ thấy số tổng**; thông tin khách của tuyến dưới được bảo mật.

---

## 8. Tài khoản, ngôn ngữ, đăng xuất

**Tài khoản** hiện tên, email, mã giới thiệu của bạn và:
- **Đổi mật khẩu:** điền **Mật khẩu hiện tại**, **Mật khẩu mới**, **Nhập lại mật khẩu mới** (mật khẩu mới ít nhất **12 ký tự**, khác mật khẩu cũ) → **Đổi mật khẩu**. Các thiết bị khác của bạn bị đăng xuất.
- **Ngôn ngữ:** nút chọn ngôn ngữ cổng CTV (mặc định tiếng Myanmar). Lựa chọn lưu trên trình duyệt đó.
- **Đăng xuất.** Trên điện thoại, ngôn ngữ và đăng xuất **chỉ ở trang Tài khoản** (thanh trên cùng ẩn chúng).

Lỗi đổi mật khẩu: "Mật khẩu hiện tại không đúng"; "Mật khẩu nhập lại không khớp"; "Mật khẩu mới phải khác mật khẩu hiện tại".

---

## 9. Câu hỏi thường gặp

**Quên mật khẩu?** Cổng CTV không có nút "Quên mật khẩu". Liên hệ cửa hàng để được **đặt lại mật khẩu tạm**, đăng nhập rồi đổi.

**Khách đặt mà đơn không tính cho tôi?** Có thể khách bấm link của CTV khác sau bạn, hoặc đã quá 30 ngày, hoặc mã giới thiệu đã bị đổi. Báo cửa hàng; nhân viên có thể gán CTV vào đơn nếu đơn chưa được chi trả hoa hồng.

**Hoa hồng của đơn hiện "Không tính"?** Đơn bị huỷ hoặc trả hàng trước khi hoàn tất.

**Đã quá 7 ngày mà chưa "Đến hạn"?** Thời gian tính từ lúc đơn **Hoàn tất**, không phải lúc đặt hàng; đơn COD chỉ hoàn tất khi hãng giao và đã thu tiền. Số ngày chờ do cửa hàng đặt, có thể khác 7.

**Đã "Đến hạn" mà chưa nhận tiền?** Cửa hàng chuyển theo từng đợt; liên hệ cửa hàng. Khi đã nhận, đơn chuyển sang **Đã trả** và có trong **Các lần đã nhận**.
