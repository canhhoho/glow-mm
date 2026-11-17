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
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    const panel = panelRef.current;
    if (!el || !panel) return;
    // Panel dùng `fixed` theo vị trí nút để không bị khung cuộn của bảng (overflow) cắt/che; thiếu chỗ bên dưới thì lật lên.
    const place = () => {
      if (!el.open) return;
      const btn = el.querySelector("summary")!.getBoundingClientRect();
      Object.assign(panel.style, { position: "fixed", right: "auto", marginTop: "0" });
      const h = panel.offsetHeight;
      const w = panel.offsetWidth;
      const below = window.innerHeight - btn.bottom;
      const top = below < h + 8 && btn.top > below ? Math.max(8, btn.top - h - 4) : btn.bottom + 4;
      const left = Math.max(8, Math.min(btn.right - w, window.innerWidth - w - 8));
      panel.style.top = `${top}px`;
      panel.style.left = `${left}px`;
    };
    place(); // menu mở trước khi JS tải xong
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && el.open) {
        el.open = false;
        el.querySelector("summary")?.focus();
      }
    };
    const onDown = (e: Event) => {
      if (el.open && !el.contains(e.target as Node)) el.open = false;
    };
    el.addEventListener("toggle", place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      el.removeEventListener("toggle", place);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, []);
  return (
    <details ref={ref} className={cn("group relative", className)}>
      <summary aria-label={label} title={label} className={cn("cursor-pointer list-none [&::-webkit-details-marker]:hidden", triggerClassName)}>
        {trigger}
      </summary>
      <div ref={panelRef} className="absolute right-0 z-50 mt-1 grid min-w-48 rounded-lg border bg-popover p-1 shadow-md">
        {children}
      </div>
    </details>
  );
}
