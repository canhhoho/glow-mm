import Link from "next/link";
import { buttonVariants } from "@/components/ui/button-variants";
import type { Density } from "@/components/ui/field";
import { cn } from "@/lib/utils";

/**
 * Phân trang dạng link GET (không JS) dùng chung admin + storefront: [Trước] trạng thái [Sau].
 * Nút ẩn ở trang đầu/cuối. `hrefFor` trả URL đầy đủ hoặc chỉ query (`?page=2` — giữ đường dẫn hiện tại, cả tiền tố locale).
 * `density`: `compact` (admin, nút h-9) · `touch` (storefront, h-11). Chuỗi hiển thị do trang truyền vào (i18n theo khu).
 */
export function Pagination({
  label,
  page,
  pages,
  hrefFor,
  prevLabel,
  nextLabel,
  status,
  statusTestId,
  density = "compact",
  className,
}: {
  label: string;
  page: number;
  pages: number;
  hrefFor: (page: number) => string;
  prevLabel: string;
  nextLabel: string;
  status: React.ReactNode;
  statusTestId?: string;
  density?: Density;
  className?: string;
}) {
  // touch = nút viền của storefront (nền trắng, chữ thường) — khớp `outlineButton` trong store/ui.
  const button = cn(buttonVariants({ variant: "outline", size: density === "touch" ? "touch" : "lg" }), density === "touch" && "bg-card font-normal");
  return (
    <nav aria-label={label} className={cn("flex flex-wrap items-center justify-center gap-3", className)}>
      {page > 1 && (
        <Link href={hrefFor(page - 1)} className={button}>
          {prevLabel}
        </Link>
      )}
      <span className="text-sm tabular-nums" aria-live="polite" data-testid={statusTestId}>
        {status}
      </span>
      {page < pages && (
        <Link href={hrefFor(page + 1)} className={button}>
          {nextLabel}
        </Link>
      )}
    </nav>
  );
}
