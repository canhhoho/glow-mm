import Link from "next/link";
import { ArrowLeft, Eye, Pencil, Plus, Search } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { FIELD } from "@/components/ui/field";
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
}: {
  /** Neo `#id` để link nhảy tới khối (thêm `scroll-mt-*` qua `className` nếu có header dính). */
  id?: string;
  title?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    // Tiêu đề chữ → section có tên (role region) để trình đọc màn hình/E2E tìm theo tên khối.
    <section id={id} className={cn("space-y-3 rounded-xl border bg-card p-4", className)} data-testid={testId} aria-label={typeof title === "string" ? title : undefined}>
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
}) {
  const hasRows = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <div className={cn("relative overflow-x-auto rounded-xl border bg-card", className)}>
      <table className={cn("w-full text-sm", stack && STACK, dense && DENSE, tableClassName)}>
        <thead className={cn("bg-muted/50 text-left text-xs text-muted-foreground", stack && "max-md:hidden")}>
          <tr>
            {head.map((h, i) => (
              <th key={i} className={cn("px-3 py-2 font-medium whitespace-nowrap", numeric.includes(i) && "text-right")}>
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

export const TONES = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-success-muted text-success-foreground",
  warning: "bg-warning-muted text-warning-foreground",
  danger: "bg-danger-muted text-danger-foreground",
  brand: "bg-primary/10 text-primary",
} as const;

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof TONES; children: React.ReactNode }) {
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", TONES[tone])}>{children}</span>;
}

/** Ô nhập admin cao 36px (h-9) — nút cạnh ô dùng `size="lg"` (cũng h-9) để thẳng hàng. */
export const fieldClass = FIELD.compact;

/**
 * Nhãn trường: chữ nằm TRÊN ô (grid). Không dùng `space-y-1` — span + ô inline sẽ đứng cạnh nhau khi ô không `w-full`.
 * Chữ nhãn (span đầu tiên) luôn màu phụ — mọi form cùng một kiểu, kể cả nơi quên đặt màu cho span.
 */
export const fieldLabelClass = "grid content-start gap-1 text-sm [&>span:first-child]:text-muted-foreground";

/** Nhãn nhỏ (text-xs) cho form dày đặc: dòng nhập lô, bảng nhập nhiều cột. */
export const fieldLabelSmClass = "grid content-start gap-1 text-xs [&>span:first-child]:text-muted-foreground";

/** Ô form có nhãn phía trên (chữ nhãn màu phụ). `hint` = dòng gợi ý nhỏ dưới ô. */
export function Field({ label, hint, className, children }: { label: React.ReactNode; hint?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn(fieldLabelClass, className)}>
      <span className="text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

/** Ô chỉ số không icon (báo cáo, hàng đợi): cùng khung với `StatCard`; `tone` tô số khi cần chú ý; có `href` thì bấm được. */
export function Stat({
  label,
  value,
  href,
  tone = "neutral",
  hint,
  testId,
}: {
  label: string;
  value: React.ReactNode;
  href?: string;
  tone?: "neutral" | "warning" | "danger";
  /** Dòng nhỏ dưới số: kỳ / phạm vi / điều kiện của chỉ số. */
  hint?: React.ReactNode;
  testId?: string;
}) {
  const body = (
    <>
      <div className="truncate text-sm text-muted-foreground">{label}</div>
      <div
        className={cn(
          "text-xl leading-tight font-semibold tabular-nums",
          tone === "warning" && "text-warning",
          tone === "danger" && "text-destructive",
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </>
  );
  const cls = "block min-w-0 rounded-xl border bg-card p-3 shadow-xs";
  return href ? (
    <Link href={href} className={cn(cls, "transition-colors hover:border-primary/40", focusRing)} data-testid={testId}>
      {body}
    </Link>
  ) : (
    <div className={cls} data-testid={testId}>
      {body}
    </div>
  );
}

export const ICON_TONES = {
  brand: "bg-primary/10 text-primary",
  green: "bg-secondary text-brand-2",
  success: "bg-success-muted text-success",
  warning: "bg-warning-muted text-warning",
  danger: "bg-danger-muted text-destructive",
  neutral: "bg-muted text-muted-foreground",
} as const;

/**
 * Ô chỉ số có icon (P3, thiết kế mới): icon tròn màu nhạt + số lớn + nhãn. `href` → bấm được; `active` → viền màu chính
 * (đang lọc theo ô này).
 */
export function StatCard({
  icon,
  label,
  value,
  tone = "neutral",
  href,
  active = false,
  testId,
}: {
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
  tone?: keyof typeof ICON_TONES;
  href?: string;
  active?: boolean;
  testId?: string;
}) {
  const body = (
    <>
      {icon && (
        <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl [&_svg]:size-5", ICON_TONES[tone])} aria-hidden>
          {icon}
        </span>
      )}
      <span className="min-w-0">
        <span className="block text-xl leading-tight font-semibold tabular-nums">{value}</span>
        <span className="block truncate text-sm text-muted-foreground">{label}</span>
      </span>
    </>
  );
  const cls = cn("flex items-center gap-3 rounded-xl border bg-card p-3 shadow-xs", active && "border-primary/50 bg-primary/5");
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

/**
 * Phân trang số trang (P3): « 1 2 3 … n » + trạng thái "Hiển thị a–b trên n" + cỡ trang (link). Không cần JS.
 */
export function PageNumbers({
  page,
  pageCount,
  pageSize,
  pageSizes,
  status,
  sizeLabel,
  prevLabel,
  nextLabel,
  href,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  /** Không truyền → ẩn bộ chọn cỡ trang (trang có cỡ cố định). */
  pageSizes?: readonly number[];
  status: React.ReactNode;
  sizeLabel?: string;
  prevLabel: string;
  nextLabel: string;
  href: (page: number, size?: number) => string;
}) {
  const near = new Set([1, pageCount, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pageCount));
  const pages = [...near].sort((a, b) => a - b);
  const btn = cn(focusRing, "inline-flex size-9 items-center justify-center rounded-md border text-sm tabular-nums");
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm" data-testid="pager">
      <span className="text-muted-foreground" data-testid="page-info">{status}</span>
      <div className="flex flex-wrap items-center gap-3">
        {pageSizes && pageSizes.length > 1 && (
        <span className="flex items-center gap-1 text-muted-foreground">
          {sizeLabel}
          {pageSizes.map((s) => (
            <Link key={s} href={href(1, s)} aria-current={s === pageSize ? "true" : undefined} className={cn(focusRing, "rounded px-1.5 py-0.5 tabular-nums", s === pageSize ? "bg-muted font-medium text-foreground" : "hover:text-foreground")}>
              {s}
            </Link>
          ))}
        </span>
        )}
        {pageCount > 1 && (
          <nav aria-label={status ? String(status) : undefined} className="flex items-center gap-1">
            {page > 1 ? (
              <Link href={href(page - 1)} className={btn} aria-label={prevLabel}>‹</Link>
            ) : (
              <span className={cn(btn, "opacity-40")} aria-hidden>‹</span>
            )}
            {pages.map((p, i) => (
              <span key={p} className="flex items-center gap-1">
                {i > 0 && p - pages[i - 1] > 1 && <span className="px-1 text-muted-foreground">…</span>}
                <Link href={href(p)} aria-current={p === page ? "page" : undefined} className={cn(btn, p === page ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
                  {p}
                </Link>
              </span>
            ))}
            {page < pageCount ? (
              <Link href={href(page + 1)} className={btn} aria-label={nextLabel}>›</Link>
            ) : (
              <span className={cn(btn, "opacity-40")} aria-hidden>›</span>
            )}
          </nav>
        )}
      </div>
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
 * Nút chuyển chế độ/khoảng (link, không JS): dashboard (khoảng ngày), kho (kiểu xem), data-health (kỳ).
 * `active` → `aria-current`.
 */
export function Segmented({ label, items }: { label: string; items: { href: string; label: React.ReactNode; active: boolean }[] }) {
  return (
    <nav aria-label={label} className="inline-flex rounded-lg border bg-card p-0.5 text-sm">
      {items.map((item) => (
        <Link
          key={item.href}
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

/** Trạng thái rỗng ngoài bảng (danh sách thẻ, khối không có dữ liệu). */
export function EmptyState({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("rounded-xl border bg-card px-3 py-6 text-center text-sm text-muted-foreground", className)}>{children}</p>;
}

/** Khung chờ cho một khối đang tải (Suspense/loading.tsx). */
export function BlockSkeleton({ label, className }: { label?: string; className?: string }) {
  return (
    <section aria-label={label} aria-busy="true" className="space-y-2">
      {label && <h2 className="font-medium">{label}</h2>}
      <div aria-hidden className={cn("h-28 animate-pulse rounded-xl bg-muted", className)} />
    </section>
  );
}

/** Mục trong menu ⋯ (`ActionMenu`): cùng cỡ, hover và focus ở mọi menu. */
export const MENU_ITEM = cn(focusRing, "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted");
