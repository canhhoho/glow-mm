import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Nút gửi form có trạng thái đang xử lý: `pending` → khoá nút, `aria-busy`, icon đổi thành vòng quay.
 * Không tự đọc trạng thái (form cha truyền `pending` từ `useActionState`/state) → dùng được ở mọi client component,
 * kể cả storefront (chỉ là `<button>` + chuỗi class, không kéo `@base-ui`). Lớp nút truyền qua `className`.
 */
export function SubmitButton({
  pending = false,
  icon,
  className,
  disabled,
  children,
  ...props
}: { pending?: boolean; icon?: React.ReactNode } & Omit<React.ComponentProps<"button">, "type">) {
  return (
    <button type="submit" {...props} disabled={pending || disabled} aria-busy={pending || undefined} className={className}>
      {pending ? <Loader2 aria-hidden className={cn("size-4 shrink-0 animate-spin")} /> : icon}
      {children}
    </button>
  );
}
