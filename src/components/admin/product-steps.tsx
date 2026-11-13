import { Check, CircleAlert, Clock } from "lucide-react";
import type { ProductStep, StepView } from "@/server/catalog/readiness-rules";
import { cn } from "@/lib/utils";

type T = (key: string, values?: Record<string, string | number>) => string;

const STATE_CLASS: Record<StepView["state"], string> = {
  done: "border-success-muted bg-success-subtle text-success-foreground",
  warn: "border-warning-border bg-warning-subtle text-warning-foreground",
  todo: "border-primary bg-primary/10 text-primary",
  waiting: "border-border text-muted-foreground",
};

const DOT_CLASS: Record<StepView["state"], string> = {
  done: "border-success bg-success text-primary-foreground",
  warn: "border-warning bg-warning text-primary-foreground",
  todo: "border-primary bg-background text-primary",
  waiting: "border-border bg-background text-muted-foreground",
};

/**
 * "Tiến độ đăng bán" (P3): 5 mốc nối nhau — tròn xanh có dấu ✓ khi xong, viền màu chính ở mốc đang cần làm,
 * dòng mô tả ngắn dưới mỗi mốc (`notes`). Chỉ để xem tiến độ, không bắt làm theo thứ tự; bấm mốc → cuộn tới khối.
 */
export function ProductStepsBar({ steps, current, t, notes = {} }: { steps: StepView[]; current: ProductStep | null; t: T; notes?: Partial<Record<ProductStep, string>> }) {
  return (
    <nav aria-label={t("stepsLabel")} data-testid="product-steps">
      <ol className="grid grid-cols-5">
        {steps.map((s, i) => (
          <li key={s.key} data-testid={`step-${s.key}`} data-state={s.state} className="relative flex flex-col items-center text-center">
            {i > 0 && (
              <span aria-hidden className={cn("absolute top-4 right-1/2 h-0.5 w-full -translate-y-1/2", steps[i - 1].state === "done" ? "bg-success" : "bg-border")} />
            )}
            <a href={`#step-${s.key}`} aria-current={s.key === current ? "step" : undefined} className="group relative z-10 flex flex-col items-center gap-1 px-1">
              <span className={cn("flex size-8 items-center justify-center rounded-full border-2 text-sm font-semibold", DOT_CLASS[s.state], s.key === current && "ring-4 ring-primary/15")}>
                {s.state === "done" ? <Check className="size-4" aria-hidden /> : s.state === "warn" ? <CircleAlert className="size-4" aria-hidden /> : i + 1}
              </span>
              <span className={cn("text-xs font-medium sm:text-sm", s.key === current ? "text-primary" : "text-foreground", "group-hover:underline")}>{t(`step.${s.key}`)}</span>
              <span className="hidden text-xs text-muted-foreground sm:block">
                {notes[s.key] ?? (
                  <span className="inline-flex items-center gap-1">
                    {s.state === "waiting" && <Clock className="size-3" aria-hidden />}
                    {t(`stepState.${s.state}`)}
                  </span>
                )}
              </span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Tiêu đề khối của một bước (số + tên + trạng thái), dùng làm `title` của `Section`. */
export function StepTitle({ index, step, t }: { index: number; step: StepView; t: T }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span>
        {index}. {t(`step.${step.key}`)}
      </span>
      <span className={cn("rounded border px-1.5 py-0.5 text-xs font-normal", STATE_CLASS[step.state])}>{t(`stepState.${step.state}`)}</span>
    </span>
  );
}
