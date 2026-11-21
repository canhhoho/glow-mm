# Kế hoạch sửa Storefront theo audit (21/11/2026)

Nguồn: bảng audit 18 mục của Codex, đã **đối chiếu lại với code ngày 21/11/2026**. Mỗi việc dưới đây đủ nhỏ để giao riêng, làm xong chạy test của việc đó rồi commit riêng. Quy tắc chung: làm trên `dev`, không push/merge/deploy khi chưa được yêu cầu; chuỗi giao diện ở `messages/store.{my,en,vi}.json` (đủ 3 ngôn ngữ, thêm key `my` vào `messages/review-my.json`); mọi action phải validate Zod + kiểm quyền phía server; thêm test E2E cho hành vi đổi; cập nhật `docs/ban-do-nghiep-vu-admin.md` / hướng dẫn nếu hành vi đổi. Báo test đủ 4 dòng Đạt / Lỗi / Bỏ qua / Không chạy.

## 1. Kết quả kiểm tra lại

| # | Mục audit | Trạng thái | Ghi chú đối chiếu code |
|---|---|---|---|
| 01 | Giỏ: Checkout không lưu số lượng | ✅ **Xong** (commit `0278beb`) | `saveCartAction`, nút Thanh toán là submit; `tests/e2e/cart-quantity.spec.ts` |
| 02 | Checkout: giá đổi không báo khách | ✅ **Xong** (gói A1) | `expectedTotalMmk` đối chiếu tổng hiện hành, chặn tạo đơn và yêu cầu xác nhận khi đổi giá |
| 03 | Checkout: hết hàng → tự thành Pre-order | ✅ **Xong** (gói A2) | `expectedPreorder` đối chiếu cờ preorder, chặn tạo đơn và yêu cầu xác nhận khi hết hàng chuyển Pre-order |
| 04 | Không thấy liên hệ Viber/Messenger | ⚠️ Code đã có, **thiếu cấu hình** | `ContactLinks` có ở footer, trang SP, checkout, trang đơn nhưng ẩn khi `VIBER_CHAT_URI`/`FB_PAGE_USERNAME` trống. Việc của chủ shop: điền env production (không sửa code) |
| 05 | Bắt buộc đăng nhập trước checkout | 🚫 **Đóng** — chủ shop chốt 21/11/2026: khách phải đăng nhập | Giữ P14c |
| 06 | Pre-order chưa có thời gian dự kiến | ✅ **Xong** (gói C1) | Sửa Product.preorderNote, Cart.preorderLine/preorderNotice, Checkout.preorderNotice, Order.preorderInfo thành dự kiến 1–2 tuần ở 3 ngôn ngữ |
| 07 | Chưa có phí/thời gian giao tham khảo | ✅ **Xong** (gói D1) | Trang Info (giao hàng) và Address.shippingNote nêu rõ nguyên tắc tiền hàng trả shop, phí ship khách trả trực tiếp cho hãng vận chuyển; phí và thời gian tuỳ vùng |
| 08 | Nội dung biên lai mâu thuẫn | ✅ **Xong** (gói B1) | Đồng bộ chính sách chuyển khoản không cần biên lai ở Checkout.bankHint, Info.payment, Checkout.err.proof_not_allowed |
| 09 | Dior Velvet 100 thiếu ảnh | ❌ Chưa — **dữ liệu, không phải code** | Admin tải ảnh ở trang sản phẩm |
| 10 | Pre-order chuyển khoản: chưa nói khi nào trả tiền | ✅ **Xong** (gói B2) | Trang đơn AWAITING_STOCK hiện ngay thông tin ngân hàng + thông báo chuyển khoản ngay hoặc COD khi hàng về |
| 11 | Banner Shop Now không có link | ⚠️ Một phần | Banner ảnh có `href` tuỳ chọn (admin nhập); khi trống thì không bấm được. Banner tĩnh (`HeroBanner`) đã có link `/search` |
| 12 | Quên mật khẩu: không có thời gian xử lý | ✅ **Xong** (gói D3) | Quên mật khẩu qua SĐT đổi ngay, huỷ mọi phiên cũ, rate limit (3/ngày/SĐT, 5/giờ/IP); admin thấy danh sách theo dõi 7 ngày + nút "Đã kiểm tra" / "Khoá" (`server/accounts/password-reset.ts`, `/admin/customer-accounts`) |
| 13 | Hai ô tìm kiếm | ✅ **Xong** (gói E1) | Ẩn ô tìm kiếm thừa trong trang trên mobile, header đồng bộ `q` trên desktop và mobile |
| 14 | Tìm kiếm rỗng thiếu lối đi | ✅ **Xong** (gói E1) | Kết quả tìm kiếm rỗng ẩn phân trang/`pageCount`, thêm nút "Xoá bộ lọc" và lối về trang chủ |
| 15 | Chính sách đổi trả cụ thể | ✅ **Xong** (gói D2) | `Info.returns` quy định 7 ngày đổi trả, shop chịu phí hoàn hàng |
| 16 | Đổi ngôn ngữ giữ `next` cũ | ✅ **Xong** (gói E2) | `language-switch.tsx` đổi tiền tố locale trong param `next` an toàn |
| 17 | Tương phản chữ trắng/hồng | ✅ **Xong** (gói F1) | Thêm `--brand-dark: #be354d` (đạt 5,47:1 với trắng, 5,21:1 với kem); áp dụng cho nút chính, giá, sao, link, nhãn |
| 18 | Trang chủ lặp sản phẩm | ❌ Chưa | Phụ thuộc số SP; ưu tiên thấp |

## 2. Quyết định của chủ shop (21/11/2026)

- **Q1:** khách **phải đăng nhập** mới đặt hàng → đóng mục 05 (bỏ C2).
- **Q2:** Pre-order giao trong **1–2 tuần**. Khách **chuyển khoản ngay hoặc COD khi hàng về đều được**. Quên mật khẩu **tự động xử lý**, chỉ cần **báo cho admin** biết khách vừa đổi mật khẩu.
- **Q3:** phí và thời gian ship theo vùng; **khách tự trả phí ship** cho hãng vận chuyển. [CẦN XÁC MINH] Bảng số tiền/số ngày cụ thể theo vùng chưa có → D1 chỉ viết nguyên tắc, không bịa con số.
- **Q4:** đổi trả **shop chịu phí hoàn hàng**. [CẦN XÁC MINH] Số ngày được đổi trả chưa có → D2 giữ chỗ cho số ngày, hỏi lại trước khi viết.
- **Q5 (không cần code, chủ shop tự làm):** điền `VIBER_CHAT_URI` / `FB_PAGE_USERNAME` trên production; tải ảnh Dior (09); gắn link cho banner ở Admin (11).

## 3. Các gói việc (giao Antigravity theo thứ tự)

Mỗi gói độc lập; phụ thuộc ghi rõ. Gói **A** là rủi ro tiền → làm trước, cần E2E mobile + desktop.

### A1 — Giá đổi → khách xác nhận lại (audit 02) · P1 · cần: không
- Form checkout gửi thêm `expectedTotalMmk` (tổng khách đang thấy; tính từ `getCartDetails`, không tin client cho việc ghi giá — chỉ để so).
- `placeOrderAction`: trước `createOrder`, tính lại tổng hiện hành; khác → **không tạo đơn**, trả `{ priceChanged: true, newTotal }` và hiển thị tổng mới + nút "Xác nhận đặt hàng" (gửi lại với tổng mới).
- Không đổi `createOrder` (giữ idempotencyKey). Chuỗi mới ở `Checkout.priceChanged*`.
- Test: integration (đổi giá giữa lúc xem và đặt → không tạo đơn, trả tổng mới); E2E đổi giá bằng DB giữa hai bước.
- File: `src/server/cart/actions.ts`, `src/components/store/checkout-form.tsx`, `src/app/[locale]/checkout/page.tsx`.

### A2 — Chuyển sang Pre-order → khách xác nhận lại (audit 03) · P1 · cần: A1 (dùng chung cơ chế xác nhận)
- Form gửi `expectedPreorder` (giỏ đang hiển thị có dòng Pre-order hay không).
- Khi server xác định đơn sẽ là `AWAITING_STOCK` mà khách chưa thấy Pre-order → trả `{ needsPreorderConfirm: true }`, không tạo đơn; hiện thông báo + nút xác nhận.
- Test: giữ hàng tạm (như `preorder.spec.ts`) sau khi mở checkout rồi đặt → phải hỏi lại, xác nhận mới ra đơn `AWAITING_STOCK`.

### B1 — Đồng bộ nội dung thanh toán/biên lai (audit 08) · P1 · cần: không
- Quy trình hiện hành = **không cần biên lai** (theo trang đơn). Sửa `Checkout.bankHint`, chính sách thanh toán (`Info`), `err.proof_not_allowed` cho đúng; không khôi phục tải biên lai. Cả vi/en/my + `review-my.json`.
- Test: grep không còn "biên lai/receipt/ảnh chuyển khoản" mâu thuẫn trong `store.*.json`; E2E trang đơn chuyển khoản.

### B2 — Nói rõ thanh toán với đơn Pre-order (audit 10) · P2 · cần: không
- Trang đơn `AWAITING_STOCK` + `BANK_TRANSFER`: hiện thông tin tài khoản ngân hàng **ngay** (như đơn `PENDING`) kèm câu "Bạn có thể chuyển khoản ngay; hàng về trong 1–2 tuần". `AWAITING_STOCK` + `COD`: "Thanh toán khi nhận hàng, sau khi hàng về".
- Kiểm `bankConfirmation` (không cần biên lai) vẫn đúng với đơn chờ hàng; đối soát tiền dùng luồng sẵn có, không thêm trạng thái.
- Test: E2E đơn thử Pre-order chuyển khoản.

### C1 — Thời gian Pre-order dự kiến (audit 06) · P1 · cần: không
- Sửa câu Pre-order có sẵn (`Product.preorderNote`, `Cart.preorderLine`/`preorderNotice`, `Checkout.preorderNotice`, `Order.preorderInfo`) thành "hàng về dự kiến **1–2 tuần**", 3 ngôn ngữ. Chỉ sửa chuỗi, **không** thêm cột DB/cài đặt.
- Test: E2E hiển thị ở 3 chỗ.

### D1 — Nói rõ phí ship (audit 07) · P1 · cần: không (bảng số liệu: chờ chủ shop)
- Trang `Info` (giao hàng) + dòng ở checkout/giỏ (`Address.shippingNote`): ghi rõ **tiền hàng trả cho shop, phí ship khách trả cho hãng vận chuyển khi nhận; phí và thời gian tuỳ vùng**. Không tính ship trên đơn.
- Không tự điền bảng phí/số ngày. Khi chủ shop gửi bảng thì thêm vào `Info` sau.

### D2 — Chính sách đổi trả cụ thể (audit 15) · P2 · cần: số ngày đổi trả
- Sửa `Info.returns` (3 ngôn ngữ): **shop chịu phí hoàn hàng**; điều kiện giữ như hiện tại (hàng đã mở chỉ đổi khi lỗi). Số ngày: hỏi chủ shop trước khi viết, không tự đặt.

### D3 — Quên mật khẩu qua SĐT tự động + báo admin (audit 12) · P1 · cần: duyệt biện pháp an toàn (xem dưới)
- Hiện tại: khách nhập SĐT + mật khẩu mới → `PasswordResetRequest` chờ admin duyệt ở `/admin/customer-accounts`. Đổi thành: **áp dụng ngay** (dùng lại hàm duyệt sẵn có trong `server/accounts/password-reset.ts`, ghi `decidedById = null`/trạng thái tự động), huỷ mọi phiên đăng nhập cũ của tài khoản, ghi audit; admin thấy danh sách "khách vừa đổi mật khẩu" (dùng lại bảng sẵn có thành nhật ký + badge đếm mới) và có nút **khoá/hoàn tác** khi nghi ngờ.
- ⚠️ **Rủi ro bảo mật [cần chủ shop duyệt]:** không có OTP → ai biết SĐT của khách cũng đổi được mật khẩu và vào tài khoản (xem địa chỉ, lịch sử đơn). Biện pháp tối thiểu đề xuất, chọn ít nhất một: (a) bắt nhập **mã một đơn đã đặt** của SĐT đó (như trang tra đơn) khi tài khoản đã có đơn; (b) giới hạn số lần theo IP + theo SĐT (`hitRateLimit`); (c) giữ nguyên chờ duyệt cho tài khoản CTV. Luôn có (b).
- Luồng quên mật khẩu qua email (gửi link) giữ nguyên.
- Test: integration (đổi ngay, phiên cũ bị huỷ, giới hạn lần, nhật ký admin); E2E khách đổi mật khẩu rồi đăng nhập được. Đụng auth → **rủi ro cao**, cần full E2E trước khi merge `main`.

### E1 — Tìm kiếm gọn (audit 13, 14) · P2 · cần: không
- Trang `/search`: chỉ giữ một ô (ô header đồng bộ `q`, hoặc bỏ ô trong trang trên mobile). Kết quả rỗng: ẩn `pageCount`, thêm nút "Xoá bộ lọc" và lối về danh mục / trang chủ.
- Test: E2E mobile + desktop (ô tìm = 1 hoặc cùng giá trị; trang rỗng có lối đi).

### E2 — Đổi ngôn ngữ giữ đúng đích `next` (audit 16) · P2 · cần: không
- `language-switch.tsx`: khi query có `next` là đường dẫn nội bộ, đổi tiền tố locale của `next` theo ngôn ngữ mới (dùng lại `localePrefix`/`hasLocale`; chỉ chấp nhận đường dẫn bắt đầu `/`, chặn `//` và URL ngoài).
- Test: unit cho hàm đổi `next` (kể cả đầu vào độc hại) + E2E MY→EN ở `/register?next=…`.

### F1 — Tương phản màu (audit 17) · P2 · cần: không
- Thêm token màu đậm hơn (đạt ≥ 4,5:1 với chữ trắng và với nền trắng cho giá) trong `globals.css`; dùng cho nút/giá/chữ nhỏ, giữ `--brand` cho trang trí. Không hardcode màu. Đối chiếu bằng công thức tỷ lệ tương phản, ghi giá trị vào commit.
- Component dùng chung → chạy spec mọi trang storefront (mobile + desktop) và xem ảnh chụp.

### F2 — Banner có link (audit 11) · P2 · cần: Q5
- Code đã hỗ trợ `href`. Việc: ở Admin banner, cảnh báo/đánh dấu banner không có link; (tuỳ chọn) mặc định `/search` khi trống. Không cần sửa nếu chủ shop tự điền link.

### G1 — Trang chủ bớt lặp (audit 18) · P3 · cần: không
- Ẩn dải trùng khi tổng SP ít (< ngưỡng), giữ cấu trúc khi catalog lớn.

### Việc không phải code (ghi để theo dõi)
- 04: điền env Viber/Messenger production; 09: ảnh Dior; 11: link banner.

## 4. Thứ tự đề xuất và nghiệm thu

1. A1 → A2 (tiền/đơn) → B1 → B2 → C1 → D1 → E2 → E1 → F1 (đã đủ thông tin).
2. D3 sau khi chủ shop chọn biện pháp an toàn; D2 sau khi có số ngày đổi trả.
3. F2, G1 khi rảnh.

Mỗi gói: `npm run check` + spec bị ảnh hưởng (mobile + desktop khi đụng giao diện dùng chung). Gói A1/A2 (checkout, đơn) và D3 (auth) coi là **rủi ro cao**: cần full E2E xanh trước khi merge `main`. Claude kiểm từng commit trước khi push; push/PR chỉ khi người dùng yêu cầu.
