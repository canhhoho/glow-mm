import { cn } from "@/lib/utils";

/**
 * Khung chờ (Suspense fallback) dùng chung. Màu `bg-muted` (store theme = hồng nhạt, admin = xám).
 * Skeleton phải cùng kích thước nội dung thật để không nhảy layout.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-lg bg-muted", className)} />;
}

/** Một khối đang tải có tiêu đề (admin/CTV: dashboard, khối stream). */
export function BlockSkeleton({ label, className }: { label?: string; className?: string }) {
  return (
    <section aria-label={label} aria-busy="true" className="space-y-2">
      {label && <h2 className="font-medium">{label}</h2>}
      <Skeleton className={cn("h-28 rounded-xl", className)} />
    </section>
  );
}

/** Cả trang đang tải (storefront): cao ≥ 1 màn hình → footer ngoài khung nhìn, không layout shift khi nội dung stream vào. */
export function PageSkeleton() {
  return (
    <div className="min-h-dvh space-y-3" aria-hidden>
      <Skeleton className="h-6 w-1/2 rounded" />
      <Skeleton className="h-40" />
      <Skeleton className="h-11" />
    </div>
  );
}

/** Lưới thẻ sản phẩm đang tải (storefront), cao ≥ 1 màn hình. */
export function GridSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div className="grid min-h-dvh grid-cols-2 content-start gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="aspect-[3/4]" />
      ))}
    </div>
  );
}
