# Design System T&C — quy chuẩn giao diện

> **Nguồn duy nhất** cho quy tắc UI của Storefront, Admin, cổng CTV (chốt 26/11/2026). Dành cho người và AI agent: đọc mục cần trước khi tạo/sửa giao diện.
> Thay cho các tài liệu lịch sử: `UI_AUDIT.md`, `docs/ke-hoach-refactor-ui.md`, `docs/ui-action-audit-2026-11-08.md`, `docs/dong-bo-ui-admin-2026-11-12.md`.
> Ký hiệu **[Đích]** = quy tắc đã chốt nhưng code chưa theo hết (xem §10).

## 1. Quyết định đã chốt

| # | Quyết định | Ngày |
|---|---|---|
| 1 | Không dark mode (biến thể `dark:` bị khoá trong `globals.css`) | 09/11 |
| 2 | Màu trạng thái qua token `success/warning/danger`; store đổi success sang xanh `#2f6b4c` | 09/11 |
| 3 | Xác nhận thao tác = hộp gốc trình duyệt qua `src/lib/confirm.ts` — **không modal** | 09/11 |
| 4 | Card/khung/bảng bo **`rounded-xl`** (thay quyết định cũ `rounded-lg`, khớp code hiện tại) | 26/11 |
| 5 | Cổng CTV dùng **thành phần admin + theme mặc định**, nhưng control **cao 44px dưới md**: khung CTV đặt `data-density="touch"`, `FIELD.compact` và Button `lg` tự cao h-11 trong vùng đó (`TOUCH_ON_MOBILE` ở `ui/field.ts`) | 26/11 |
| 6 | Không toast: thông báo đặt tại chỗ (`Notice`, dòng trạng thái của form) | 26/11 |
| 7 | Primitive dùng chung ba portal nằm ở `src/components/ui/`; `admin/ui.tsx` re-export phần chung (trang admin/CTV import một chỗ), `store/ui.tsx` chỉ giữ phần riêng store | 26/11 |

## 2. Ba portal

| | Storefront `src/app/[locale]` | Admin `src/app/admin` | CTV `src/app/ctv` |
|---|---|---|---|
| Người dùng | Khách, điện thoại, Slow 3G | Nhân viên, máy tính (dùng được điện thoại) | CTV, chủ yếu điện thoại |
| Theme | `data-theme="store"` (nền kem, chữ ink) | mặc định (nền trắng) | mặc định |
| Mật độ | `touch`: control h-11 | `compact`: control h-9 | `compact`, tự cao h-11 dưới md (`data-density="touch"`) |
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
- Khối con lồng trong một card (dòng biến thể, dòng hàng trong form) được dùng `rounded-lg border p-3`.
- **Viền**: admin/CTV khối = `rounded-xl border bg-card`; store khối = `storeCard` (`ring-1 ring-border`). Không trộn hai kiểu trong cùng khu.
- **Bóng**: chỉ cho lớp nổi — menu/popover `shadow-md`, ngăn kéo `shadow-xl`, FAB `shadow-lg`, header store `shadow-sm`. Card không bóng (ngoại lệ `Stat`/`StatCard` `shadow-xs`).

## 6. Icon, layout, responsive

- Icon: **chỉ `lucide-react`**. `size-4` trong nút/chữ (mặc định của `buttonVariants`), `size-5` ở nav/header. Icon trang trí `aria-hidden`; nút chỉ icon phải có `aria-label` hoặc `sr-only` + `title`. Không dùng emoji/ký tự làm icon (ngoại lệ ★ đánh giá, có `aria-label`).
- Nút: lưu/tạo mới/hàng loạt = icon + chữ (Save, Plus, …); thao tác theo dòng có thể chỉ icon (`iconOnly`).
- Mobile-first, breakpoint mặc định Tailwind. Vùng bấm ≥ 44px trên store/CTV và mọi nút icon trên mobile (`icon-lg` = 44px mobile / 36px md+).
- Không tự đặt container/độ rộng trong trang: admin/CTV dùng `Page` (`width="narrow"` cho form/cài đặt); store đã có khung trong layout.
- Bảng admin nhiều cột trên mobile: `DataTable stack` + `Td label`, không bắt cuộn ngang.

## 7. Danh mục component — cần gì dùng gì

Lõi dùng chung ở `src/components/ui/`: `button-variants`, `field` (`FIELD`), `form-field` (`Field`, `FIELD_LABEL`), `notice`, `form-message`, `submit-button`, `badge`, `empty-state` (`EmptyState`, `NotFoundState`), `skeleton`, `error-state`, `pagination` (`Pagination`, `PageNumbers`), `confirm-submit`, `password-toggle`. Trang admin/CTV import qua `@/components/admin/ui` (đã re-export).

| Cần | Admin / CTV | Storefront | Ghi chú |
|---|---|---|---|
| Nút | `<Button size="lg">`; link dạng nút `LinkButton` hoặc `buttonVariants({ size: "lg" })` | `primaryButton` / `outlineButton` trên `<button>`/`<Link>` | Biến thể: `default` (một nút chính mỗi khối) · `outline` (phụ) · `ghost` (trong thanh/menu) · `destructive` · `link`. Không override chiều cao bằng `h-10`… — dùng size |
| Nút gửi form có trạng thái chờ | `ActionForm` tự hiện vòng quay | `SubmitButton pending icon className={primaryButton}` | `pending` → khoá + `aria-busy` + icon thành vòng quay |
| Gửi server action | `ActionForm` (form + thông báo), `ActionButton` (một nút), `TransitionForm` (chỉ chuyển trạng thái đơn) | form + `useActionState` trong client component | Prop `confirm` để hỏi xác nhận |
| Nút xác nhận trong server component | `ConfirmSubmitButton` | như admin | Không modal |
| Ô nhập / select / textarea | `fieldClass` (= `FIELD.compact`) | `storeField` (= `FIELD.touch`) | **Không** dùng `ui/input.tsx`, `ui/label.tsx` (test chặn; còn sót ở màn đăng nhập admin) |
| Nhãn trường | `Field` / `fieldLabelClass` (`fieldLabelSmClass` cho form dày) | `storeLabel` hoặc `<Field density="touch">` | Cùng nguồn `FIELD_LABEL`. Lỗi theo trường: `aria-invalid` trên ô + `Field error` |
| Checkbox / radio | `checkboxClass` | | |
| Mật khẩu / địa chỉ | `PasswordToggle` / `AddressPicker` | như admin | |
| Bộ lọc | `FilterBar` + `SearchInput` + select `fieldClass` + `AdvancedFilters` + `DateRangeFields` + `FilterButton` + `ClearFilters` | `catalog-filters.tsx` | Form GET, chạy không cần JS |
| Bảng | `DataTable` + `Td` (`numeric`, `stack`, `dense`, `empty`, `cols`) | — | Ngoại lệ được phép: trang in, `receive-bulk-form` |
| Phân trang | `PageNumbers` (danh sách lớn) | `Pagination` | Cùng file `ui/pagination.tsx`; ô số trang 44px trên mobile |
| Khối / card | `Section` (`title`, `actions`, `collapsible`) | `storeCard`, `storeListCard`, `StoreSection` | Không gõ tay `<section className="rounded-…">` |
| Tab | `TabNav` (điều hướng giữa trang), `Segmented` (chế độ xem/khoảng ngày); tab nhóm menu ở `section-tabs.tsx` | `account-shell.tsx` | |
| Badge | `Badge tone` (`neutral/success/warning/danger/brand`) | như admin | Map trạng thái → tone ở `status-tones.ts`, `order-badges.tsx` — không map trong page |
| Chỉ số | `Stat`, `StatCard` | — | |
| Hộp thông báo | `Notice tone` | như admin | Có nền, đầu trang/khối |
| Dòng thông báo cạnh form | `FormMessage tone` (`error/success/warning/muted`) | như admin | Không gõ tay `<p role="alert" className="text-destructive">` |
| Rỗng | `DataTable empty`, `EmptyState` (`action` = bước tiếp theo) | `EmptyState` | |
| Đang tải | `BlockSkeleton` | `PageSkeleton`, `GridSkeleton`; khối lẻ `Skeleton` | `ui/skeleton.tsx` |
| Lỗi bất ngờ / 404 | `error.tsx` → `ErrorState`; `not-found.tsx` → `NotFoundState` | như admin (`density="touch"`) | Có ở cả 3 portal |
| Menu ⋯ | `ActionMenu` + `MENU_ITEM` | — | |
| Breadcrumb | tự có trong `admin-shell` | `Breadcrumb` | |
| Modal / toast | **Không có, không thêm** | | Dùng trang riêng, `Section collapsible`, `<details>`, confirm gốc. Thêm Dialog = cần duyệt (JS client, CSP, ~35 chỗ E2E bắt `dialog`) |

## 8. Trạng thái: Loading · Empty · Error · Thông báo

- **Loading**: `Suspense` theo khối, skeleton cùng kích thước nội dung thật (không nhảy layout); store skeleton `min-h-dvh`. Không spinner toàn trang. Nút gửi: `SubmitButton`/`ActionForm` (khoá + vòng quay khi pending).
- **Empty**: luôn có câu giải thích (i18n) và, nếu người dùng có quyền, hành động kế tiếp (nút/link tạo mới, xoá lọc).
- **Error**: lỗi nghiệp vụ từ action → hiện gần nút (`ActionForm`/`Notice tone="danger"`); lỗi trường → `aria-invalid` + chữ dưới ô, focus vào ô lỗi đầu tiên; lỗi bất ngờ → `error.tsx` + `ErrorState` (cả 3 portal; đường dẫn sai trong admin/CTV → `[...missing]` → 404 trong khung); không lộ nội dung lỗi server (chỉ `digest`).
- **Thành công**: dòng trạng thái của `ActionForm`, hoặc redirect kèm query (vd `?saved=1`) → `Notice tone="success"`.
- **role**: `danger`/`warning` = `alert`, còn lại `status` — E2E bắt theo role, giữ nguyên khi refactor.

## 9. Checklist cho AI agent trước khi sửa UI

1. Tìm trong §7 trước. Test `tests/unit/ui-rules.test.ts` (chạy trong `npm run check`) chặn màu palette thô, hex trong class, `text-[Npx]`, `text-brand` cho chữ, import `ui/input`/`ui/label`.
    Chưa có → thêm vào `src/components/ui/` (dùng chung) hoặc `admin/ui.tsx` / `store/ui.tsx` (riêng khu) và ghi vào §7 trong cùng commit — **không** tạo component giống nhau trong thư mục trang.
2. Chuỗi class lặp ≥ 2 nơi → hằng hoặc component. Không thêm thư viện UI mới; không thêm JS client cho storefront khi không bắt buộc.
3. Màu qua token (§3), chữ theo thang (§4), spacing/bo góc theo §5, chiều cao control theo mật độ của portal (§2). Chuỗi hiển thị qua `messages/*`.
4. Sửa component dùng chung → grep nơi import, chạy spec các trang bị ảnh hưởng (mobile + desktop), **xem trực quan**.
5. Không đổi `name` input, `role`, `aria-label`, `data-testid` khi chỉ đổi giao diện (Server Action và E2E phụ thuộc).

## 10. Hiện trạng và lộ trình

**Đã làm 26/11/2026 (P1 + P2 của audit):** primitive chung chuyển lên `ui/` (Badge, EmptyState, NotFoundState, Skeleton, FormMessage, SubmitButton, Field/FIELD_LABEL, ErrorState, PageNumbers); gom ~20 dòng thông báo gõ tay vào `FormMessage`; bỏ `text-[Npx]`; sửa tương phản thanh mục CTV; card trang sản phẩm về `rounded-xl`, panel dashboard dùng `Section`; `error.tsx` cho storefront + CTV, 404 trong khung CTV, 404 storefront có gợi ý + nút Tìm sản phẩm; form storefront dùng `storeLabel` + `SubmitButton`; trạng thái rỗng/badge storefront dùng component chung; control CTV 44px dưới md; gộp phân trang vào một file; test `ui-rules`.

**Còn lại**
- Hộp thông báo gõ tay chưa đổi (khác kiểu, giữ để không đổi role/E2E): `checkout/page.tsx:116`, `action-form.tsx` (khối secret), `bulk-order-bar.tsx`, `receive-bulk-form.tsx` (khối kết quả), `order/[code]/page.tsx:54`.
- Màn đăng nhập admin còn `ui/input` + `ui/label` (`login-form.tsx`).
- **P3 (tuỳ chọn, đổi nhìn thấy được):** tách component nội bộ của `products/[id]/page.tsx` (706 dòng), `inventory/page.tsx` (502), `orders/[id]/page.tsx` (487); gộp `Stat`/`StatCard`; thống nhất tab store/CTV; chọn một tên màu nhấn (`primary` hay `brand-dark`).
