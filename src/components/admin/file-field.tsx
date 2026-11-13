"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * Ô chọn file theo ngôn ngữ admin — thay nút gốc "Choose File / No file chosen" (theo ngôn ngữ trình duyệt).
 * `<input type="file">` thật vẫn nằm trong form (sr-only, đứng ĐẦU để `<label>` bọc ngoài trỏ vào nó; giữ `required`,
 * `aria-label`, `name`); nút chỉ mở hộp chọn. Tên file xoá khi form reset (React tự reset sau action).
 */
export function FileField({ className, onChange, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  const t = useTranslations("Common");
  const ref = useRef<HTMLInputElement>(null);
  const [names, setNames] = useState<string[]>([]);

  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const clear = () => setNames([]);
    form.addEventListener("reset", clear);
    return () => form.removeEventListener("reset", clear);
  }, []);

  return (
    <span className={cn("flex min-w-0 items-center gap-2 text-sm", className)}>
      <input
        {...props}
        ref={ref}
        type="file"
        tabIndex={-1}
        className="sr-only"
        onChange={(e) => {
          setNames(Array.from(e.currentTarget.files ?? [], (f) => f.name));
          onChange?.(e);
        }}
      />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="inline-flex h-9 flex-none items-center rounded-lg border border-border px-3 whitespace-nowrap outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {t("chooseFile")}
      </button>
      <span className="min-w-0 truncate text-muted-foreground" title={names.join(", ") || undefined}>
        {names.length === 0 ? t("noFile") : names.length === 1 ? names[0] : t("filesChosen", { n: names.length })}
      </span>
    </span>
  );
}
