import { cn } from "@/lib/utils";

/**
 * Huy hiệu trạng thái dùng chung ba portal. Màu theo token trạng thái (globals.css) → tự đổi theo theme store.
 * Map trạng thái nghiệp vụ → tone đặt ở `admin/status-tones.ts` / `admin/order-badges.tsx`, không map trong page.
 */
export const TONES = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-success-muted text-success-foreground",
  warning: "bg-warning-muted text-warning-foreground",
  danger: "bg-danger-muted text-danger-foreground",
  brand: "bg-primary/10 text-primary",
} as const;

export type Tone = keyof typeof TONES;

export function Badge({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: React.ReactNode }) {
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", TONES[tone], className)}>{children}</span>;
}
