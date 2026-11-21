# Kế hoạch sửa Storefront theo audit (21/11/2026)

Nguồn: bảng audit 18 mục của Codex, đã **đối chiếu lại với code ngày 21/11/2026**. Mỗi việc dưới đây đủ nhỏ để giao riêng, làm xong chạy test của việc đó rồi commit riêng. Quy tắc chung: làm trên `dev`, không push/merge/deploy khi chưa được yêu cầu; chuỗi giao diện ở `messages/store.{my,en,vi}.json` (đủ 3 ngôn ngữ, thêm key `my` vào `messages/review-my.json`); mọi action phải validate Zod + kiểm quyền phía server; thêm test E2E cho hành vi đổi; cập nhật `docs/ban-do-nghiep-vu-admin.md` / hướng dẫn nếu hành vi đổi. Báo test đủ 4 dòng Đạt / Lỗi / Bỏ qua / Không chạy.

## 1. Kết quả kiểm tra lại

| # | Mục audit | Trạng thái | Ghi chú đối chiếu code |
|---|---|---|---|
| 01 | Giỏ: Checkout không lưu số lượng | ✅ **Xong** (commit `0278beb`) | `saveCartAction`, nút Thanh toán là submit; `tests/e2e/cart-quantity.spec.ts` |
| 02 | Checkout: giá đổi không báo khách | ❌ Chưa | `placeOrderAction`/`createOrder` lấy giá hiện hành; không có tổng khách đã thấy để đối chiếu |
| 03 | Checkout: hết hàng → tự thành Pre-order | ❌ Chưa | `planOrderStock` quyết định phía server; form không gửi "khách đang mua hàng có sẵn" |
| 04 | Không thấy liên hệ Viber/Messenger | ⚠️ Code đã có, **thiếu cấu hình** | `ContactLinks` có ở footer, trang SP, checkout, trang đơn nhưng ẩn khi `VIBER_CHAT_URI`/`FB_PAGE_USERNAME` trống. Việc của chủ shop: điền env production (không sửa code) |
| 05 | Bắt buộc đăng nhập trước checkout | ❌ Chưa — **cần quyết định nghiệp vụ** | Đang là quy tắc cố ý (P14c); chưa được duyệt bỏ |
| 06 | Pre-order chưa có thời gian dự kiến | ❌ Chưa | Chỉ có câu "giao khi hàng về" |
| 07 | Chưa có phí/thời gian giao tham khảo | ❌ Chưa | Chỉ có `Address.shippingNote` |
| 08 | Nội dung biên lai mâu thuẫn | ❌ Chưa | Trang đơn: "Không cần gửi biên lai" (`Order.bankConfirmation`); nhưng `Checkout.bankHint` và `Info.…` (chính sách thanh toán, `store.*.json` ~dòng 241) vẫn bảo tải biên lai |
| 09 | Dior Velvet 100 thiếu ảnh | ❌ Chưa — **dữ liệu, không phải code** | Admin tải ảnh ở trang sản phẩm |
| 10 | Pre-order chuyển khoản: chưa nói khi nào trả tiền | ❌ Chưa | `Order.preorderInfo` không nhắc thanh toán; khối ngân hàng chỉ hiện khi `PENDING` |
| 11 | Banner Shop Now không có link | ⚠️ Một phần | Banner ảnh có `href` tuỳ chọn (admin nhập); khi trống thì không bấm được. Banner tĩnh (`HeroBanner`) đã có link `/search` |
| 12 | Quên mật khẩu: không có thời gian xử lý | ❌ Chưa | Chỉ thêm chữ + liên hệ |
| 13 | Hai ô tìm kiếm | ❌ Chưa | `search/page.tsx` có ô riêng + ô ở header |
| 14 | Tìm kiếm rỗng thiếu lối đi | ❌ Chưa | `Search.empty` + `pageCount` vẫn hiện |
| 15 | Chính sách đổi trả mơ hồ | ❌ Chưa — **cần số ngày/ai chịu phí từ chủ shop** | `Info.returns` |
| 16 | Đổi ngôn ngữ giữ `next` cũ | ❌ Chưa | `language-switch.tsx` giữ nguyên query; `next=/checkout` không đổi locale |
| 17 | Tương phản chữ trắng/hồng | ❌ Chưa | `--brand: #e8657a` + chữ trắng ≈ 3,19:1 (`globals.css`) |
| 18 | Trang chủ lặp sản phẩm | ❌ Chưa | Phụ thuộc số SP; ưu tiên thấp |

## 2. Việc cần chủ shop quyết định / cung cấp trước (chặn việc liên quan)

- **Q1 (chặn C2):** cho khách vãng lai đặt COD không? (đề xuất audit; đang bắt đăng nhập.) Nếu "không" → bỏ C2.
- **Q2 (chặn D1, C2):** thời gian Pre-order dự kiến thực tế (vd 7–14 ngày?) và có chuyển khoản ngay hay chờ hàng về.
- **Q3 (chặn D3):** bảng phí + thời gian ship theo vùng thực tế.
- **Q4 (chặn D4):** số ngày đổi trả và ai chịu phí hoàn hàng.
- **Q5 (không cần code):** điền `VIBER_CHAT_URI` / `FB_PAGE_USERNAME` trên production; tải ảnh Dior (09); gắn link cho banner ở Admin (11).

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

### B2 — Nói rõ thanh toán với đơn Pre-order chuyển khoản (audit 10) · P2 · cần: Q2
- Trang đơn `AWAITING_STOCK` + `BANK_TRANSFER`: ghi "Chưa cần chuyển tiền / chuyển khi chúng tôi báo hàng về" (theo Q2). Chuẩn bị sẵn hiển thị khối ngân hàng khi đơn chuyển sang `PENDING`.
- Test: E2E đơn thử Pre-order chuyển khoản.

### C1 — Thời gian Pre-order dự kiến (audit 06) · P1 · cần: Q2
- Hiện câu cố định theo cấu hình ("thường X–Y ngày, cửa hàng xác nhận trước khi bạn thanh toán") ở trang SP, giỏ, checkout. Nếu muốn theo SP: thêm trường cài đặt ở Admin (Cài đặt) — hỏi trước khi thêm cột DB.
- Test: E2E hiển thị ở 3 chỗ.

### C2 — Khách vãng lai (audit 05) · P1 · cần: **Q1** — chỉ làm nếu được duyệt
- Phạm vi lớn (auth, claim đơn, analytics, rate limit) → tách kế hoạch riêng, **không** làm chung gói này. Nếu Q1 = "không": đóng mục.

### D1 — Phí/thời gian giao tham khảo (audit 07) · P1 · cần: Q3
- Bảng tham khảo theo vùng trong `Info` (shipping) + dòng tóm tắt ở checkout; ghi rõ khoản trả cửa hàng / trả courier. Chỉ nội dung, không tính ship trên đơn.

### D2 — Chính sách đổi trả cụ thể (audit 15) · P2 · cần: Q4
- Sửa `Info.returns` (3 ngôn ngữ) với số ngày, điều kiện, ai chịu phí.

### D3 — Quên mật khẩu: thời gian + liên hệ (audit 12) · P2 · cần: Q2/Q5
- Thêm "Cửa hàng xử lý trong X giờ làm việc" + `ContactLinks` vào `forgot-password` (khi có cấu hình).

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

1. A1 → A2 (tiền/đơn) → B1 → E2 → E1 → F1 (không cần quyết định).
2. B2, C1, D1–D3 sau khi chủ shop trả lời Q2–Q4.
3. C2 chỉ khi Q1 được duyệt.

Mỗi gói: `npm run check` + spec bị ảnh hưởng (mobile + desktop khi đụng giao diện dùng chung). Gói A1/A2 (checkout, đơn) coi là **rủi ro cao**: cần full E2E xanh trước khi merge `main`. Claude kiểm từng commit trước khi push; push/PR chỉ khi người dùng yêu cầu.
