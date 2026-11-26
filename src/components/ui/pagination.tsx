import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";
import type { Density } from "@/components/ui/field";
import { cn } from "@/lib/utils";

/**
 * Phân trang dạng link GET (không JS) — một nguồn cho cả hai kiểu:
 * - `Pagination`: [Trước] trạng thái [Sau] (storefront, danh sách ngắn).
 * - `PageNumbers`: số trang « 1 2 … n » + "Hiển thị a–b trên n" + cỡ trang (danh sách admin lớn).
 *
 * `Pagination`: [Trước] trạng thái [Sau].
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

/** Ô số trang: `icon-lg` = 44px trên điện thoại, 36px từ md (vùng bấm đủ lớn). */
const pageBtn = (active = false) => cn(buttonVariants({ variant: active ? "default" : "outline", size: "icon-lg" }), "tabular-nums");

/**
 * Phân trang số trang: « 1 2 3 … n » + trạng thái "Hiển thị a–b trên n" + cỡ trang (link). Không cần JS.
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
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm" data-testid="pager">
      <span className="text-muted-foreground" data-testid="page-info">{status}</span>
      <div className="flex flex-wrap items-center gap-3">
        {pageSizes && pageSizes.length > 1 && (
          <span className="flex items-center gap-1 text-muted-foreground">
            {sizeLabel}
            {pageSizes.map((s) => (
              <Link
                key={s}
                href={href(1, s)}
                aria-current={s === pageSize ? "true" : undefined}
                className={cn("rounded-md px-1.5 py-0.5 tabular-nums outline-none focus-visible:ring-3 focus-visible:ring-ring/50", s === pageSize ? "bg-muted font-medium text-foreground" : "hover:text-foreground")}
              >
                {s}
              </Link>
            ))}
          </span>
        )}
        {pageCount > 1 && (
          <nav aria-label={status ? String(status) : undefined} className="flex items-center gap-1">
            {page > 1 ? (
              <Link href={href(page - 1)} className={pageBtn()} aria-label={prevLabel}>
                <ChevronLeft aria-hidden />
              </Link>
            ) : (
              <span className={cn(pageBtn(), "opacity-40")} aria-hidden>
                <ChevronLeft />
              </span>
            )}
            {pages.map((p, i) => (
              <span key={p} className="flex items-center gap-1">
                {i > 0 && p - pages[i - 1] > 1 && <span className="px-1 text-muted-foreground">…</span>}
                <Link href={href(p)} aria-current={p === page ? "page" : undefined} className={pageBtn(p === page)}>
                  {p}
                </Link>
              </span>
            ))}
            {page < pageCount ? (
              <Link href={href(page + 1)} className={pageBtn()} aria-label={nextLabel}>
                <ChevronRight aria-hidden />
              </Link>
            ) : (
              <span className={cn(pageBtn(), "opacity-40")} aria-hidden>
                <ChevronRight />
              </span>
            )}
          </nav>
        )}
      </div>
    </div>
  );
}
