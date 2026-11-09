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

/**
 * Thanh 5 bước ở đầu trang SP: mỗi bước một ô (số, tên, trạng thái), bấm cuộn tới khối của bước đó (`#step-<key>`).
 * `current` (bước đầu tiên còn cần làm) được viền đậm + `aria-current`.
 */
export function ProductStepsBar({ steps, current, t }: { steps: StepView[]; current: ProductStep | null; t: T }) {
  return (
    <nav aria-label={t("stepsLabel")} data-testid="product-steps">
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {steps.map((s, i) => (
          <li key={s.key} data-testid={`step-${s.key}`} data-state={s.state}>
            <a
              href={`#step-${s.key}`}
              aria-current={s.key === current ? "step" : undefined}
              className={cn("flex h-full flex-col gap-1 rounded-lg border p-2.5 text-sm hover:bg-muted/50", STATE_CLASS[s.state], s.key === current && "ring-2 ring-primary/40")}
            >
              <span className="flex items-center gap-1.5 font-medium">
                <span className="tabular-nums">{i + 1}.</span>
                {t(`step.${s.key}`)}
              </span>
              <span className="flex items-center gap-1 text-xs">
                {s.state === "done" && <Check className="size-3.5" aria-hidden />}
                {s.state === "warn" && <CircleAlert className="size-3.5" aria-hidden />}
                {s.state === "waiting" && <Clock className="size-3.5" aria-hidden />}
                {t(`stepState.${s.state}`)}
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
