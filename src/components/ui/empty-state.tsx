import { cn } from "@/lib/utils";

/**
 * Trạng thái rỗng ngoài bảng (danh sách thẻ, khối không có dữ liệu) — dùng chung ba portal.
 * `action`: bước tiếp theo (link tạo mới, xoá lọc…) khi người dùng có quyền. Bảng dùng `DataTable empty`.
 */
export function EmptyState({ children, action, className }: { children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border bg-card px-3 py-6 text-center text-sm text-muted-foreground", className)}>
      <p>{children}</p>
      {action && <div className="mt-3 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

/** Trang 404 trong khung một portal (giữ menu/ngôn ngữ của khu): mã 404, tiêu đề, gợi ý, nút đi tiếp. */
export function NotFoundState({ title, hint, action }: { title: React.ReactNode; hint?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="py-16 text-center">
      <p className="text-4xl font-semibold text-muted-foreground tabular-nums">404</p>
      <h1 className="mt-2 text-lg font-medium">{title}</h1>
      {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      {action && <div className="mt-6 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
