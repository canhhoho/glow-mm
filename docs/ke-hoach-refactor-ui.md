# Kế hoạch refactor giao diện (theo UI_AUDIT.md)

> Ngày: 2026-11-09 · Nhánh `dev` · Trạng thái: **chờ duyệt, chưa sửa code**.
> Cơ sở: [UI_AUDIT.md](../UI_AUDIT.md) và quyết định 1A · 2A · 3A · 4A · 5A (mục 9 của audit).

## Nguyên tắc chung
- Không cài thư viện mới. Không thêm màu/kiểu ngoài các quyết định đã chốt.
- Mỗi bước = **một commit** trên `dev`; sau mỗi **giai đoạn** dừng chờ duyệt (CLAUDE.md).
- Giữ nguyên `data-testid`, `role`, `aria-label`, tên `name` của input (E2E và Server Action dựa vào chúng).
- Storefront: không thêm JS client ngoài chỗ ghi rõ (Slow 3G). Admin primitive ở `components/admin/ui.tsx` giữ là server component.
- Chuỗi giao diện mới → `messages/*` (store: `my/en/vi` + `review-my.json`; admin: `vi/en/my`).
- Test mỗi bước: `npm run check` + các spec ghi trong bước (cả `mobile` và `desktop` nếu có file `*.desktop.spec.ts`). **Full E2E** (`npm test`) ở cuối giai đoạn 3 và trước khi merge `main`.
- Báo cáo test mỗi bước đủ 4 dòng: Đạt / Lỗi / Bỏ qua / Không chạy.

---

## Giai đoạn 1 — Token & dọn nền (rủi ro thấp, gần như không đổi giao diện)

### B0. Xác minh lỗi `font-sans` (audit #17)
- **Làm:** chạy `npm run dev`, mở `/admin/affiliates/<id>` và `/admin/orders/pick-list`, đo `getComputedStyle(...).fontFamily` của phần tử có class `font-sans` và xem chữ Myanmar có dùng font tự host không (so với `staffMyanmarFont`; `tests/e2e/font-isolation.spec.ts` đã chứng minh tên family do `localFont` sinh là tên biến).
- **Nếu lỗi có thật:** bỏ class `font-sans` ở 4 chỗ (`affiliates/[id]/page.tsx:156`, `(print)/orders/pick-list/page.tsx:63,88,89`) và dùng cách khác để trả chữ về font thường trong khối `font-mono` (vd chỉ đặt `font-mono` lên phần mã thay vì cả khối). **Không** đổi `--font-sans` toàn cục ở bước này.
- **Test:** `font-isolation.spec.ts`, `affiliate-admin.spec.ts`.

### B1. Bỏ dark mode (quyết định 1A, audit #13)
- `src/app/globals.css`: xoá `@custom-variant dark` và toàn bộ khối `.dark { … }`.
- Xoá mọi class `dark:` (37 lần) trong 19 file: `components/admin/{ui,action-form,bulk-order-bar,catalog-forms,category-icon-upload,pick-print-button,product-form,product-images,receive-bulk-form,shipment-forms}.tsx`, `components/ui/{button,input}.tsx`, các trang `admin/(panel)/{affiliates/[id],content/banners,inventory,inventory/batches/[id],pricing/runs/[id],products/[id],reports}`.
- Kèm (cùng commit, an toàn vì 0 lần dùng): xoá token `sidebar-*`, `chart-*`, `--font-heading`, `--radius-sm/3xl/4xl` khỏi `@theme inline` và `:root`.
- **Giao diện:** không đổi (dark chưa từng bật).
- **Test:** `npm run check`; `grep -r "dark:" src` = 0.

### B2. Token màu trạng thái (quyết định 3A, audit #1)
- `globals.css`:
  - `:root` thêm `--success`, `--success-foreground`, `--success-muted` (nền nhạt), `--warning`, `--warning-foreground`, `--warning-muted`, `--destructive-muted` — giá trị oklch **bằng đúng** emerald/amber/red Tailwind đang dùng (emerald-700/800/100/50, amber-700/800/100/50, red-800/100), để admin không đổi màu.
  - `[data-theme="store"]` ghi đè: success → chữ `#2f6b4c`, nền `#e9f4ee` (bộ màu `Notice` store đang dùng); warning giữ như admin.
  - `@theme inline` ánh xạ `--color-success*`, `--color-warning*`, `--color-destructive-muted`.
- `components/admin/ui.tsx`: `TONES`, `Notice`, `Stat` dùng class token (`bg-success-muted text-success-foreground`…).
- Thay class palette thô ở 20 file (danh sách ở audit #1; ví dụ `inventory/page.tsx:202-203,381`, `reports/page.tsx:76`, `pricing/runs/[id]/page.tsx`, `vtp-single-info.tsx`, `vtp-export-form.tsx`, `action-form.tsx:59`, `inventory/documents/[id]/page.tsx:28`).
- **Kết quả:** `grep -E "(emerald|amber|red)-[0-9]" src` = 0; badge trong cổng CTV tự đổi sang xanh của store.
- **Test:** `npm run check`; `admin-shell.spec.ts`, `inventory-page.spec.ts` + `.desktop`, `dashboard-reports.spec.ts`, `affiliate-portal.spec.ts` + `.desktop`. Chụp màn hình trước/sau: dashboard, kho, chi tiết đơn, cổng CTV.

### B3. Một `Notice` chung (audit #7)
- Tạo `src/components/ui/notice.tsx` (server component, không JS): tone `info | success | warning | danger`, `rounded-lg px-3 py-2 text-sm`, `role="alert"` cho danger, `role="status"` cho còn lại.
- `components/admin/ui.tsx` và `components/store/ui.tsx` re-export thay cho hai bản cũ (giữ tên import, không phải sửa 14 file gọi). Store đổi `tone="error"` → `danger` (tìm-thay trong 10 file).
- Hộp lỗi gõ tay giống hệt (`login-form.tsx:83`, `ctv/join-form.tsx:63`, `ctv/join/page.tsx:31`, `product-bulk-publish.tsx:151`, `catalog-import.tsx:49`, `reports/page.tsx:76`, `inventory/documents/[id]/page.tsx:28`) → `<Notice>`.
- Dòng chữ lỗi/thành công trong form (`ActionForm`, `ActionButton`, `shipment-forms` `ErrorText`) **giữ dạng chữ** (không thêm hộp) để không đổi bố cục.
- **Test:** `npm run check`; `account.spec.ts`, `customer-account.spec.ts`, `affiliate-join.spec.ts`, `catalog-import.spec.ts`, `smoke.spec.ts`.

**⏸ Dừng chờ duyệt sau Giai đoạn 1.**

---

## Giai đoạn 2 — Hành vi & bố cục khối

### B4. Gom xác nhận (quyết định 4A, audit #3)
- Tạo `src/lib/confirm.ts` (client-safe, thuần): `confirmSubmit(event, message?)` — gọi `window.confirm`, `preventDefault` nếu huỷ.
- Thay 6 chỗ tự viết: `action-button.tsx:34`, `action-form.tsx:45`, `transition-form.tsx:40`, `brand-actions.tsx:22`, `bulk-order-bar.tsx:51`, `product-bulk-publish.tsx:24`. Hành vi giữ nguyên.
- Storefront xoá địa chỉ (`[locale]/account/addresses/page.tsx:74-77`): tách nút xoá thành client component nhỏ `store/confirm-submit.tsx` (chỉ nút submit + `onClick` confirm); thêm key `Account.deleteAddressConfirm` vào `messages/store.{my,en,vi}.json` + `review-my.json`.
- Sửa `tests/e2e/customer-account.spec.ts:85` để chấp nhận dialog (`page.once("dialog", d => d.accept())`).
- Giỏ hàng: không đổi.
- **Test:** `npm run check` (gồm `messages-parity`); `customer-account.spec.ts`, `admin-orders.spec.ts`, `bulk-orders.spec.ts`, `admin-content.spec.ts`, `affiliate-admin.spec.ts`, `users.spec.ts`.

### B5. Thẻ/section admin thống nhất `rounded-lg border p-4` (quyết định 2A, audit #4, #16)
- Đổi `rounded-xl` → `rounded-lg` ở 12 chỗ admin: `customer-accounts/page.tsx:100`, `inventory/batches/[id]/page.tsx:76`, `inventory/page.tsx:201,381`, `orders/[id]/page.tsx:94`, `products/[id]/page.tsx:107`, `settings/page.tsx:45,65,67,81,105`, `catalog-import.tsx:21` (dòng 65 là thanh nút lưu dính dưới form, kiểu `[&>div:last-of-type]:rounded-xl … shadow-sm` — giữ `shadow-sm` vì là thanh nổi, chỉ đổi bán kính). (Ô icon `size-10 rounded-xl` ở `settings:47`, `customer-accounts:51` là icon tile, không phải card — giữ.)
- Padding chuẩn `p-4`: bỏ `sm:p-5` (settings), `sm:p-6` (catalog-import), `p-6` (`affiliates/applications:37`). Bỏ `bg-card` thừa trong admin.
- `<section>` gõ tay có khung (`rounded-lg border p-4` + `h2 font-medium`) → `<Section title=…>` khi markup tương đương: `orders/[id]`, `affiliates/[id]:89,143`, `products/[id]:57,107`, `reports`, `users/[id]`, `shipments/[id]`. Section không khung (`space-y-2`, như dashboard) **giữ nguyên** — đó là nhóm nội dung, không phải card.
- Tiêu đề h2 lệch: `settings/page.tsx:40,62` (`text-base font-semibold`), `catalog-import.tsx:23` (`text-lg font-semibold`) → `font-medium`.
- **Rủi ro cần kiểm:** `Section` tự gắn `aria-label` = title → thêm vùng `region` có tên; kiểm spec dùng `getByRole("region")`/`getByText` không bị trùng.
- **Test:** `npm run check`; `settings.desktop.spec.ts`, `inventory-page.spec.ts` + `.desktop`, `admin-orders.spec.ts`, `cod-exception.spec.ts`, `catalog-import.spec.ts`, `customer-accounts.desktop.spec.ts`, `affiliate-admin.spec.ts`, `dashboard-reports.spec.ts`, `pricing-settings.spec.ts`, `shipment-weight.spec.ts`, `users.spec.ts`.

### B6. Cổng CTV theo storefront (quyết định 5A, audit #9, #18)
- Thẻ: 13 chỗ `rounded-2xl border bg-card p-4 shadow-sm` trong `app/ctv/(portal)/*` và `components/ctv/ctv-order-card.tsx` → `storeCard` (`components/store/ui.tsx`). Empty state CTV → `storeCard` + `text-center text-sm text-muted-foreground`.
- Control cao h-11: bộ lọc `ctv/(portal)/orders/page.tsx:34,52` → `storeField`; nút override `h-10` (`copy-button.tsx:11`, `orders/page.tsx:52`) → kiểu nút store h-11.
- Form dùng chung với admin (`OrderForm`, `ActionForm`, `fieldClass`): thêm prop `density?: "compact" | "touch"` (mặc định `compact` = h-9 cho admin); CTV truyền `touch` (h-11). Không nhân đôi component.
- Tiêu đề trang: dùng `PageHeader` (đã `text-xl font-semibold`, giống CTV) thay 7 h1 gõ tay; container trang thống nhất `space-y-4`.
- Màu: CTV đang dùng lẫn `text-primary`/`text-brand` → `brand` (theo store).
- **Test:** `npm run check`; `affiliate-portal.spec.ts` + `.desktop`, `affiliate-join.spec.ts`, `affiliate-team.spec.ts`, `font-isolation.spec.ts`, `csp.spec.ts`; đồng thời `admin-orders.spec.ts` (OrderForm admin không đổi).

**⏸ Dừng chờ duyệt sau Giai đoạn 2.**

---

## Giai đoạn 3 — Component dùng chung lớn (rủi ro trung bình, chạm checkout)

### B7. Pagination chung + mở rộng DataTable (audit #5, #6)
- `src/components/ui/pagination.tsx` (server component): `page`, `pageCount`, `hrefFor(page)`, `size: "compact" | "touch"`, `aria-live`. Thay `Pager` (`stock-parts.tsx:74`), nav inline `orders/page.tsx:151`, `CatalogPagination` (`store/catalog-filters.tsx:20`). **Giữ nguyên tên tham số URL** của từng trang.
- `DataTable` thêm `dense` (`py-1.5 text-xs`) và `minWidth`. Chuyển bảng: `settings/locations/page.tsx:58`, `catalog-import.tsx:61`, `vtp-export-form.tsx:41`, `inventory/page.tsx:238` (`LotsTable`, dùng `dense`). **Giữ riêng** `receive-bulk-form.tsx` (lưới mobile riêng) và 2 bảng in pick-list.
- Không thêm phân trang cho trang chưa có (việc riêng, đụng truy vấn).
- **Test:** `catalog-pagination.spec.ts`, `admin-orders.spec.ts`, `bulk-orders.spec.ts`, `bulk-selection.spec.ts`, `inventory-page.spec.ts` + `.desktop`, `locations.spec.ts`, `catalog-import.spec.ts`, `storefront.desktop.spec.ts`.

### B8. `Field` + `SubmitButton` (audit #8)
- `components/admin/ui.tsx`: `Field` (label trên + control + lỗi tuỳ chọn, gắn `aria-invalid`/`aria-describedby`), dùng `fieldLabelClass`. Bỏ bản sao `pricing-run-form.tsx:36`, `product-form.tsx:58` dùng `Field` chung.
- Thay chuỗi label gõ tay `"grid content-start gap-1 text-sm"` (69 chỗ) bằng `fieldLabelClass` — thay cơ học, không đổi markup.
- `SubmitButton` (`useFormStatus`, `disabled` + nhãn chờ) dùng trong `ActionForm`; store forms dùng bản `touch`.
- **Không** đổi `name` của input. Làm theo từng file, chạy spec trang đó.
- **Test:** spec của từng form bị đụng; cuối bước chạy toàn bộ spec admin.

### B9. Storefront dùng chung nguồn nút/ô nhập (audit #2, #9)
- `components/ui/button.tsx`: thêm size `touch` (h-11, `px-5`, `text-base`).
- `components/store/ui.tsx`: `primaryButton = buttonVariants({ size: "touch" })`, `outlineButton = buttonVariants({ variant: "outline", size: "touch" })`; `storeField` và `fieldClass` sinh từ một hàm `fieldVariants({ density })`. Store **vẫn dùng chuỗi class** (không dùng `<Button>` client) để không tăng JS.
- Nút xoá-icon gõ tay 3 lần (`shipments/[id]:52`, `account/addresses:77`, `cart:84`) → `buttonVariants({ variant: "destructive", size: "icon-lg" })`; nút hiện mật khẩu 2 lần → một component.
- So khớp từng thuộc tính (màu `brand`=`primary`, `font-medium`, `gap`, focus ring) trước khi thay, chụp trước/sau checkout, giỏ, đăng nhập.
- **Test:** **Full E2E** (`npm test`) — chạm checkout/đăng nhập (vùng rủi ro cao theo CLAUDE.md). Lighthouse mobile (`npm run perf`) so với trước.

**⏸ Dừng chờ duyệt sau Giai đoạn 3** (kèm kết quả full E2E).

---

## Tuỳ chọn — dọn dẹp mức Thấp (chỉ làm khi bạn yêu cầu)
| Mục audit | Việc |
|---|---|
| #10 | 6 form lọc admin tự viết → `FilterBar` |
| #11 | `TabNav` thêm variant `segmented` cho `inventory/page.tsx:157` |
| #12 | Gom ~12 bảng map trạng thái→tone; `CountPill` chung cho `admin-shell.tsx:71` + `(panel)/layout.tsx:80`; badge storefront |
| #14 | Thống nhất tên `primary`/`brand`; quy ước dùng `brand-2` |
| #15 | Hằng màu thương hiệu trong `lib/brand.ts` cho manifest, `themeColor`, script icon/OG |
| #16 | Token `--text-2xs` thay `text-[10/11/13px]`; storefront dùng `PageTitle` mọi trang |

## Ước lượng phạm vi
| Giai đoạn | Số file (ước) | Spec E2E | Commit |
|---|---|---|---|
| 1 (B0–B3) | ~35 | ~10 spec | 4 |
| 2 (B4–B6) | ~35 | ~18 spec | 3 |
| 3 (B7–B9) | ~60 | full E2E | 3 |
