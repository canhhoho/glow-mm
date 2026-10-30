import Link from "next/link";
import { cn } from "@/lib/utils";

/** Khối giao diện nhỏ dùng chung cho các trang admin (server components). */

export function PageHeader({ title, actions }: { title: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h1 className="text-xl font-medium">{title}</h1>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function LinkButton({
  href,
  children,
  variant = "outline",
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "outline";
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-8 items-center rounded-lg border px-3 text-sm whitespace-nowrap",
        variant === "primary"
          ? "border-transparent bg-primary text-primary-foreground hover:bg-primary/80"
          : "border-border hover:bg-muted",
      )}
    >
      {children}
    </Link>
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
