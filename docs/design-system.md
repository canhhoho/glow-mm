# Design System T&C — quy chuẩn giao diện

> **Nguồn duy nhất** cho quy tắc UI của Storefront, Admin, cổng CTV (chốt 26/11/2026). Dành cho người và AI agent: đọc mục cần trước khi tạo/sửa giao diện.
> Thay cho các tài liệu lịch sử: `UI_AUDIT.md`, `docs/ke-hoach-refactor-ui.md`, `docs/ui-action-audit-2026-11-08.md`, `docs/dong-bo-ui-admin-2026-11-12.md`.
> Ký hiệu **[Đích]** = quy tắc đã chốt nhưng code chưa theo hết (xem §10). Code mới theo đích nếu component đích đã có; chưa có thì dùng component hiện tại, không tự viết bản riêng.

## 1. Quyết định đã chốt

| # | Quyết định | Ngày |
|---|---|---|
| 1 | Không dark mode (biến thể `dark:` bị khoá trong `globals.css`) | 09/11 |
| 2 | Màu trạng thái qua token `success/warning/danger`; store đổi success sang xanh `#2f6b4c` | 09/11 |
| 3 | Xác nhận thao tác = hộp gốc trình duyệt qua `src/lib/confirm.ts` — **không modal** | 09/11 |
| 4 | Card/khung/bảng bo **`rounded-xl`** (thay quyết định cũ `rounded-lg`, khớp code hiện tại) | 26/11 |
| 5 | Cổng CTV dùng **thành phần admin + theme mặc định**, nhưng control **mật độ `touch` (≥ 44px) trên mobile** [Đích] | 26/11 |
| 6 | Không toast: thông báo đặt tại chỗ (`Notice`, dòng trạng thái của form) | 26/11 |
| 7 | Primitive dùng chung ba portal nằm ở `src/components/ui/`; `admin/ui.tsx`, `store/ui.tsx` chỉ giữ phần riêng khu (re-export phần chung) [Đích] | 26/11 |

## 2. Ba portal

| | Storefront `src/app/[locale]` | Admin `src/app/admin` | CTV `src/app/ctv` |
|---|---|---|---|
| Người dùng | Khách, điện thoại, Slow 3G | Nhân viên, máy tính (dùng được điện thoại) | CTV, chủ yếu điện thoại |
| Theme | `data-theme="store"` (nền kem, chữ ink) | mặc định (nền trắng) | mặc định |
| Mật độ | `touch`: control h-11 | `compact`: control h-9 | `touch` trên mobile, `compact` từ md [Đích] |
| Khung | `[locale]/layout.tsx` — header/footer full-width, nội dung `max-w-6xl` | `admin-shell.tsx` — sidebar + breadcrumb; trang bọc `Page` | `ctv/(portal)/layout.tsx` — header + tab (md+) / thanh đáy (mobile); trang bọc `Page` |
| Bộ UI | `store/ui.tsx` (chuỗi class, **không thêm JS client**) | `admin/ui.tsx` | dùng `admin/ui.tsx` |

Storefront là Server Components: nút là `<button>`/`<Link>` với chuỗi class, không dùng `<Button>` (kéo `@base-ui` vào bundle client).

## 3. Token màu (`src/app/globals.css`)

Đổi màu thương hiệu: chỉ sửa `:root` (và `[data-theme="store"]` cho store).

| Mục đích | Token / class | Ghi chú |
|---|---|---|
| Nút chính, link, chữ nhấn | `primary` (= `brand-dark` #be354d) | Admin/CTV viết `text-primary`; store hiện viết `text-brand-dark` — cùng giá trị |
| Nền thương hiệu lớn | `brand` (#e8657a) | Logo, FAB, dải header store. **Không** dùng làm màu chữ nhỏ (tương phản ~3.3:1) |
| Màu phụ xanh | `brand-2` | Chỉ icon/trang trí, **không** cho chữ |
| Chữ thường / phụ | `foreground` / `muted-foreground` | |
| Nền khối / nền nhạt | `card` / `muted`, `accent` | |
| Viền | `border` (khung), `input` (ô nhập) | |
| Trạng thái | `success`, `warning`, `danger-*`; nền `*-muted` (badge) / `*-subtle` (hộp); chữ trên nền đó `*-foreground`; viền `*-border` | |
| Lỗi, xoá | `destructive` | Chữ lỗi, nút xoá |

**Cấm** trong className: màu palette Tailwind thô (`red-500`, `gray-100`…), hex/rgb (`bg-[#…]`), `style={{ color }}`. Ngoại lệ: email (inline style), trang in, SVG biểu đồ, `manifest`/icon/OG (`lib/brand.ts`).

## 4. Typography

| Vai trò | Admin / CTV | Storefront |
|---|---|---|
| Tiêu đề trang (h1) | `PageHeader` → `text-xl font-semibold` | `PageTitle` → `text-lg font-medium` (trang danh mục/SP được `lg:text-xl`) |
| Tiêu đề khối (h2) | `font-medium` (qua `Section`) | `StoreSection` |
| Nội dung | `text-sm` | `text-base` (mặc định), phụ `text-sm` |
| Chú thích, tiêu đề cột bảng | `text-xs text-muted-foreground` | `text-xs` |
| Huy hiệu đếm, nhãn rất nhỏ | `text-2xs` (11px — nhỏ nhất cho phép) | `text-2xs` |

- Chỉ `font-medium` / `font-semibold` (`font-bold` chỉ logo, trang in). Font chỉ `font-sans` (đã trỏ Noto Sans Myanmar).
- **Cấm** `text-[Npx]` — dùng thang trên. Số: `tabular-nums`, cột số căn phải.
- Chữ Myanmar cần line-height cao (`:lang(my)` tự đặt 1.8): không ép `leading-none`/chiều cao cố định cho chữ có thể là tiếng Myanmar; nhãn dài dùng `line-clamp-2`, không `truncate` mất nghĩa.

## 5. Spacing, bo góc, viền, bóng

- **Spacing** (thang 4px, chỉ dùng các bậc 0.5 · 1 · 1.5 · 2 · 3 · 4 · 5 · 6): giữa các khối trong trang `space-y-5` (do `Page` lo); trong khối `space-y-3`/`gap-3`; giữa control cạnh nhau `gap-2`; padding card `p-4`, thẻ nhỏ/ô chỉ số/card store mobile `p-3`.
- **Bo góc**: card/khung/bảng/khối `rounded-xl` · control (nút, ô nhập, Notice, menu nổi) `rounded-lg` · mục menu/tab/trang số `rounded-md` · badge/pill/avatar/FAB `rounded-full`. Không dùng `rounded-2xl` trở lên (ngoại lệ có sẵn: màn đăng nhập admin).
- **Viền**: admin/CTV khối = `rounded-xl border bg-card`; store khối = `storeCard` (`ring-1 ring-border`). Không trộn hai kiểu trong cùng khu.
- **Bóng**: chỉ cho lớp nổi — menu/popover `shadow-md`, ngăn kéo `shadow-xl`, FAB `shadow-lg`, header store `shadow-sm`. Card không bóng (ngoại lệ `Stat`/`StatCard` `shadow-xs`).

## 6. Icon, layout, responsive

- Icon: **chỉ `lucide-react`**. `size-4` trong nút/chữ (mặc định của `buttonVariants`), `size-5` ở nav/header. Icon trang trí `aria-hidden`; nút chỉ icon phải có `aria-label` hoặc `sr-only` + `title`. Không dùng emoji/ký tự làm icon (ngoại lệ ★ đánh giá, có `aria-label`).
- Nút: lưu/tạo mới/hàng loạt = icon + chữ (Save, Plus, …); thao tác theo dòng có thể chỉ icon (`iconOnly`).
- Mobile-first, breakpoint mặc định Tailwind. Vùng bấm ≥ 44px trên store/CTV và mọi nút icon trên mobile (`icon-lg` = 44px mobile / 36px md+).
- Không tự đặt container/độ rộng trong trang: admin/CTV dùng `Page` (`width="narrow"` cho form/cài đặt); store đã có khung trong layout.
- Bảng admin nhiều cột trên mobile: `DataTable stack` + `Td label`, không bắt cuộn ngang.

## 7. Danh mục component — cần gì dùng gì

| Cần | Admin / CTV | Storefront | Ghi chú |
|---|---|---|---|
| Nút | `<Button size="lg">`; link dạng nút `LinkButton` hoặc `buttonVariants({ size: "lg" })` | `primaryButton` / `outlineButton` trên `<button>`/`<Link>` | Biến thể: `default` (một nút chính mỗi khối) · `outline` (phụ) · `ghost` (trong thanh/menu) · `destructive` · `link`. Không override chiều cao bằng `h-10`… — dùng size |
| Gửi server action | `ActionForm` (form + thông báo), `ActionButton` (một nút), `TransitionForm` (chỉ chuyển trạng thái đơn) | form + `useActionState` trong client component | Prop `confirm` để hỏi xác nhận |
| Nút xác nhận trong server component | `ConfirmSubmitButton` (`ui/confirm-submit.tsx`) | như admin | Không modal |
| Ô nhập / select / textarea | `fieldClass` (= `FIELD.compact`) | `storeField` (= `FIELD.touch`) | **Không** dùng `ui/input.tsx`, `ui/label.tsx` (shadcn, lệch chiều cao) cho code mới |
| Nhãn trường | `Field` / `fieldLabelClass` (`fieldLabelSmClass` cho form dày) | hiện `label.block.space-y-1.text-sm` — [Đích] `Field` dùng chung | Lỗi theo trường: `aria-invalid` + chữ `text-destructive` dưới ô |
| Checkbox / radio | `checkboxClass` | | |
| Mật khẩu / địa chỉ | `PasswordToggle` / `AddressPicker` | như admin | |
| Bộ lọc | `FilterBar` + `SearchInput` + select `fieldClass` + `AdvancedFilters` + `DateRangeFields` + `FilterButton` + `ClearFilters` | `catalog-filters.tsx` | Form GET, chạy không cần JS |
| Bảng | `DataTable` + `Td` (`numeric`, `stack`, `dense`, `empty`, `cols`) | — | Ngoại lệ được phép: trang in, `receive-bulk-form` |
| Phân trang | `PageNumbers` (danh sách lớn) | `Pagination` (`ui/pagination.tsx`) | [Đích] gộp một component |
| Khối / card | `Section` (`title`, `actions`, `collapsible`) | `storeCard`, `storeListCard`, `StoreSection` | Không gõ tay `<section className="rounded-…">` |
| Tab | `TabNav` (điều hướng giữa trang), `Segmented` (chế độ xem/khoảng ngày); tab nhóm menu ở `section-tabs.tsx` | `account-shell.tsx` | |
| Badge | `Badge tone` (`neutral/success/warning/danger/brand`) | [Đích] `Badge` chung | Map trạng thái → tone đặt ở `status-tones.ts`, `order-badges.tsx` — không map trong page |
| Chỉ số | `Stat`, `StatCard` | — | |
| Thông báo | `Notice tone` (`ui/notice.tsx`) | như admin | Không gõ tay `<p role="alert" className="text-destructive">` — [Đích] `FormMessage` |
| Rỗng | `DataTable empty`, `EmptyState` | [Đích] `EmptyState` chung | |
| Đang tải | `BlockSkeleton` (admin) | `ListSkeleton`, `BlockSkeleton` (store) | [Đích] một `Skeleton` chung |
| Menu ⋯ | `ActionMenu` + `MENU_ITEM` | — | |
| Breadcrumb | tự có trong `admin-shell` | `Breadcrumb` | |
| Modal / toast | **Không có, không thêm** | | Dùng trang riêng, `Section collapsible`, `<details>`, confirm gốc. Thêm Dialog = cần duyệt (JS client, CSP, ~35 chỗ E2E bắt `dialog`) |

## 8. Trạng thái: Loading · Empty · Error · Thông báo

- **Loading**: `Suspense` theo khối, skeleton cùng kích thước nội dung thật (không nhảy layout); store skeleton `min-h-dvh`. Không spinner toàn trang. Nút gửi `disabled` khi pending ([Đích] `SubmitButton` hiện chữ/biểu tượng đang xử lý).
- **Empty**: luôn có câu giải thích (i18n) và, nếu người dùng có quyền, hành động kế tiếp (nút/link tạo mới, xoá lọc).
- **Error**: lỗi nghiệp vụ từ action → hiện gần nút (`ActionForm`/`Notice tone="danger"`); lỗi trường → `aria-invalid` + chữ dưới ô, focus vào ô lỗi đầu tiên; lỗi bất ngờ → `error.tsx` (admin có; store/CTV [Đích]); không lộ nội dung lỗi server (chỉ `digest`).
- **Thành công**: dòng trạng thái của `ActionForm`, hoặc redirect kèm query (vd `?saved=1`) → `Notice tone="success"`.
- **role**: `danger`/`warning` = `alert`, còn lại `status` — E2E bắt theo role, giữ nguyên khi refactor.

## 9. Checklist cho AI agent trước khi sửa UI

1. Tìm trong §7 trước. Chưa có → thêm vào `src/components/ui/` (dùng chung) hoặc `admin/ui.tsx` / `store/ui.tsx` (riêng khu) và ghi vào §7 trong cùng commit — **không** tạo component giống nhau trong thư mục trang.
2. Chuỗi class lặp ≥ 2 nơi → hằng hoặc component. Không thêm thư viện UI mới; không thêm JS client cho storefront khi không bắt buộc.
3. Màu qua token (§3), chữ theo thang (§4), spacing/bo góc theo §5, chiều cao control theo mật độ của portal (§2). Chuỗi hiển thị qua `messages/*`.
4. Sửa component dùng chung → grep nơi import, chạy spec các trang bị ảnh hưởng (mobile + desktop), **xem trực quan**.
5. Không đổi `name` input, `role`, `aria-label`, `data-testid` khi chỉ đổi giao diện (Server Action và E2E phụ thuộc).

## 10. Hiện trạng lệch và lộ trình (audit 26/11/2026)

Code hiện **không** còn màu palette thô / hex trong TSX. Các điểm còn lệch:

**P1 — rủi ro thấp, gần như không đổi hình** (`npm run check` + spec liên quan)
- Chuyển primitive chung lên `ui/` (Badge, EmptyState, Skeleton, Stat, Section/card class, TabNav/Segmented), `admin/ui.tsx` re-export.
- `FormMessage` chung: gom thông báo của `action-form.tsx:79-102`, `action-button.tsx:52`, `transition-form.tsx:78-84` và ~15 dòng gõ tay (`banner-form.tsx:120`, `catalog-forms.tsx:15`, `category-icon-upload.tsx:31-36`, `document-form.tsx:372`, `order-form.tsx:275`, `product-form.tsx:357`, `product-images.tsx:43-48`, `pick-print-button.tsx:42-47`, `checkout/page.tsx:115`, `products/new/page.tsx:60`).
- `text-[Npx]` → `text-2xs`: `ctv-nav.tsx:44`, `ctv/(portal)/layout.tsx:40`, `receive-bulk-form.tsx:687,770`, `store/header.tsx:65`.
- Tương phản: `ctv-nav.tsx:45` `text-brand` → `text-primary`.
- Card `rounded-lg` còn sót → `rounded-xl`/`Section`: `product-form.tsx:60,180,288,295,319`, `product-create-form.tsx:98`, `products/[id]/page.tsx:310,368,430`; panel tự viết `admin/(panel)/page.tsx:195` → `Section`.
- Bước kiểm grep trong `npm run check`: chặn palette thô, hex trong className, `text-[Npx]`.

**P2 — trung bình, chạm checkout/auth → full E2E**
- `error.tsx` cho storefront và CTV; `not-found` cho CTV; làm đầy `[locale]/not-found.tsx`.
- `EmptyState`/`Badge` cho store; `Field` + `SubmitButton` cho form store (25 nhãn tự viết ở `auth-forms`, `account-forms`, `checkout-form`, `track-form`, `catalog-filters`, `review-form`).
- CTV: control `touch` trên mobile (`ctv/(portal)/orders/page.tsx:40`, `account/page.tsx:32`, `FilterBar`).
- Gộp `Pagination` + `PageNumbers`.

**P3 — tuỳ chọn, đổi nhìn thấy được**
- Tách component nội bộ của trang dài: `products/[id]/page.tsx` (706 dòng), `inventory/page.tsx` (502), `orders/[id]/page.tsx` (487).
- Gộp `Stat`/`StatCard`; thống nhất tab store/CTV; chọn một tên màu nhấn (`primary` hay `brand-dark`).
