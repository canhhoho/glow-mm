import { RotateCcw } from "lucide-react";
import { buttonVariants } from "./button-variants";
import { Notice } from "./notice";
import type { Density } from "./field";

/**
 * Nội dung `error.tsx` dùng chung ba portal: hộp lỗi + nút Thử lại (không lộ nội dung lỗi server, chỉ mã `digest`).
 * Nút là `<button>` + chuỗi class (storefront không kéo `@base-ui`). `children` = nút đi tiếp (vd về trang chủ).
 */
export function ErrorState({
  title,
  hint,
  digest,
  retryLabel,
  onRetry,
  density = "compact",
  children,
}: {
  title: React.ReactNode;
  hint?: React.ReactNode;
  digest?: string;
  retryLabel: string;
  onRetry: () => void;
  density?: Density;
  children?: React.ReactNode;
}) {
  return (
    <Notice tone="danger" className="space-y-3 p-4">
      <div>
        <h1 className="font-medium">{title}</h1>
        {hint && <p>{hint}</p>}
        {digest && <p className="mt-1 font-mono text-xs opacity-70">{digest}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onRetry} className={buttonVariants({ variant: "outline", size: density === "touch" ? "touch" : "lg" })}>
          <RotateCcw aria-hidden /> {retryLabel}
        </button>
        {children}
      </div>
    </Notice>
  );
}
