import { cn } from "@/lib/utils";

/**
 * Dòng thông báo ngắn ngay cạnh form/nút (kết quả action, lỗi tải file…) — chữ màu, không khung.
 * Hộp thông báo có nền dùng `Notice`. `error`/`warning` = role alert, còn lại role status (E2E bắt theo role).
 */
export type FormMessageTone = "error" | "success" | "warning" | "muted" | "plain";

const TONE: Record<FormMessageTone, string> = {
  error: "text-destructive",
  success: "text-success",
  warning: "text-warning",
  muted: "text-muted-foreground",
  plain: "",
};

export function FormMessage({
  tone = "error",
  as: Tag = "p",
  className,
  children,
  ...props
}: { tone?: FormMessageTone; as?: "p" | "span" | "div" } & React.HTMLAttributes<HTMLElement> & { "data-testid"?: string }) {
  return (
    <Tag role={tone === "error" || tone === "warning" ? "alert" : "status"} {...props} className={cn("text-sm", TONE[tone], className)}>
      {children}
    </Tag>
  );
}
