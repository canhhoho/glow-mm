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
 * "Điều kiện đăng bán": danh sách đạt / còn thiếu, mỗi dòng dẫn tới nơi xử lý (tab hoặc khối bên dưới).
 * Dùng chung dữ liệu `productSteps` (readiness) — không viết thêm bộ kiểm tra riêng. Không phải các bước bắt buộc nối tiếp:
 * nhập hàng và đặt giá làm song song; `current` chỉ đánh dấu việc đầu tiên còn thiếu.
 */
export function ProductConditions({
  steps,
  current,
  t,
  notes = {},
  hrefs,
}: {
  steps: StepView[];
  current: ProductStep | null;
  t: T;
  notes?: Partial<Record<ProductStep, string>>;
  hrefs: Record<ProductStep, string>;
}) {
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4" aria-labelledby="product-conditions-title" data-testid="product-steps">
      <h2 id="product-conditions-title" className="font-medium">
        {t("hero.checklist")}
      </h2>
      <ul className="divide-y text-sm">
        {steps.map((s) => (
          <li key={s.key} data-testid={`step-${s.key}`} data-state={s.state} className="flex items-center gap-3 py-2.5">
            <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border-2", DOT_CLASS[s.state])} aria-hidden>
              {s.state === "done" ? <Check className="size-3.5" /> : s.state === "warn" ? <CircleAlert className="size-3.5" /> : s.state === "waiting" ? <Clock className="size-3" /> : <span className="size-1.5 rounded-full bg-current" />}
            </span>
            <a href={hrefs[s.key]} aria-current={s.key === current ? "step" : undefined} className={cn("min-w-0 flex-1 hover:underline", s.key === current && "text-primary")}>
              <span className="block font-medium">{t(`step.${s.key}`)}</span>
              <span className="block text-xs text-muted-foreground">{notes[s.key] ?? t(`stepState.${s.state}`)}</span>
            </a>
            <span className={cn("rounded border px-1.5 py-0.5 text-xs", STATE_CLASS[s.state])}>{t(`stepState.${s.state}`)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Tiêu đề khối (tên + trạng thái), dùng làm `title` của `Section`. */
export function StepTitle({ step, t }: { step: StepView; t: T }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span>{t(`step.${step.key}`)}</span>
      <span className={cn("rounded border px-1.5 py-0.5 text-xs font-normal", STATE_CLASS[step.state])}>{t(`stepState.${step.state}`)}</span>
    </span>
  );
}
