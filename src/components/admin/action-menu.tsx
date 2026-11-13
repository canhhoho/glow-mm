"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Menu ⋯ dùng chung (bọc `<details>`, chạy được cả khi chưa tải JS): đóng khi nhấn Esc hoặc bấm ra ngoài; chuyển trang thì menu
 * tự mất theo trang. Không tự đóng lúc bấm liên kết hay lúc hydrate (menu mở trước khi JS tải xong vẫn giữ nguyên).
 * `trigger`/`triggerClassName` = nút mở (thường `buttonVariants(...)`), `children` = các mục (`MENU_ITEM`).
 */
export function ActionMenu({
  trigger,
  triggerClassName,
  label,
  className,
  children,
}: {
  trigger: React.ReactNode;
  triggerClassName?: string;
  /** Nhãn truy cập cho nút mở (nút chỉ có icon). */
  label?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && el.open) {
        el.open = false;
        el.querySelector("summary")?.focus();
      }
    };
    const onDown = (e: Event) => {
      if (el.open && !el.contains(e.target as Node)) el.open = false;
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, []);
  return (
    <details ref={ref} className={cn("group relative", className)}>
      <summary aria-label={label} title={label} className={cn("cursor-pointer list-none [&::-webkit-details-marker]:hidden", triggerClassName)}>
        {trigger}
      </summary>
      <div className="absolute right-0 z-20 mt-1 grid min-w-48 rounded-lg border bg-popover p-1 shadow-md">
        {children}
      </div>
    </details>
  );
}
