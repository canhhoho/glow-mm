import { cn } from "@/lib/utils";

/** Lớp giao diện storefront (mobile-first, vùng bấm ≥ 44px, màu theo design token). */

export const storeField =
  "h-11 w-full rounded-lg border border-input bg-card px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export const primaryButton =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-lg bg-brand px-5 whitespace-nowrap font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50";

export const outlineButton =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-lg border border-border bg-card px-4 whitespace-nowrap hover:bg-muted disabled:opacity-50";

export function PageTitle({ children }: { children: React.ReactNode }) {
  return <h1 className="mb-3 text-lg font-medium">{children}</h1>;
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "success"; children: React.ReactNode }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-lg px-3 py-2 text-sm",
        tone === "error" && "bg-destructive/10 text-destructive",
        tone === "success" && "bg-secondary text-secondary-foreground",
        tone === "info" && "bg-accent text-accent-foreground",
      )}
    >
      {children}
    </p>
  );
}

/** Khung chờ cao ≥ 1 màn hình: footer nằm ngoài khung nhìn → không gây layout shift khi nội dung stream vào. */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="grid min-h-dvh grid-cols-2 content-start gap-3" aria-hidden>
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
