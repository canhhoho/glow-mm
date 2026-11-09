import { ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { FIELD } from "@/components/ui/field";
import { buttonVariants } from "@/components/ui/button-variants";

/** Lớp giao diện storefront (mobile-first, vùng bấm ≥ 44px, màu theo design token). */

export const storeField = FIELD.touch;

/**
 * Nút storefront = `buttonVariants` dùng chung, cỡ `touch` (h-11), dạng chuỗi class (không thêm JS client).
 * Giữ nét riêng của store: nút chính rộng hơn (px-5), hover nhạt hơn; nút viền nền trắng (bg-card), chữ thường.
 */
export const primaryButton = cn(buttonVariants({ size: "touch" }), "px-5 hover:bg-primary/90");

export const outlineButton = cn(buttonVariants({ variant: "outline", size: "touch" }), "bg-card font-normal");

/** Khối nội dung dạng card (nền trắng, bo góc) — mobile sát lề, từ sm có viền + padding. */
export const storeCard = "rounded-xl bg-card p-3 ring-1 ring-border sm:p-4";

/** Danh sách dạng card (mỗi dòng tự đặt padding, ngăn bằng đường kẻ). */
export const storeListCard = "divide-y rounded-xl bg-card ring-1 ring-border";

export function PageTitle({ children }: { children: React.ReactNode }) {
  return <h1 className="mb-3 text-lg font-medium">{children}</h1>;
}

/** Hộp thông báo — bản dùng chung (`components/ui/notice`), tone `info | success | warning | danger`. */
export { Notice } from "@/components/ui/notice";

/** Dải nội dung có tiêu đề dạng nhãn màu thương hiệu + link "Xem thêm" (trang chủ, trang sản phẩm). */
export function StoreSection({
  id,
  title,
  more,
  children,
}: {
  id: string;
  title: string;
  more?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={storeCard}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id={id} className="rounded-lg bg-brand px-3 py-1.5 font-medium text-brand-foreground lg:text-lg">
          {title}
        </h2>
        {more && (
          <Link href={more.href} className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm text-accent-foreground">
            {more.label}
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/** Đường dẫn phân cấp (Trang chủ › … › trang hiện tại). */
export function Breadcrumb({ label, items }: { label: string; items: { href?: string; name: string }[] }) {
  return (
    <nav aria-label={label} className="mb-3 text-sm text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="size-3.5" aria-hidden />}
            {it.href ? (
              <Link href={it.href} className="hover:text-brand hover:underline">
                {it.name}
              </Link>
            ) : (
              <span aria-current="page" className="text-foreground">
                {it.name}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Khung chờ cao ≥ 1 màn hình: footer nằm ngoài khung nhìn → không gây layout shift khi nội dung stream vào. */
export function ListSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div className="grid min-h-dvh grid-cols-2 content-start gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="aspect-[3/4] animate-pulse rounded-lg bg-accent" />
      ))}
    </div>
  );
}

export function BlockSkeleton() {
  return (
    <div className="min-h-dvh space-y-3" aria-hidden>
      <div className="h-6 w-1/2 animate-pulse rounded bg-accent" />
      <div className="h-40 animate-pulse rounded-lg bg-accent" />
      <div className="h-11 animate-pulse rounded-lg bg-accent" />
    </div>
  );
}

/** Ảnh dự phòng khi sản phẩm chưa có ảnh: chữ cái đầu thương hiệu trên nền token (đặt trong khung `relative`). */
export function ImageFallback({ brand, className }: { brand: string; className?: string }) {
  const initial = Array.from(brand.trim())[0]?.toUpperCase() ?? "G";
  return (
    <span
      aria-hidden
      data-testid="image-fallback"
      className={cn("absolute inset-0 grid place-items-center bg-accent font-medium text-accent-foreground/70 select-none", className)}
    >
      {initial}
    </span>
  );
}
