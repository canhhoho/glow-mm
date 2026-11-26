import Link from "next/link";
import { ArrowLeft, ChevronRight, Eye, Pencil, Plus, Search } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { FIELD } from "@/components/ui/field";
import { Badge, TONES } from "@/components/ui/badge";
import { FIELD_LABEL } from "@/components/ui/form-field";

/*
 * Primitive dùng chung ba portal nằm ở `components/ui/` (docs/design-system.md); file này re-export để trang admin/CTV
 * import một chỗ, và chỉ định nghĩa phần riêng admin/CTV (Page, PageHeader, Section, DataTable, FilterBar, Stat…).
 */
export { Badge, TONES } from "@/components/ui/badge";
export { Field } from "@/components/ui/form-field";
export { EmptyState } from "@/components/ui/empty-state";
export { BlockSkeleton } from "@/components/ui/skeleton";
export { PageNumbers } from "@/components/ui/pagination";
export { FormMessage } from "@/components/ui/form-message";
import { cn } from "@/lib/utils";

/** Khối giao diện nhỏ dùng chung cho các trang admin (server components). */

/** Vòng focus bàn phím cho link/nút dạng chữ (tab, trang số, ô chỉ số, mục menu) — cùng kiểu `FIELD`/`buttonVariants`. */
export const focusRing = "outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/** Checkbox/radio admin: một cỡ, một màu. */
export const checkboxClass = "size-4 accent-primary";

/**
 * Khung mọi trang admin: cùng độ rộng + khoảng cách giữa các khối.
 * `narrow`: trang form/cài đặt ngắn (tối đa 672px); `default`: danh sách, chi tiết, báo cáo — tràn hết chiều rộng (màn lớn không bị trống bên phải).
 */
export function Page({
  width = "default",
  className,
  children,
}: {
  width?: "narrow" | "default";
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("w-full space-y-5", width === "narrow" && "max-w-2xl", className)}>{children}</div>;
}

/** Tiêu đề trang; `description` = dòng phụ dưới tiêu đề; `back` = nút quay lại (luôn đứng đầu nhóm nút). */
export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold break-words">{title}</h1>
        {description && <div className="mt-0.5 text-sm text-muted-foreground">{description}</div>}
      </div>
      {(back || actions) && (
        <div className="flex flex-wrap items-center gap-2">
          {back && (
            <LinkButton href={back.href} icon="back">
              {back.label}
            </LinkButton>
          )}
          {actions}
        </div>
      )}
    </div>
  );
}

const LINK_ICONS = { new: Plus, back: ArrowLeft, edit: Pencil, view: Eye } as const;

export function LinkButton({
  href,
  children,
  variant = "outline",
  icon,
  iconOnly = false,
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "outline";
  /** `new` (+) cho nút tạo mới, `back` (←) cho nút quay lại. */
  icon?: keyof typeof LINK_ICONS;
  iconOnly?: boolean;
}) {
  const Icon = icon && LINK_ICONS[icon];
  return (
    <Link href={href} title={iconOnly && typeof children === "string" ? children : undefined} className={cn(buttonVariants({ variant: variant === "primary" ? "default" : "outline", size: iconOnly ? "icon-lg" : "lg" }))}>
      {Icon && <Icon aria-hidden />}
      {iconOnly ? <span className="sr-only">{children}</span> : children}
    </Link>
  );
}

/**
 * Thanh lọc (GET, chạy không cần JS): ô tìm + select + nút Lọc; điện thoại: ô tìm cả hàng, select ~2 ô một hàng.
 * Căn đáy (`items-end`): ô có nhãn phía trên (ngày) vẫn thẳng hàng với ô không nhãn.
 */
/**
 * Bộ lọc phụ thu gọn trong `FilterBar` (vẫn nằm trong form → gửi cùng nút Lọc); `open` = đang lọc bằng ô bên trong.
 * Dùng chung cho danh sách SP và đơn hàng (20/11/2026).
 */
export function AdvancedFilters({ label, open, children }: { label: string; open: boolean; children: React.ReactNode }) {
  return (
    <details className="group/adv w-full md:w-auto" open={open}>
      <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1 rounded-md px-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        {label}
      </summary>
      <div className="mt-2 flex flex-wrap items-end gap-2">{children}</div>
    </details>
  );
}

export function FilterBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <form
      role="search"
      className={cn(
        "flex flex-wrap items-end gap-2 [&>select]:min-w-0 [&>select]:flex-[1_1_9rem] sm:[&>select]:w-auto sm:[&>select]:flex-none",
        className,
      )}
    >
      {children}
    </form>
  );
}

/** Ô tìm kiếm có kính lúp — mọi trang danh sách dùng chung độ rộng. */
export function SearchInput({ label, className, ...props }: { label: string } & React.ComponentProps<"input">) {
  return (
    <div className={cn("relative w-full sm:w-72", className)}>
      <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" aria-hidden />
      <input type="search" name="q" placeholder={label} aria-label={label} {...props} className={cn(fieldClass, "pl-8")} />
    </div>
  );
}

/** Nút gửi của `FilterBar` — cao bằng ô nhập (h-9). */
export function FilterButton({ children }: { children: React.ReactNode }) {
  return (
    <button type="submit" className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
      {children}
    </button>
  );
}

/**
 * Tab trong trang (gạch chân, cuộn ngang trên điện thoại). `count` hiện số cạnh nhãn; `tone` tô số khi cần chú ý.
 * Viền dưới vẽ bằng shadow: border-b + -mb-px làm khung dư 1px → hiện thanh cuộn dọc ▲▼ trên Windows.
 */
export function TabNav({
  label,
  tabs,
}: {
  label: string;
  tabs: { href: string; label: React.ReactNode; active: boolean; count?: React.ReactNode; tone?: keyof typeof TONES }[];
}) {
  return (
    <nav
      aria-label={label}
      className="-mx-4 flex gap-1 overflow-x-auto overflow-y-hidden px-4 text-sm shadow-[inset_0_-1px_0_var(--color-border)] md:mx-0 md:px-0"
    >
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.active ? "page" : undefined}
          className={cn(
            "inline-flex items-center gap-1.5 border-b-2 px-3 py-2 whitespace-nowrap",
            focusRing,
            tab.active ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
          {tab.count !== undefined &&
            (tab.tone ? (
              <Badge tone={tab.tone}>{tab.count}</Badge>
            ) : (
              <span className="text-xs text-muted-foreground tabular-nums">{tab.count}</span>
            ))}
        </Link>
      ))}
    </nav>
  );
}

/** Khối nội dung có khung + tiêu đề (form tạo mới, nhóm thông tin). */
export function Section({
  id,
  title,
  actions,
  className,
  children,
  testId,
  collapsible = false,
  defaultOpen = false,
}: {
  /** Neo `#id` để link nhảy tới khối (thêm `scroll-mt-*` qua `className` nếu có header dính). */
  id?: string;
  title?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
  testId?: string;
  /** Khối ít dùng: tiêu đề là nút thu gọn/mở (`<details>`, chạy không cần JS); `defaultOpen` = mở sẵn. */
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  if (collapsible && title) {
    return (
      <section id={id} className={cn("min-w-0 rounded-xl border bg-card p-4", className)} data-testid={testId} aria-label={typeof title === "string" ? title : undefined}>
        <details open={defaultOpen} className="group/section">
          <summary className={cn("flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 rounded-md font-medium [&::-webkit-details-marker]:hidden", focusRing)}>
            <span className="flex items-center gap-1.5">
              <ChevronRight className="size-4 text-muted-foreground transition-transform group-open/section:rotate-90" aria-hidden />
              {title}
            </span>
            {actions}
          </summary>
          <div className="mt-3 space-y-3">{children}</div>
        </details>
      </section>
    );
  }
  return (
    // Tiêu đề chữ → section có tên (role region) để trình đọc màn hình/E2E tìm theo tên khối.
    <section id={id} className={cn("min-w-0 space-y-3 rounded-xl border bg-card p-4", className)} data-testid={testId} aria-label={typeof title === "string" ? title : undefined}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="font-medium">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

/** Thông báo đã lưu / lỗi ngắn ở đầu trang — bản dùng chung (`components/ui/notice`). */
export { Notice } from "@/components/ui/notice";

/**
 * `numeric`: chỉ số các cột số — tiêu đề căn phải cho thẳng với số (ô dữ liệu tự đặt `text-right`).
 * `stack`: dưới md mỗi dòng thành một thẻ, mỗi ô một hàng "nhãn: giá trị" (nhãn lấy từ `<Td label>`;
 * ô không có nhãn chiếm cả hàng — dùng cho tiêu đề thẻ / nút thao tác). Bảng nhiều cột khỏi phải cuộn ngang trên điện thoại.
 */
export function DataTable({
  head,
  children,
  empty,
  numeric = [],
  stack = false,
  dense = false,
  className,
  tableClassName,
  cols,
  middle = false,
}: {
  head: React.ReactNode[];
  children: React.ReactNode;
  empty?: string;
  numeric?: number[];
  stack?: boolean;
  /** Bảng phụ (vd lô trong dòng mở rộng): chữ xs, ô thấp hơn (py-1.5). */
  dense?: boolean;
  /** Lớp thêm cho khung ngoài (vd nền `bg-background` khi lồng trong dòng khác). */
  className?: string;
  /** Lớp thêm cho `<table>` (vd `min-w-[1050px]` để cuộn ngang thay vì bóp cột). */
  tableClassName?: string;
  /** Lớp độ rộng từng cột (`<colgroup>`), vd `md:w-[24%]` — dùng với `table-fixed` để chia cột theo nội dung. */
  cols?: string[];
  /** Căn giữa dọc mọi ô (máy tính) — bảng một hàng/dòng có badge, nút (vd Tài khoản). Mặc định căn trên cho ô nhiều dòng. */
  middle?: boolean;
}) {
  const hasRows = Array.isArray(children) ? children.length > 0 : !!children;
  // min-w-0: bảng nằm trong grid/flex vẫn tự cuộn ngang, không kéo giãn khối cha (gây tràn trang trên điện thoại).
  return (
    <div className={cn("relative min-w-0 overflow-x-auto rounded-xl border bg-card", className)}>
      <table className={cn("w-full text-sm", stack && STACK, dense && DENSE, middle && "md:[&_td]:align-middle", tableClassName)}>
        {cols && (
          <colgroup className={cn(stack && "max-md:hidden")}>
            {cols.map((c, i) => (
              <col key={i} className={c} />
            ))}
          </colgroup>
        )}
        <thead className={cn("bg-muted/50 text-left text-xs text-muted-foreground", stack && "max-md:hidden")}>
          <tr>
            {head.map((h, i) => (
              // Tiêu đề chữ được xuống dòng khi thiếu chỗ (căn đáy cho thẳng hàng) — tránh tiêu đề dài kéo bảng tràn khung;
              // tiêu đề cột số giữ một dòng, căn phải như số.
              <th key={i} className={cn("px-3 py-2 align-bottom font-medium", numeric.includes(i) ? "text-right whitespace-nowrap" : "text-balance")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y [&>tr:hover]:bg-muted/30">
          {hasRows ? (
            children
          ) : (
            <tr>
              <td colSpan={head.length} className="px-3 py-6 text-center text-muted-foreground">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** `DataTable dense`: chữ nhỏ + ô thấp; selector con thắng `py-2` của `Td`. */
const DENSE = "text-xs [&_td]:py-1.5 [&_th]:py-1.5";

/** Lớp cho `DataTable stack`: dòng → thẻ, ô → hàng flex có nhãn `data-label` bên trái (chỉ dưới md). */
const STACK = [
  "max-md:block max-md:[&_tbody]:block max-md:[&_tr]:block max-md:[&_tr]:space-y-1.5 max-md:[&_tr]:p-3",
  "max-md:[&_td]:flex max-md:[&_td]:gap-3 max-md:[&_td]:p-0 max-md:[&_td]:text-left",
  "max-md:[&_td[data-label]]:before:w-24 max-md:[&_td[data-label]]:before:flex-none max-md:[&_td[data-label]]:before:text-xs",
  "max-md:[&_td[data-label]]:before:text-muted-foreground max-md:[&_td[data-label]]:before:content-[attr(data-label)]",
].join(" ");

/** `label`: nhãn hiện trước ô khi bảng `stack` xếp thành thẻ trên điện thoại. `numeric`: căn phải + số đều (đi cùng `DataTable numeric`). */
export function Td({ children, className, label, numeric = false }: { children?: React.ReactNode; className?: string; label?: string; numeric?: boolean }) {
  return (
    <td data-label={label} className={cn("px-3 py-2 align-top", numeric && "text-right tabular-nums", className)}>
      {/* Bọc 1 lớp: ở chế độ thẻ ô là flex → nội dung nhiều dòng (tên + SĐT) vẫn xếp dọc. */}
      <div className="min-w-0 flex-1">{children}</div>
    </td>
  );
}

/** Ô nhập admin cao 36px (h-9) — nút cạnh ô dùng `size="lg"` (cũng h-9) để thẳng hàng. */
export const fieldClass = FIELD.compact;

/** Nhãn trường admin/CTV (chữ nhãn màu phụ) — xem `FIELD_LABEL` trong `components/ui/form-field`. */
export const fieldLabelClass = FIELD_LABEL.compact;

/** Nhãn nhỏ (text-xs) cho form dày đặc: dòng nhập lô, bảng nhập nhiều cột. */
export const fieldLabelSmClass = FIELD_LABEL.compactSm;

/** Màu nền + màu icon của ô chỉ số có icon. */
export const ICON_TONES = {
  brand: "bg-primary/10 text-primary",
  green: "bg-secondary text-brand-2",
  success: "bg-success-muted text-success",
  warning: "bg-warning-muted text-warning",
  danger: "bg-danger-muted text-destructive",
  neutral: "bg-muted text-muted-foreground",
} as const;

/** Ô không icon: `tone` tô màu con số (chỉ khi cần chú ý). `green`/`neutral` giữ màu chữ thường. */
const VALUE_TONES: Partial<Record<keyof typeof ICON_TONES, string>> = {
  brand: "text-primary",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
};

/**
 * Ô chỉ số dùng chung (báo cáo, hàng đợi, tổng kho, cổng CTV) — một component cho hai kiểu (gộp Stat + StatCard 26/11/2026):
 * - không `icon`: nhãn trên, số dưới; `tone` tô màu số; `hint` = dòng nhỏ dưới số (kỳ / phạm vi / điều kiện).
 * - có `icon`: icon tròn màu nhạt (`tone`) bên trái + số lớn + nhãn.
 * `href` → bấm được; `active` → viền màu chính (đang lọc theo ô này). Nhãn xuống dòng tối đa 2, không cắt "…".
 */
export function Stat({
  icon,
  label,
  value,
  href,
  tone = "neutral",
  hint,
  active = false,
  testId,
}: {
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
  href?: string;
  tone?: keyof typeof ICON_TONES;
  hint?: React.ReactNode;
  active?: boolean;
  testId?: string;
}) {
  const labelEl = (
    <span className="line-clamp-2 block text-sm leading-snug break-words text-muted-foreground" title={label}>
      {label}
    </span>
  );
  const hintEl = hint && <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>;
  const body = icon ? (
    <>
      <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl [&_svg]:size-5", ICON_TONES[tone])} aria-hidden>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-xl leading-tight font-semibold tabular-nums">{value}</span>
        {labelEl}
        {hintEl}
      </span>
    </>
  ) : (
    <>
      {labelEl}
      <span className={cn("block text-xl leading-tight font-semibold tabular-nums", VALUE_TONES[tone])}>{value}</span>
      {hintEl}
    </>
  );
  const cls = cn(
    "min-w-0 rounded-xl border bg-card p-3 shadow-xs",
    icon ? "flex items-center gap-3" : "block",
    active && "border-primary/50 bg-primary/5",
  );
  return href ? (
    <Link href={href} className={cn(cls, "transition-colors hover:border-primary/40", focusRing)} data-testid={testId} aria-current={active ? "page" : undefined}>
      {body}
    </Link>
  ) : (
    <div className={cls} data-testid={testId}>
      {body}
    </div>
  );
}

/** Liên kết "Xoá lọc" đặt cuối `FilterBar` — một kiểu chung. */
export function ClearFilters({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={cn(focusRing, "self-center rounded text-sm text-primary underline")}>
      {children}
    </Link>
  );
}

/**
 * Ô Từ ngày / Đến ngày + nút khoảng nhanh (Hôm nay, 7 ngày, 30 ngày, Tháng này, Tháng trước) — đặt trong `FilterBar`
 * (21/11/2026, audit #10). Nút nhanh là link (không JS), `presets` dựng bằng `datePresetItems` (`lib/date-range.ts`).
 */
export function DateRangeFields({
  from,
  to,
  fromLabel,
  toLabel,
  presetsLabel,
  presets,
}: {
  from?: string;
  to?: string;
  fromLabel: string;
  toLabel: string;
  presetsLabel: string;
  presets: { key: string; href: string; label: string; active: boolean }[];
}) {
  return (
    <>
      <div className="w-full max-w-full overflow-x-auto" data-testid="date-presets">
        <Segmented label={presetsLabel} items={presets} />
      </div>
      <label className={fieldLabelClass}>
        <span>{fromLabel}</span>
        <input type="date" name="from" defaultValue={from} className={cn(fieldClass, "w-40")} />
      </label>
      <label className={fieldLabelClass}>
        <span>{toLabel}</span>
        <input type="date" name="to" defaultValue={to} className={cn(fieldClass, "w-40")} />
      </label>
    </>
  );
}

/**
 * Nút chuyển chế độ/khoảng (link, không JS): dashboard (khoảng ngày), kho (kiểu xem), data-health (kỳ).
 * `active` → `aria-current`.
 */
export function Segmented({ label, items }: { label: string; items: { key?: string; href: string; label: React.ReactNode; active: boolean }[] }) {
  return (
    <nav aria-label={label} className="inline-flex rounded-lg border bg-card p-0.5 text-sm">
      {items.map((item) => (
        <Link
          key={item.key ?? item.href}
          href={item.href}
          aria-current={item.active ? "true" : undefined}
          className={cn(focusRing, "rounded-md px-3 py-1.5 whitespace-nowrap", item.active ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:text-foreground")}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

/** Mục trong menu ⋯ (`ActionMenu`): cùng cỡ, hover và focus ở mọi menu. */
export const MENU_ITEM = cn(focusRing, "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted");
