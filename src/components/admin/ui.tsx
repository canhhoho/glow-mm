import Link from "next/link";
import { ArrowLeft, Plus, Search } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Khối giao diện nhỏ dùng chung cho các trang admin (server components). */

/**
 * Khung mọi trang admin: cùng độ rộng tối đa + khoảng cách giữa các khối.
 * `narrow`: trang form/cài đặt ngắn; `default`: danh sách, chi tiết, báo cáo.
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
  return <div className={cn("w-full space-y-5", width === "narrow" ? "max-w-2xl" : "max-w-7xl", className)}>{children}</div>;
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

const LINK_ICONS = { new: Plus, back: ArrowLeft } as const;

export function LinkButton({
  href,
  children,
  variant = "outline",
  icon,
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "outline";
  /** `new` (+) cho nút tạo mới, `back` (←) cho nút quay lại. */
  icon?: keyof typeof LINK_ICONS;
}) {
  const Icon = icon && LINK_ICONS[icon];
  return (
    <Link href={href} className={cn(buttonVariants({ variant: variant === "primary" ? "default" : "outline", size: "lg" }))}>
      {Icon && <Icon aria-hidden />}
      {children}
    </Link>
  );
}

/** Thanh lọc (GET, chạy không cần JS): ô tìm + select + nút Lọc; điện thoại: ô tìm cả hàng, select ~2 ô một hàng. */
export function FilterBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <form
      role="search"
      className={cn(
        "flex flex-wrap items-center gap-2 [&>select]:min-w-0 [&>select]:flex-[1_1_9rem] sm:[&>select]:w-auto sm:[&>select]:flex-none",
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
  title,
  actions,
  className,
  children,
  testId,
}: {
  title?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <section className={cn("space-y-3 rounded-lg border p-4", className)} data-testid={testId}>
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

/** Thông báo đã lưu / lỗi ngắn ở đầu trang. */
export function Notice({ tone = "success", children }: { tone?: "success" | "danger"; children: React.ReactNode }) {
  return (
    <p
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "rounded-md px-3 py-2 text-sm",
        tone === "success"
          ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
          : "bg-destructive/10 text-destructive",
      )}
    >
      {children}
    </p>
  );
}

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
}: {
  head: React.ReactNode[];
  children: React.ReactNode;
  empty?: string;
  numeric?: number[];
  stack?: boolean;
}) {
  const hasRows = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className={cn("w-full text-sm", stack && STACK)}>
        <thead className={cn("bg-muted/50 text-left text-xs text-muted-foreground", stack && "max-md:hidden")}>
          <tr>
            {head.map((h, i) => (
              <th key={i} className={cn("px-3 py-2 font-medium whitespace-nowrap", numeric.includes(i) && "text-right")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
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

/** Lớp cho `DataTable stack`: dòng → thẻ, ô → hàng flex có nhãn `data-label` bên trái (chỉ dưới md). */
const STACK = [
  "max-md:block max-md:[&_tbody]:block max-md:[&_tr]:block max-md:[&_tr]:space-y-1.5 max-md:[&_tr]:p-3",
  "max-md:[&_td]:flex max-md:[&_td]:gap-3 max-md:[&_td]:p-0 max-md:[&_td]:text-left",
  "max-md:[&_td[data-label]]:before:w-24 max-md:[&_td[data-label]]:before:flex-none max-md:[&_td[data-label]]:before:text-xs",
  "max-md:[&_td[data-label]]:before:text-muted-foreground max-md:[&_td[data-label]]:before:content-[attr(data-label)]",
].join(" ");

/** `label`: nhãn hiện trước ô khi bảng `stack` xếp thành thẻ trên điện thoại. */
export function Td({ children, className, label }: { children?: React.ReactNode; className?: string; label?: string }) {
  return (
    <td data-label={label} className={cn("px-3 py-2 align-top", className)}>
      {/* Bọc 1 lớp: ở chế độ thẻ ô là flex → nội dung nhiều dòng (tên + SĐT) vẫn xếp dọc. */}
      <div className="min-w-0 flex-1">{children}</div>
    </td>
  );
}

export const TONES = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  danger: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  brand: "bg-primary/10 text-primary",
} as const;

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof TONES; children: React.ReactNode }) {
  return <span className={cn("inline-flex rounded px-1.5 py-0.5 text-xs whitespace-nowrap", TONES[tone])}>{children}</span>;
}

export const fieldClass =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Ô chỉ số trên dashboard/báo cáo; có `href` thì bấm được. */
export function Stat({
  label,
  value,
  href,
  tone = "neutral",
  testId,
}: {
  label: string;
  value: React.ReactNode;
  href?: string;
  tone?: "neutral" | "warning" | "danger";
  testId?: string;
}) {
  const body = (
    <>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "text-xl font-medium tabular-nums",
          tone === "warning" && "text-amber-700 dark:text-amber-400",
          tone === "danger" && "text-destructive",
        )}
      >
        {value}
      </div>
    </>
  );
  const cls = "block rounded-lg border p-3";
  return href ? (
    <Link href={href} className={cn(cls, "hover:bg-muted")} data-testid={testId}>
      {body}
    </Link>
  ) : (
    <div className={cls} data-testid={testId}>
      {body}
    </div>
  );
}
