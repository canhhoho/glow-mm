import { cn } from "@/lib/utils";

/**
 * Hộp thông báo ngắn dùng chung admin + storefront + CTV (không JS, dùng được trong cả server lẫn client component).
 * Màu theo token trạng thái trong globals.css → tự đổi theo theme store. `danger` = role alert, còn lại role status.
 */
export type NoticeTone = "info" | "success" | "warning" | "danger";

const TONE_CLASS: Record<NoticeTone, string> = {
  info: "bg-accent text-accent-foreground",
  success: "bg-success-subtle text-success-foreground",
  warning: "bg-warning-subtle text-warning-foreground",
  danger: "bg-destructive/10 text-destructive",
};

export function Notice({
  tone = "info",
  className,
  children,
  ...props
}: { tone?: NoticeTone } & React.ComponentProps<"div">) {
  return (
    <div
      role={tone === "danger" || tone === "warning" ? "alert" : "status"}
      {...props}
      className={cn("rounded-lg px-3 py-2 text-sm", TONE_CLASS[tone], className)}
    >
      {children}
    </div>
  );
}
