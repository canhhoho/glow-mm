import { cn } from "@/lib/utils";
import type { Density } from "./field";

/**
 * Nhãn trường: chữ nằm TRÊN ô (grid). Không dùng `space-y-1` — span + ô inline sẽ đứng cạnh nhau khi ô không `w-full`.
 * - `compact` (admin/CTV): chữ nhãn (span đầu) màu phụ — mọi form một kiểu, kể cả nơi quên đặt màu.
 * - `compactSm`: form dày đặc (dòng nhập lô, bảng nhiều cột).
 * - `touch` (storefront): chữ nhãn màu chữ thường.
 */
export const FIELD_LABEL = {
  compact: "grid content-start gap-1 text-sm [&>span:first-child]:text-muted-foreground",
  compactSm: "grid content-start gap-1 text-xs [&>span:first-child]:text-muted-foreground",
  touch: "grid content-start gap-1 text-sm",
} as const;

/** Ô form có nhãn phía trên. `hint` = dòng gợi ý nhỏ dưới ô; `error` = lỗi của trường (đặt `aria-invalid` trên ô). */
export function Field({
  label,
  hint,
  error,
  density = "compact",
  className,
  children,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  density?: Density;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn(FIELD_LABEL[density], className)}>
      <span className={density === "compact" ? "text-muted-foreground" : undefined}>{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      {error && <span className="text-sm text-destructive">{error}</span>}
    </label>
  );
}
