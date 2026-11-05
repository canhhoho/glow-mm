# Nghiệm thu D4–D9 — 05/11/2026

Phạm vi: code và database local/test. Chưa push/merge/cập nhật production; chưa xác minh được CI GitHub của bản bàn giao. Lần kiểm tra lại GitHub Actions API công khai trả 404; chưa có quyền đọc CI qua kết nối được cấu hình. Không đọc script chứa thông tin đăng nhập để lấy token. Tài liệu này ghi kết quả tự động và những điều kiện còn mở, không thay chữ ký nghiệm thu vận hành.

## Quyết định của chủ shop

- Ngoại lệ COD: thực nhận + phí hãng + giảm thu = COD gốc; giảm thu và lý do lưu riêng, không suy từ số hàng trả.
- Giữ chính sách hoa hồng CTV hiện tại; không thêm gate `affiliate.requireCodRemitted`.
- Chuyến hàng tiếp tục tùy chọn khi tạo lô mới. Dùng lại lô đã thuộc chuyến thì phải chọn đúng chuyến; muốn gắn lô chưa chuyến dùng thao tác rõ ràng trên trang chuyến hàng.

## Đã triển khai

| Phần | Kết quả |
|---|---|
| D4 | Người trả cước trên đơn/VTP/nhãn, COD theo tuổi nợ và đóng ngoại lệ, lợi nhuận sau phí đã ghi nhận |
| D5 | Sự kiện nội bộ, whitelist/rate limit/giới hạn dung lượng, không nhận tên/SĐT/email/địa chỉ từ client và bỏ query, session UUID, mốc nghiệp vụ chống trùng gắn orderId nội bộ, phễu tuần tự theo thiết bị, p75, cleanup và cờ tắt |
| D6.1 | Lỗi theo ô, giữ form, cuộn/focus; lỗi hàng kèm SKU khi xác định được; tiền/phí/liên hệ gần nút đặt; nói rõ tạo đơn chưa xác nhận thanh toán |
| D7 | Sắp toàn tập theo MIN giá active, phân trang/count thật, giữ bộ lọc trên URL, bộ sưu tập có phân trang, gallery thumbnail/bàn phím/vuốt |
| D8.1–D8.2 | Theo kg lượng RECEIVE POSTED kể cả tester, lịch sử/fingerprint/trạng thái stale, gắn lô rõ ràng và chặn sai chuyến |
| DT.3 | Sửa hãng/mã vận đơn sau bàn giao với quyền và audit, không đổi trạng thái/tồn |
| DT.5 | Tính giá theo variantIds hoặc phiếu nhập POSTED; giao bộ lọc, không lùi về toàn kho khi phạm vi sai/rỗng |
| DT.6 | Lọc ngày Yangon/kho bán, 50 đơn/trang và tổng thật; dashboard đơn đang giao từ 7 ngày, bộ lọc chỉnh số ngày |
| D3, D2 còn dở | Hiện manifest trên đơn; cảnh báo phiếu soạn liên quan trước xuất/chuyển nội bộ. Preview cảnh báo đổi giá ≥20%, lãi minh họa sau hoa hồng mặc định và cước ≤5% giá bán; không thay chính sách hoặc tự chặn áp giá |

## Kiểm tra tự động

Lần `npm test` toàn bộ trên bản cuối đã **đạt, exit 0**: **46 tệp unit / 217 ca**, **37 tệp integration / 176 ca**, **102 E2E mobile/desktop** (8,4 phút E2E). Cả 28 migration được áp thành công từ database trống trước khi seed và E2E. Lint, typecheck và build đạt. Trước đó đã kiểm tra các thay đổi trên DB local/test đang có dữ liệu; các lỗi tìm thấy trong lần kiểm tra trước được mô tả bên dưới.

Môi trường kiểm tra cuối: PostgreSQL 17 native riêng tại localhost:15433, database `glow_test`, thư mục dữ liệu thử `storage-test/pg-d9-56844bd2`; đã dừng sau kiểm tra. Database Docker mặc định localhost:15432 không kết nối được khi tiếp tục phiên nên không dùng cho lần cuối. Không thay `.env`/`.env.test`, không thay database hay dịch vụ PostgreSQL khác trên máy. Muốn chạy dev với cấu hình mặc định cần khởi động lại database Docker.

Các ca riêng đã đạt: D4 admin-orders/cod-exception/dashboard-reports; D5 hành trình và CSP; D6.1 COD/chuyển khoản/lỗi SĐT giữ form; D7 phân trang 65 SP/back-forward và đổi ảnh; D8 nhập→phân bổ theo kg→đổi phí báo stale. Các kiểm thử DT riêng đạt 14 ca cùng picking/pricing/reports.

## Đối chiếu T01–T21

Đây là bằng chứng tự động trên DB thử; các mục có điều kiện được ghi riêng.

| Ca | Bằng chứng / giới hạn |
|---|---|
| T01 | `pricing-provenance`, `pricing`: không dùng nguồn nhập nháp/hủy |
| T02 | `opening-workflow`, `readiness`, `orders`; E2E catalog/pricing/storefront-orders |
| T03–T04 | `estimated-cost`: vốn tạm/thiếu, giữ snapshot và cảnh báo báo cáo |
| T05 | `pricing`, `warehouses`: LOCAL_MMK |
| T06 | `orders`, `picking`: combo và thành phần, giới hạn tồn |
| T07 | `inventory`, `stock-overview`, `store-stock`: hạn/UNKNOWN/tester |
| T08 | `orders`: hai request bàn giao; `picking`: stale/lô bị lấy mất, rollback |
| T09 | `warehouses`: đơn hai kho, một phiếu xuất mỗi kho |
| T10 | `orders`; E2E storefront-orders/admin-orders: xác nhận chuyển khoản thực nhận |
| T11 | COD hoàn tất/chưa đối soát vẫn tách riêng. Điều kiện hoa hồng mới không áp dụng vì chủ shop chọn giữ chính sách cũ |
| T12 | `cod-settlement`, `reports`: tổng khớp, phí không tăng doanh thu |
| T13 | `returns`, `affiliates`: đúng lô, chờ kiểm, khoản âm bù trừ |
| T14 | Phần tài khoản/giữ giỏ/claim có kiểm thử; guest COD chưa làm theo điều kiện hai tuần dữ liệu thật |
| T15 | `pricing-provenance`: đầu vào thay đổi/preview hết hạn/áp từng dòng |
| T16 | `catalog-pagination` 65 SP/bộ sưu tập; E2E giữ URL/back-forward |
| T17 | `cleanup`, `orders`, `picking`: quá hạn/hủy/manifest không còn dùng |
| T18 | `analytics` whitelist/chống trùng/phễu/p75/retention; E2E analytics/cache/CSP |
| T19 | `bulk-orders`: từng đơn một transaction, dòng lỗi độc lập |
| T20 | Chưa làm nhập file VTP: thiếu mẫu thật cho vận đơn và đối soát |
| T21 | `opening-workflow`, `orders`: giá 0 bị từ chối ở domain |

## Hiệu năng và phần còn mở

Lighthouse local trước sửa font, lấy lượt có điểm trung vị trong 3 lượt (home/product/category): mobile **97/96/93**, desktop **100/100/100**, Slow 3G **69/71/72**. Sau sửa font và cleanup fixture, đo lại trang chủ Slow 3G ba lượt: **trung vị 72**, dải **67–73**, FCP 2453 ms, LCP 7253 ms, TBT 93 ms, CLS 0 trong lượt được chọn. Đạt cổng trung vị 70 của script; không có bảo đảm mọi lượt vượt 70. Báo cáo thô nằm ở `lighthouse-reports/` (không commit). Hai lần đo khác dữ liệu thử do cleanup; không suy mức cải thiện chuyển đổi từ số đo này, chưa có số liệu người dùng production.

Đã phát hiện hai định nghĩa `localFont` cùng tên `myanmarFont` sinh cùng font-family trong Next 16; CSS gộp còn đưa font admin vào preload storefront. Đã tách `storeMyanmarFont` / `staffMyanmarFont` và đặt `preload: false` cho font staff. E2E xác nhận storefront không yêu cầu file weight 500; admin/CTV giữ font riêng. Script perf thêm bộ lọc trang/profile để đo lại đúng phạm vi, mặc định vẫn đo toàn bộ.

## Điều tra lỗi trong nghiệm thu

Áp dụng quy trình `gs:investigate`: thu bằng chứng → kiểm giả thuyết → sửa tối thiểu → kiểm lại. Bootstrap của skill không chạy được do Python trên máy là WindowsApps alias không truy cập được; áp dụng phương pháp trực tiếp, không thay cấu hình công cụ ngoài repo.

- **Dashboard lỗi P2028:** `alerts/loadVariantStock` bọc hai truy vấn chỉ đọc trong interactive transaction mặc định 5 giây. READ COMMITTED cũ không cung cấp snapshot xuyên hai SELECT. Ca `alerts-slow-read` khóa đọc bảng tồn trên DB test hơn 5 giây: bản cũ thất bại ở truy vấn reservation trên transaction đã hết hạn. Bỏ transaction chỉ đọc, giữ nguyên cách tính khả dụng; cùng ca đã đạt và kết quả cảnh báo cũ vẫn đạt. Không đổi transaction ghi kho/đơn.
- **Header dashboard chờ số liệu:** sau khi hết P2028, ca đổi mật khẩu vẫn phát hiện phần vai trò chưa hiện trong 5 giây. PageHeader chờ Promise.all gồm cảnh báo/báo cáo; truy vết thêm phát hiện layout cha cũng chờ số đếm tồn trên menu. Ca `dashboard-streaming` giữ khóa bảng tồn và yêu cầu vai trò hiện trong 2 giây đã thất bại trên bản cũ. Tách ba nhóm số liệu và badge menu sang các Server Component trong Suspense; khung trang chỉ chờ phiên/quyền/bản dịch. Ca giữ khóa tồn đã đạt; cả 7 E2E liên quan (đổi mật khẩu, báo cáo/phân quyền, menu mobile/desktop) đạt.
- **Menu desktop không bấm được danh mục seed:** trace cho thấy menu chứa nhiều danh mục fixture cũ; có test đổi slug nên cleanup chỉ theo slug `it-*` bỏ sót. Teardown integration giờ gỡ đăng mọi SP thuộc kho `IT-*` do fixture tạo, không xóa lịch sử hay dữ liệu seed. E2E menu và cả bốn ca storefront desktop đã đạt sau cleanup.
- **Ca tạo/khóa nhân viên quá 30 giây:** trace cho thấy các xác nhận nghiệp vụ đều đạt, quá hạn ở dọn context thứ hai. Ca dài dùng 60 giây như các ca nhiều bước khác; giữ nguyên mọi xác nhận quyền và thu hồi phiên. Cả ba ca users và ca customer-accounts desktop đã đạt khi chạy lại, không còn P2028 dashboard trong lần này.
- **Phạm vi chọn đơn hàng loạt:** ca mới giữ một ô đã chọn nhưng ẩn như DOM Next Activity của trang trước. Bản cũ đếm 2 đơn dù danh sách đang hiện chỉ chọn 1. Đã lọc ô có hình học đang hiển thị và reset thanh chọn khi đổi bộ lọc/trang; ca hồi quy xác nhận đếm đúng 1 và URL in nhãn chỉ chứa đơn đang chọn đã đạt trong bộ 102 E2E.
- **Chẩn đoán analytics:** một log `analytics.write_failed` xuất hiện trong lần chạy toàn tuyến; các ca hành trình/whitelist/chống trùng vẫn đạt. Thêm mã/loại lỗi vào log để phân biệt nguyên nhân nếu lặp, không ghi message/query/request; unit test ép lỗi DB xác nhận trả 503 và không lộ nội dung. Cần theo dõi log này khi vận hành, không suy rằng mọi sự kiện trình duyệt đều đã được ghi.

## Điều kiện còn mở

- **D6.2:** chờ ≥2 tuần D5 trên production; đánh giá cả xác nhận/giao thành công/hủy/đơn trùng trước khi quyết guest COD.
- **DT.3 nhập file và DT.4:** chờ file VTP thật; không suy cấu trúc tiền/đối soát từ file xuất mẫu.
- **D8.3:** chờ D0 production cho thấy cần tách số lô NSX/đợt nhập và chủ shop duyệt.
- **D9 production:** cần CI xanh, backup/khôi phục thử, triển khai được duyệt, tải baseline D0 trước/sau, kiểm cron/log. Chưa thực hiện các thao tác này.
- Chuỗi Myanmar mới được đưa vào `messages/review-my.json`; các nhãn quản trị tạm tiếng Anh cần người bản ngữ duyệt. Quy định thời hạn dữ liệu Myanmar **[CẦN XÁC MINH]**.

## Bàn giao vận hành

Migration mới gồm vốn tạm, provenance D1, manifest D3, COD/người trả cước D4, analytics D5, lịch sử/BY_WEIGHT D8. Đã áp local/test, không reset dữ liệu. Runbook cập nhật server: `docs/lenh-trien-khai-tandcstore.md`, PHẦN 4.

Sau phát hành: kiểm `/api/health`; admin xem COD/analytics/data-health, tải JSON baseline D0; kiểm cleanup với Bearer secret qua kênh vận hành có sẵn, không in secret; kiểm log lỗi sự kiện. Analytics tắt bằng `ANALYTICS_ENABLED=false`; lịch sử vẫn đọc được và cleanup vẫn chạy theo `ANALYTICS_RETENTION_DAYS` (mặc định 180).

Quay lui phải dùng app hiểu dữ liệu đã ghi: đặc biệt BY_WEIGHT, người trả cước SENDER và ngoại lệ COD. App cũ có thể đọc sai cách phân bổ hoặc xuất nhãn/cước sai dù schema thêm mới không phá bảng. Không tự đổi phương pháp/chuyến hay xóa trường để chạy app cũ; ưu tiên bản sửa tương thích.
