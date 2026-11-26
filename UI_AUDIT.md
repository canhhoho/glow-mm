# UI_AUDIT — T&C Cosmetics

> **LỊCH SỬ** — quy chuẩn hiện hành: [docs/design-system.md](docs/design-system.md) (26/11/2026). Giữ để tra cứu, không cập nhật.

> Ngày: 2026-11-09 · Nhánh `dev` · Chỉ báo cáo, chưa sửa code. Mọi "phương án" là đề xuất **chờ duyệt**.

### 0. Tóm tắt
- Ba khu vực, ba "bộ UI" riêng: **Admin** (`components/admin/ui.tsx` — đồng bộ nhất), **Storefront** (`components/store/ui.tsx` — hằng chuỗi class, không dùng shadcn), **Cổng CTV** (không có bộ riêng, mượn admin + tự viết thẻ `rounded-2xl`).
- shadcn chỉ có `button`, `input`, `label`; `Input`/`Label` dùng ở 2 file. Không có Select/Textarea/Checkbox/Table/Dialog/Tabs/Toast/Pagination dùng chung.
- Màu trạng thái (success/warning/danger) không có token → 80 class palette thô (emerald/amber/red), toàn bộ ở admin.
- Trong admin, cấp trang đồng bộ tốt (47/47 trang dùng `Page` + `PageHeader`); lệch nằm ở cấp **khối con** (section/card, bảng, phân trang, thông báo).

### 1. Stack & cấu trúc
| Hạng mục | Hiện trạng |
|---|---|
| Framework | Next.js 16.4 App Router, React 19.3, TS, `cacheComponents`; i18n next-intl 4 |
| CSS | Tailwind v4 (`@theme inline` trong `src/app/globals.css`), `tw-animate-css`, `shadcn/tailwind.css` |
| UI lib | shadcn `base-nova` trên `@base-ui/react`, cva, icon `lucide-react`; chỉ 3 primitive |
| Routing | Không có root layout chung; 3 root layout riêng: `src/app/[locale]/layout.tsx` (store, `data-theme="store"`), `src/app/admin/layout.tsx`, `src/app/ctv/layout.tsx`. Nhóm: `admin/(panel)`, `admin/(print)` (không shell), `ctv/(portal)` |
| Thư mục component | `components/ui` (shadcn) · `components/admin` (39 file, gồm `ui.tsx`) · `components/store` (27 file, gồm `ui.tsx`) · `components/ctv` (5 file) · `address-picker.tsx` (dùng chung admin + store) |

### 2. Layout / sidebar / header / page container
| Khu vực | Shell | Container | Tiêu đề trang |
|---|---|---|---|
| Admin | `components/admin/admin-shell.tsx`: sidebar `lg:w-60` sticky, drawer `w-72` dưới `lg`, topbar `h-14` + breadcrumb; menu dữ liệu ở `server/admin/nav.ts` | `<main p-4 md:p-6>` + `Page` (`w-full space-y-5`, `narrow` = `max-w-2xl`) | `PageHeader` h1 `text-xl font-semibold` |
| Admin in | `(print)/orders/*` | tự viết (`p-4 print:p-0`, `max-w-4xl`) | h1 `text-lg font-bold` |
| CTV | `ctv/(portal)/layout.tsx`: header sticky `max-w-4xl`, tab desktop + bottom bar mobile (`ctv-nav.tsx`) | mỗi trang tự `space-y-4`/`space-y-5` | h1 `text-xl font-semibold` gõ tay ở 7 trang |
| Store | `store/header.tsx` 2 tầng, `store/footer.tsx` | `max-w-6xl px-4`; trang con tự `max-w-screen-md`/`max-w-prose` | `PageTitle` `text-lg font-medium` (4 file) + 5 trang tự viết h1, cỡ lg/xl/2xl khác nhau |

### 3. Kiểm kê biến thể component
| Component | Nguồn dùng chung | Biến thể thực tế | Ghi chú |
|---|---|---|---|
| Button | `ui/button.tsx` (6 variant × 8 size) | Admin: `<Button>` 60 lần, `lg`/`icon-lg` chủ đạo; Store: 0 `<Button>`, dùng `primaryButton`/`outlineButton` (h-11); CTV: override `h-10`/`h-11` | Variant `link`, size `xs/icon/icon-xs/icon-sm` không dùng; nút xoá-icon tự viết lặp 3 lần; nút hiện mật khẩu lặp 2 lần |
| Input | `fieldClass` (admin, h-9, 237 ref), `storeField` (store, h-11, 41 ref), `ui/input` (h-8, 2 file) | 56 tổ hợp class; CTV h-10 | Cao ô 3 khu khác nhau (9/10/11); admin không dùng `aria-invalid`; 1 ô ngoài chuẩn `inventory/batches/[id]/page.tsx:97` |
| Select | native | 70 phần tử, 10 biến thể class | `RoleSelect`, `ParentSelect` bọc native |
| Textarea | native | 8 phần tử, 5 biến thể | `vtp-export-form.tsx:54` dùng `fieldClass` → kẹt h-9 |
| Checkbox/Radio | native | admin 13 checkbox không class + 3 kiểu `size-4/size-5`; store `accent-brand` | thẻ radio store khác nhau ở `p/[slug]` và `checkout-form` |
| Table | `DataTable` + `Td` (29 file) | 7 bảng tự viết ngoài `DataTable`, 14 kiểu th, 31 kiểu td | `inventory/page.tsx:238`, `settings/locations/page.tsx:58`, `catalog-import.tsx:61`, `receive-bulk-form.tsx:339`, `vtp-export-form.tsx:41`, pick-list ×2 |
| Modal/Confirm | không có | `window.confirm` ở 6 file (~30 nơi gọi qua prop `confirm`); popover bằng `<details>` 5+ kiểu | store/CTV không có xác nhận xoá (giỏ, địa chỉ) |
| Badge | admin `Badge` + `TONES` | ~12 bảng map trạng thái→tone rải trong trang; store không có badge (4 pill tự viết); count pill lặp ở `admin-shell.tsx:71` và `(panel)/layout.tsx:80` | CTV (nền store) dùng badge màu admin |
| Form | `ActionForm`/`ActionButton`/`TransitionForm` (admin) | store không có wrapper; 41 kiểu class `<label>`; 30 kiểu class `<form>`; không có SubmitButton/pending chung | `fieldLabelClass` có nhưng chỉ 6 file dùng, 69 bản gõ tay; `pricing-run-form.tsx:36` định nghĩa lại |
| Pagination | không có chung | 3 bản: `Pager` (`stock-parts.tsx:74`), inline `orders/page.tsx:151`, `CatalogPagination` (store) | phần lớn danh sách admin không phân trang (vd `brands` `take: 200`) |
| Filter | `FilterBar`/`SearchInput`/`FilterButton` (10–12 file) | 6 form lọc admin tự viết; CTV tự viết; store `CatalogFilters` | |
| Tabs | `TabNav` (6 file) | thêm segmented `inventory/page.tsx:157`, pill `data-health:96`, store `account-shell.tsx:44` | |
| Thông báo | 2 component cùng tên `Notice` (admin: success/danger, emerald; store: info/error/success, token) | ~14 dòng lỗi + 9 dòng success gõ tay; 3 kiểu hộp lỗi | không có toast |
| Empty state | `DataTable empty` | `<p>` trơn (admin/store), hộp `rounded-2xl` (CTV) | |
| Card/Section | admin `Section` (`rounded-lg border p-4`, 9 file) | admin còn `rounded-xl border bg-card` (settings, inventory, orders/[id], products/[id], customer-accounts); store `storeCard` (`rounded-xl ring-1`); CTV `rounded-2xl border shadow-sm` | 3 bán kính, 2 cách viền (border vs ring), bóng chỉ có ở CTV |

### 4. Giá trị hardcode / trùng lặp
| Nhóm | Phát hiện |
|---|---|
| Màu hex | Ngoài `globals.css`: `[locale]/layout.tsx:62` (themeColor), `manifest.ts:14-15`, email `server/accounts/emails.ts:31-38` (chấp nhận được cho email); script `generate-icons.mjs`, `generate-og.mjs` (lặp cả `BRAND_NAME`). `lib/brand.ts` không có hằng màu |
| Màu palette thô | 80 class (amber 35, emerald 34, red 11), 100% ở admin; 37 trong đó là `dark:` |
| Token thiếu/thừa | Không có token `success/warning/info`; `--secondary` là xám shadcn chứ không phải #7FB89A (`brand-2` chỉ 4 lần dùng); không dùng: `sidebar-*`, `chart-*`, `font-heading`, `radius-sm/3xl/4xl`; `primary` = `brand` nhưng admin dùng `primary`, store dùng `brand`, CTV dùng cả hai |
| Dark mode | Khối `.dark` + 37 `dark:` là code chết (không nơi nào bật `.dark`) |
| Font | `--font-sans` trỏ tên `"Noto Sans Myanmar"` không khớp family do `localFont` sinh; 4 chỗ dùng class `font-sans` (affiliates/[id]:156, pick-list ×3) có thể mất font Myanmar tự host — **cần kiểm tra trên trình duyệt** |
| Cỡ chữ tuỳ ý | `text-[11px]` ×12, `text-[10px]` ×3, `text-[13px]` ×2 → thiếu cỡ `2xs` |
| Radius | admin lg 52 / md 23 / xl 14; store lg 28 / xl 12 / full 13; CTV 2xl 13; logo tile 4 kiểu bán kính + cỡ chữ |
| Shadow | không có token; admin card không bóng, CTV card `shadow-sm`, store menu `shadow-lg` |
| Padding/spacing | card admin p-4 (+ ngoại lệ `p-4 sm:p-5` settings, `p-4 sm:p-6` catalog-import, `p-6` applications); store `p-3 sm:p-4`; cart/checkout sidebar `20rem` vs `22rem` |

### 5. Bảng vấn đề (chính)
Mức độ: **Cao** = ảnh hưởng nhất quán toàn hệ thống / UX nhiều trang · **TB** = lệch cục bộ nhiều nơi · **Thấp** = dọn dẹp.

| # | Vấn đề | File liên quan | Mức độ | Phương án (đề xuất, chờ duyệt) | Rủi ro |
|---|---|---|---|---|---|
| 1 | Màu trạng thái dùng palette thô, không token; cùng nghĩa "success/warning/danger" có 3–5 cách tô | `components/admin/ui.tsx:193,269-271,306`, `inventory/page.tsx:202-203,381`, `reports/page.tsx:76`, `pricing/runs/[id]/page.tsx`, `vtp-single-info.tsx`, `action-form.tsx:59` | Cao | Thêm token `--success/--warning/--info` (+foreground) vào `globals.css`, `TONES` + `Notice` đọc token; thay dần class thô | Đổi màu nhìn thấy trên nhiều trang; cần chọn giá trị màu (quyết định thiết kế của bạn); CTV dùng nền store nên phải thử cả 2 theme |
| 2 | Ba bộ UI song song (admin `ui.tsx`, store `ui.tsx`, CTV tự viết) — Button/field/card/Notice định nghĩa lại | `components/admin/ui.tsx`, `components/store/ui.tsx`, `app/ctv/(portal)/*` | Cao | Giữ hai "density" (admin h-9, store h-11) nhưng chung nguồn: `buttonVariants` thêm size `touch` (h-11), `fieldClass`/`storeField` sinh từ một cva; CTV chọn một trong hai | Store chưa từng dùng shadcn → đổi markup checkout/giỏ (luồng rủi ro cao, phải chạy E2E đủ); Slow 3G: không tăng JS client |
| 3 | Không có Dialog xác nhận; `window.confirm` rải 6 file, store/CTV xoá không xác nhận | `action-button.tsx:34`, `action-form.tsx:45`, `transition-form.tsx:40`, `brand-actions.tsx:22`, `bulk-order-bar.tsx:51`, `product-bulk-publish.tsx:24`; `cart/page.tsx:84`, `account/addresses/page.tsx:77` | Cao | Gom về một hàm/hook `confirmAction` trước (không đổi UX); sau đó (nếu duyệt) thay bằng Dialog base-ui | 35 chỗ `page.on("dialog")` trong 16 spec E2E sẽ hỏng nếu đổi sang modal; Dialog cần JS client + CSP nonce admin |
| 4 | Card/Section lệch: `rounded-lg` vs `rounded-xl` vs `rounded-2xl`, có/không `bg-card`, border vs ring, bóng chỉ ở CTV; nhiều trang gõ tay `<section>` thay `Section` | `admin/ui.tsx:173`, `settings/page.tsx:45-105`, `orders/[id]/page.tsx:92-447`, `affiliates/[id]/page.tsx:89,143`, `reports/page.tsx`, `products/[id]/page.tsx:57,107`, `customer-accounts/page.tsx:51,100`, `inventory/page.tsx:201,381`, `ctv-order-card.tsx:12`, `store/ui.tsx:17` | Cao | Chốt 1 kiểu card mỗi khu (bạn chọn radius/viền/bóng); mở rộng `Section` (variant `plain`/`card`) rồi thay dần | Thay đổi thị giác lớn; `orders/[id]` dài 450 dòng, dễ lệch khoảng cách; E2E dùng `aria-label` của `Section` — giữ nguyên tên |
| 5 | Phân trang 3 bản, đa số danh sách admin không phân trang | `stock-parts.tsx:74`, `orders/page.tsx:151`, `store/catalog-filters.tsx:20`, `brands/page.tsx` | TB | Một `Pagination` server component nhận `page/pageCount/hrefFor`, dùng cho admin + store (2 size) | Đổi URL tham số trang có thể làm hỏng link đã lưu/E2E; thêm phân trang thay đổi truy vấn (hiệu năng) |
| 6 | 7 bảng tự viết ngoài `DataTable`, class th/td khác nhau | `inventory/page.tsx:238`, `settings/locations/page.tsx:58`, `catalog-import.tsx:61`, `receive-bulk-form.tsx:339`, `vtp-export-form.tsx:41` | TB | Bổ sung `DataTable` prop `dense`, `minWidth`; chuyển các bảng thường; giữ riêng bảng in + bảng nhập lô | `receive-bulk-form` có chế độ lưới mobile riêng — ép vào `stack` dễ vỡ bố cục nhập kho |
| 7 | Thông báo: 2 `Notice` cùng tên khác API, ~23 dòng lỗi/thành công gõ tay, không có token warning ở store | `admin/ui.tsx:186`, `store/ui.tsx:23`, `action-form.tsx`, `shipment-forms.tsx:10`, `login-form.tsx:83`, `ctv/join-form.tsx:63` | TB | Một `Notice` chung (info/success/warning/danger) dùng token mục #1; `ActionForm` hiển thị qua nó | Giữ `role="alert"/"status"` vì E2E bắt theo role |
| 8 | Form: 41 kiểu class label, `fieldLabelClass` ít dùng, không có SubmitButton/pending chung, lỗi theo trường chỉ ở checkout | `product-form.tsx:58`, `pricing-run-form.tsx:36`, `vtp-export-form.tsx`, `store/auth-forms.tsx`, `account-forms.tsx` | TB | Thành phần `Field` (label + control + error, `aria-invalid`) và `SubmitButton` (`useFormStatus`) dùng chung | Form nhiều, đổi hàng loạt dễ sai `name` → hỏng Server Action; làm từng form, chạy E2E liên quan |
| 9 | Chiều cao control khác nhau: field 8/9/10/11, nút override `h-10`/`h-11`, `size="icon-lg"` + class trùng | `ui/input.tsx`, `ctv/(portal)/orders/page.tsx:34,52`, `ctv/copy-button.tsx:11`, `action-button.tsx:48`, `account-row-actions.tsx:33` | TB | Quy ước: admin h-9, store/CTV h-11 (touch); bỏ override bằng size chuẩn | CTV dùng trên điện thoại — đổi h-10→h-11 làm dịch layout bộ lọc |
| 10 | Bộ lọc admin: 6 form tự viết bỏ qua `FilterBar`; CTV tự viết | `affiliates/[id]/page.tsx:187`, `reports/page.tsx:47`, `reports/analytics/page.tsx:25`, `content/collections/[id]/page.tsx:98`, `orders/new`, `products/new`, `ctv/(portal)/orders/page.tsx:30` | TB | Dùng `FilterBar` cho các form GET; giữ form chọn SP (`orders/new`, `products/new`) nếu không phải bộ lọc | Thấp; kiểm tra bố cục mobile |
| 11 | Tabs 4 kiểu (underline, segmented ×2, pill) | `admin/ui.tsx:122`, `inventory/page.tsx:157`, `reports/data-health/page.tsx:96`, `store/account-shell.tsx:44` | Thấp | Thêm variant `segmented` cho `TabNav` hoặc giữ vì khác ngữ nghĩa (chuyển chế độ xem ≠ điều hướng) | Thấp |
| 12 | Badge: ~12 bảng map tone rải trong trang; store không có badge; count pill lặp | `order-badges.tsx`, `affiliate-parts.tsx:11`, `admin-shell.tsx:71`, `(panel)/layout.tsx:80`, `p/[slug]/page.tsx:145`, `account/addresses/page.tsx:52` | Thấp | Gom map tone theo domain (vd `lib/status-tones.ts`); `CountPill` chung | Thấp |
| 13 | Token thừa/không dùng và dark mode chết (`.dark`, 37 `dark:`, `sidebar-*`, `chart-*`, `font-heading`) | `src/app/globals.css:7-131`, các file admin có `dark:` | Thấp | Quyết định: bỏ dark mode (xoá code chết) hoặc làm thật (cần thiết kế) | Xoá token shadcn có thể ảnh hưởng component shadcn thêm sau; cần quyết định sản phẩm |
| 14 | `primary` vs `brand` cùng màu, dùng lẫn; `--secondary` là xám, không phải màu phụ #7FB89A | `globals.css:57-95,134-147`, admin (`text-primary` 54), store (`text-brand` 28), CTV cả hai | Thấp | Chọn một tên (khuyến nghị `primary` theo shadcn) và quy ước `brand-2` dùng ở đâu | Đổi tên hàng loạt; `--secondary` đổi giá trị sẽ đổi màu `Button variant="secondary"` |
| 15 | Màu thương hiệu lặp ngoài token (manifest, themeColor, script icon/OG, email) | `app/manifest.ts:14-15`, `[locale]/layout.tsx:62`, `scripts/generate-icons.mjs:8-17`, `scripts/generate-og.mjs:7-19`, `server/accounts/emails.ts:31-38` | Thấp | Hằng màu trong `lib/brand.ts`, các nơi trên import | Script `.mjs` import TS cần tsx; email phải giữ inline |
| 16 | Cỡ chữ tuỳ ý `text-[10/11/13px]`; tiêu đề store h1 3 cỡ khác nhau; admin h2 settings `text-base font-semibold` lệch | `inventory/page.tsx:264-456`, `admin-shell.tsx:74,172,175`, `receive-bulk-form.tsx:389,449`, `c/[slug]:50`, `p/[slug]:133`, `settings/page.tsx:40,62` | Thấp | Token `--text-2xs`; store dùng `PageTitle` mọi trang | Thấp; ảnh hưởng chữ Myanmar (line-height 1.8) — kiểm tra hiển thị |
| 17 | `font-sans` có thể không trỏ font Myanmar tự host | `globals.css:10`, `affiliates/[id]/page.tsx:156`, `(print)/orders/pick-list/page.tsx:63,88,89` | Thấp (cần xác minh) | Kiểm tra trên trình duyệt; nếu đúng, map `--font-sans` sang biến CSS của `localFont` | Đụng font toàn cục — lưu ý bài học `storeMyanmarFont`/`staffMyanmarFont` (CLAUDE.md) |
| 18 | CTV không có `Page`/`PageHeader`; h1/container gõ tay ở 7 trang; empty state 2 kiểu | `app/ctv/(portal)/*/page.tsx` | Thấp | Dùng lại `PageHeader` của admin hoặc bản CTV | Thấp |

### 6. So sánh đồng bộ giữa các trang admin
| Trang | Page/PageHeader | Khối con | Bảng | Phân trang | Lọc | Ghi chú lệch |
|---|---|---|---|---|---|---|
| Dashboard `(panel)/page.tsx` | ✓ | `<section space-y-2>` gõ tay, `Stat` | — | — | — | không dùng `Section` |
| Products list / `[id]` | ✓ | `[id]`: `rounded-lg` (57) + `rounded-xl` (107) | `DataTable` | ✗ | `FilterBar` | popover `<details>` riêng (`products/page.tsx:48`) |
| Orders list / `[id]` | ✓ | `[id]`: ~10 section, `rounded-xl` (94) lẫn `rounded-lg` (172) | `DataTable` | inline (151) | `FilterBar` | checkbox không class |
| Customers `customer-accounts` | ✓ | `rounded-xl bg-muted/30` help, `[id]` dùng `Section` | `DataTable` | ✗ | `FilterBar` | |
| Inventory | ✓ | thẻ `rounded-xl p-3`, panel amber/red thô | `DataTable` + `LotsTable` tự viết | `Pager` | segmented tab + `TabNav` | `text-[11px]`/`[13px]` nhiều nhất |
| Settings / locations / warehouses | ✓ | `rounded-xl bg-card p-4 sm:p-5`, h2 `text-base font-semibold` | locations: bảng tự viết | ✗ | — | lệch nhất về card + heading |
| Affiliates / Reports | ✓ | section gõ tay `rounded-lg`, grid riêng | `DataTable` | ✗ | form lọc tự viết | |

### 7. Component tái sử dụng được ngay
`Page`, `PageHeader`, `LinkButton`, `FilterBar`/`SearchInput`/`FilterButton`, `TabNav`, `Section`, `DataTable`/`Td` (có `stack` mobile), `Badge`/`TONES`, `Stat`, `fieldClass`/`fieldLabelClass` (`components/admin/ui.tsx`); `ActionForm`, `ActionButton`, `TransitionForm`, `AccountRowActions`, `OrderStatusBadge`, `ExpiryTag`; store: `storeCard`, `PageTitle`, `Notice`, `StoreSection`, `Breadcrumb`, skeleton, `CatalogPagination`; `buttonVariants`.

### 8. Rủi ro chung khi refactor
- **E2E:** chọn theo role/testid (không theo class) → đổi class an toàn; nhưng 35 handler `dialog` gắn chặt `window.confirm`; `Section` có `aria-label` từ title.
- **Cache Components / RSC:** primitive admin là server component — thêm Dialog/hook biến chúng thành client, tăng JS; store phải giữ JS tối thiểu (Slow 3G).
- **CSP:** admin dùng nonce + `strict-dynamic`; thư viện UI mới chèn style/script phải qua `buildCsp` và `tests/e2e/csp.spec.ts`.
- **Chữ Myanmar:** line-height 1.8, font chỉ phủ dải Myanmar — đổi chiều cao control/cỡ chữ cần kiểm tra cả `my` lẫn `en/vi`.
- **Phạm vi:** `components/*`, `globals.css`, layout là "dùng chung" theo CLAUDE.md → phải chạy spec của mọi trang bị ảnh hưởng (mobile + desktop).
- **Thứ tự an toàn đề xuất (chờ duyệt):** (1) token trạng thái + `Notice` → (2) gom confirm (không đổi UX) → (3) Section/card → (4) Pagination/DataTable → (5) Field/SubmitButton → (6) store dùng chung button/field. Mỗi bước một commit + test liên quan.

### 9. Quyết định (đã chốt 2026-11-09)
| # | Câu hỏi | Quyết định |
|---|---|---|
| 1 | Dark mode | **Bỏ** — xoá khối `.dark`, `@custom-variant dark` và mọi class `dark:` |
| 2 | Card chuẩn admin | **`rounded-lg border p-4`** (theo `Section`/`DataTable`/`Stat`), bỏ `rounded-xl` |
| 3 | Màu trạng thái | **Giữ emerald/amber/red cho admin nhưng qua token** `--success/--warning` (+ `--destructive` có sẵn); theme store/CTV đổi success sang `#2f6b4c`/`#e9f4ee`. Không dùng `#7FB89A` cho chữ (tương phản ~2,3:1) |
| 4 | `window.confirm` | **Giữ hộp xác nhận gốc**, gom về một helper; thêm xác nhận khi xoá địa chỉ (storefront); xoá khỏi giỏ không hỏi |
| 5 | Phong cách CTV | **Theo storefront** (nền kem, control h-11, thẻ `storeCard`), vẫn dùng lại logic form của admin |

Kế hoạch thực hiện: [docs/ke-hoach-refactor-ui.md](docs/ke-hoach-refactor-ui.md).

