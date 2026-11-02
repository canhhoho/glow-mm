"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Đóng <details> chứa nó khi chuyển trang: header nằm trong layout nên không render lại khi điều hướng phía client.
 * `dismissible`: đóng thêm khi bấm ra ngoài hoặc nhấn Escape (menu nhỏ dạng popover, vd menu ngôn ngữ).
 * Đọc URL → phải nằm trong <Suspense> để header vẫn thuộc static shell.
 */
export function CloseOnNavigate({ dismissible = false }: { dismissible?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const pathname = usePathname();
  useEffect(() => {
    const details = ref.current?.closest("details");
    if (details) details.open = false;
  }, [pathname]);
  useEffect(() => {
    const details = ref.current?.closest("details");
    if (!dismissible || !details) return;
    const onPointer = (e: PointerEvent) => {
      if (details.open && !details.contains(e.target as Node)) details.open = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !details.open) return;
      details.open = false;
      details.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [dismissible]);
  return <span ref={ref} hidden />;
}
