# Đồng bộ UI Admin — checklist (12/11/2026)

Chuẩn: Tổng quan, Danh sách SP, Chi tiết SP (kế hoạch nằm trong thư mục kế hoạch của phiên làm việc).
Quy ước ô: `☐` chưa làm/kiểm · `✔` đã làm và kiểm đúng nội dung cột · `—` không áp dụng. **Chỉ đánh ✔ sau khi thật sự kiểm.**

| Nhóm | Trang / thành phần | Đã sửa mã | Mở trình duyệt desktop | Mobile | Bàn phím | Test |
|---|---|---|---|---|---|---|
| 1 Kit + chuẩn | /admin (Tổng quan) | ✔ | ☐ | ☐ | ☐ | ☐ |
| 1 Kit + chuẩn | /admin/products (danh sách, menu ⋯ hàng/tạo, thanh hàng loạt) | ✔ | ☐ | ☐ | ☐ | ☐ |
| 1 Kit + chuẩn | /admin/products/[id] (chi tiết, ảnh, bước 1–5) | ✔ | ☐ | ☐ | ☐ | ☐ |
| 1 Kit + chuẩn | Khung chung: loading.tsx, error.tsx, not-found, ActionMenu, Segmented, PageNumbers | ✔ | ☐ | ☐ | ☐ | ☐ |
| 2 Đơn hàng | /admin/orders (+ thanh hàng loạt bulk-order-bar) | ✔ | ☐ | ☐ | ☐ | ☐ |
| 2 Đơn hàng | /admin/orders/[id] (+ transition-form, vtp-single-info, COD, vận đơn) | ✔ | ☐ | ☐ | ☐ | ☐ |
| 2 Đơn hàng | /admin/orders/new (order-form) | ✔ | ☐ | ☐ | ☐ | ☐ |
| 2 Đơn hàng | /admin/orders/export (vtp-export-form) | ✔ | ☐ | ☐ | ☐ | ☐ |
| 2 Đơn hàng | /admin/orders/cod | ✔ | ☐ | ☐ | ☐ | ☐ |
| 2 Đơn hàng | /admin/orders/preorders | ✔ | ☐ | ☐ | ☐ | ☐ |
| 2 Đơn hàng | /admin/reviews | ✔ | ☐ | ☐ | ☐ | ☐ |
| 2 Đơn hàng | In: orders/[id]/label, print-labels, pick-list (layout in riêng) | ✔ | ☐ | ☐ | ☐ | ☐ |
| 3 SP & giá | /admin/products/new (product-create-form, sao chép) | ✔ | ☐ | ☐ | ☐ | ☐ |
| 3 SP & giá | /admin/products/import (catalog-import) | ✔ | ☐ | ☐ | ☐ | ☐ |
| 3 SP & giá | /admin/categories, /admin/categories/[id] | ✔ | ☐ | ☐ | ☐ | ☐ |
| 3 SP & giá | /admin/selling-prices | ✔ | ☐ | ☐ | ☐ | ☐ |
| 3 SP & giá | /admin/pricing (+ tab runs, pricing-runs-tab, pricing-run-form) | ✔ | ☐ | ☐ | ☐ | ☐ |
| 3 SP & giá | /admin/pricing/runs/[id] | ✔ | ☐ | ☐ | ☐ | ☐ |
| 4 Kho | /admin/inventory (2 chế độ xem, bảng lô, dòng mở rộng) | ✔ | ☐ | ☐ | ☐ | ☐ |
| 4 Kho | /admin/inventory/documents (tab Đã ghi sổ/Nháp), /new, /[id], /[id]/edit | ✔ | ☐ | ☐ | ☐ | ☐ |
| 4 Kho | /admin/inventory/batches/[id] | ✔ | ☐ | ☐ | ☐ | ☐ |
| 4 Kho | /admin/inventory/quarantine | ✔ | ☐ | ☐ | ☐ | ☐ |
| 4 Kho | /admin/alerts | ✔ | ☐ | ☐ | ☐ | ☐ |
| 4 Kho | /admin/shipments, /admin/shipments/[id] | ✔ | ☐ | ☐ | ☐ | ☐ |
| 5 TK & CTV | /admin/users, /new, /[id] | ✔ | ☐ | ☐ | ☐ | ☐ |
| 5 TK & CTV | /admin/customer-accounts, /[id] | ✔ | ☐ | ☐ | ☐ | ☐ |
| 5 TK & CTV | /admin/affiliates, /new, /[id] | ✔ | ☐ | ☐ | ☐ | ☐ |
| 5 TK & CTV | /admin/affiliates/applications, /commissions | ✔ | ☐ | ☐ | ☐ | ☐ |
| 5 TK & CTV | /admin/account | ✔ | ☐ | ☐ | ☐ | ☐ |
| 6 BC/CĐ/ND | /admin/reports (+ reports-tabs), /analytics, /data-health | ✔ | ☐ | ☐ | ☐ | ☐ |
| 6 BC/CĐ/ND | /admin/settings, /warehouses, /locations | ✔ | ☐ | ☐ | ☐ | ☐ |
| 6 BC/CĐ/ND | /admin/content/banners, /new, /[id] | ✔ | ☐ | ☐ | ☐ | ☐ |
| 6 BC/CĐ/ND | /admin/content/collections, /[id] | ✔ | ☐ | ☐ | ☐ | ☐ |
| 6 BC/CĐ/ND | /admin/[...missing] + not-found, /admin/login | ✔ | ☐ | ☐ | ☐ | ☐ |

## Ghi chú kiểm chứng
(điền sau mỗi nhóm: lệnh test, kết quả 4 dòng Đạt/Lỗi/Bỏ qua/Không chạy, phần chưa xác minh)
