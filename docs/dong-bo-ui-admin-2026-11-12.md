# Đồng bộ UI Admin — checklist (12/11/2026)

Chuẩn: Tổng quan, Danh sách SP, Chi tiết SP (kế hoạch nằm trong thư mục kế hoạch của phiên làm việc).
Quy ước ô: `☐` chưa làm/kiểm · `✔` đã làm và kiểm đúng nội dung cột · `—` không áp dụng. **Chỉ đánh ✔ sau khi thật sự kiểm.**

| Nhóm | Trang / thành phần | Đã sửa mã | Mở trình duyệt desktop | Mobile | Bàn phím | Test |
|---|---|---|---|---|---|---|
| 1 Kit + chuẩn | /admin (Tổng quan) | ✔ | ✔ | ✔ | ✔ | ↓ ghi chú |
| 1 Kit + chuẩn | /admin/products (danh sách, menu ⋯ hàng/tạo, thanh hàng loạt) | ✔ | ✔ | ✔ | ✔ | ↓ ghi chú |
| 1 Kit + chuẩn | /admin/products/[id] (chi tiết, ảnh, bước 1–5) | ✔ | ✔ | ✔ | ✔ | ↓ ghi chú |
| 1 Kit + chuẩn | Khung chung: error.tsx, not-found, ActionMenu, Segmented, PageNumbers (loading.tsx đã bỏ) | ✔ | ✔ | ✔ | ✔ | ↓ ghi chú |
| 2 Đơn hàng | /admin/orders (+ thanh hàng loạt bulk-order-bar) | ✔ | ✔ | ✔ | ✔ | ↓ ghi chú |
| 2 Đơn hàng | /admin/orders/[id] (+ transition-form, vtp-single-info, COD, vận đơn) | ✔ | ✔ | ✔ | ✔ | ↓ ghi chú |
| 2 Đơn hàng | /admin/orders/new (order-form) | ✔ | ✔ | ✔ | ✔ | ↓ ghi chú |
| 2 Đơn hàng | /admin/orders/export (vtp-export-form) | ✔ | ✔ | ✔ | ✔ | ↓ ghi chú |
| 2 Đơn hàng | /admin/orders/cod | ✔ | ✔ | ✔ | ✔ | ↓ ghi chú |
| 2 Đơn hàng | /admin/orders/preorders | ✔ | ✔ | ✔ | ✔ | ↓ ghi chú |
| 2 Đơn hàng | /admin/reviews | ✔ | ✔ | ✔ | ✔ | ↓ ghi chú |
| 2 Đơn hàng | In: orders/[id]/label, print-labels, pick-list (layout in riêng) | ✔ | ☐ | ☐ | ☐ | ↓ ghi chú |
| 3 SP & giá | /admin/products/new (product-create-form, sao chép) | ✔ | ✔ | ✔ | ✔ | ↓ ghi chú |
| 3 SP & giá | /admin/products/import (catalog-import) | ✔ | ✔ | ✔ | ✔ | ↓ ghi chú |
| 3 SP & giá | /admin/categories, /admin/categories/[id] | ✔ | ✔ | ✔ | ✔ | ↓ ghi chú |
| 3 SP & giá | /admin/selling-prices | ✔ | ✔ | ✔ | ✔ | ↓ ghi chú |
| 3 SP & giá | /admin/pricing (+ tab runs, pricing-runs-tab, pricing-run-form) | ✔ | ✔ | ✔ | ✔ | ↓ ghi chú |
| 3 SP & giá | /admin/pricing/runs/[id] | ✔ | ✔ | ✔ | ✔ | ↓ ghi chú |
| 4 Kho | /admin/inventory (2 chế độ xem, bảng lô, dòng mở rộng) | ✔ | ✔ | ✔ | ✔ | ↓ ghi chú |
| 4 Kho | /admin/inventory/documents (tab Đã ghi sổ/Nháp), /new, /[id], /[id]/edit | ✔ | ✔ | ✔ | ✔ | ↓ ghi chú |
| 4 Kho | /admin/inventory/batches/[id] | ✔ | ✔ | ✔ | ✔ | ↓ ghi chú |
| 4 Kho | /admin/inventory/quarantine | ✔ | ✔ | ✔ | ✔ | ↓ ghi chú |
| 4 Kho | /admin/alerts | ✔ | ✔ | ✔ | ✔ | ↓ ghi chú |
| 4 Kho | /admin/shipments, /admin/shipments/[id] | ✔ | ✔ | ✔ | ✔ | ↓ ghi chú |
| 5 TK & CTV | /admin/users, /new, /[id] | ✔ | ✔ | ✔ | ✔ | ↓ ghi chú |
| 5 TK & CTV | /admin/customer-accounts, /[id] | ✔ | ✔ | ✔ | ✔ | ↓ ghi chú |
| 5 TK & CTV | /admin/affiliates, /new, /[id] | ✔ | ✔ | ✔ | ✔ | ↓ ghi chú |
| 5 TK & CTV | /admin/affiliates/applications, /commissions | ✔ | ✔ | ✔ | ✔ | ↓ ghi chú |
| 5 TK & CTV | /admin/account | ✔ | ✔ | ✔ | ✔ | ↓ ghi chú |
| 6 BC/CĐ/ND | /admin/reports (+ reports-tabs), /analytics, /data-health | ✔ | ✔ | ✔ | ✔ | ↓ ghi chú |
| 6 BC/CĐ/ND | /admin/settings, /warehouses, /locations | ✔ | ✔ | ✔ | ✔ | ↓ ghi chú |
| 6 BC/CĐ/ND | /admin/content/banners, /new, /[id] | ✔ | ✔ | ✔ | ✔ | ↓ ghi chú |
| 6 BC/CĐ/ND | /admin/content/collections, /[id] | ✔ | ✔ | ✔ | ✔ | ↓ ghi chú |
| 6 BC/CĐ/ND | /admin/[...missing] + not-found, /admin/login | ✔ | ✔ 404 · ☐ login | ✔ (404) | ✔ (404) | ↓ ghi chú |

## Ghi chú kiểm chứng (13/11/2026)

**Cách kiểm trên trình duyệt:** spec Playwright tạm (đã xoá) đăng nhập admin, mở 57 trang (mọi trang trong bảng + 1 bản ghi chi tiết của mỗi loại) ở 1366px và Pixel 7 (412px): HTTP 200, có h1, không tràn ngang, không ô nhập thiếu nhãn, không nút icon thiếu tên, 8 lần Tab đều có vòng focus, chụp ảnh. Kết quả cuối: 57/57 đạt ở cả hai cỡ; chỉ còn lỗi 404 ảnh banner do dữ liệu test thiếu tệp (không phải lỗi giao diện).
Cột "Test": xem kết quả E2E dưới đây (không đánh dấu từng dòng vì nhiều spec phủ nhiều trang).

**Test**
- `npm run check` (lint + typecheck + 272 unit): Đạt.
- E2E toàn bộ (mobile + desktop): 84 đạt / 33 lỗi trên DB `glow_test` tích luỹ nặng. Đối chiếu baseline commit 3f6f3a1 (trước đợt đồng bộ) cho từng spec lỗi: các lỗi trùng baseline (quá thời gian khi đăng nhập/chuyển trang/ghi dữ liệu). Hai hồi quy thật đã sửa: `loading.tsx` cấp route (bỏ) và ActionMenu tự đóng (sửa).
- E2E thành phần dùng chung sau bản cuối: 19 đạt / 2 lỗi (đăng nhập chậm; xoá tài khoản rồi chờ chuyển trang) — cùng dạng lỗi có ở baseline.
- Không chạy: integration (không đụng DB/transaction), Lighthouse.

**Chưa làm (ngoài phạm vi / cố ý giữ)**
- Phân trang cho danh sách đang cắt 200/100 dòng (nhân viên, khách, CTV, đánh giá, phiếu kho, lịch sử giá).
- Nhãn nút quay lại giữ như cũ (đổi sẽ vỡ nhiều E2E tìm theo tên); `order-form` không bọc Section (dùng chung cổng CTV).
- `aria-label` "EN/MY/active" ở Địa bàn VTP giữ nguyên (E2E dùng); tab "Tự động" trùng menu ở Giá bán giữ nguyên.
- Skeleton tải trang cấp route: bỏ vì làm điều hướng không chặn, E2E chập chờn (13 → 7 lỗi khi bỏ).
- Trang in (nhãn, phiếu lấy hàng) và `/admin/login` chưa mở bằng trình duyệt trong đợt này.
