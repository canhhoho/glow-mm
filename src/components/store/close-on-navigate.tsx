"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Đóng <details> chứa nó khi chuyển trang: header nằm trong layout nên không render lại khi điều hướng phía client.
 * Đọc URL → phải nằm trong <Suspense> để header vẫn thuộc static shell.
 */
export function CloseOnNavigate() {
  const ref = useRef<HTMLSpanElement>(null);
  const pathname = usePathname();
  useEffect(() => {
    const details = ref.current?.closest("details");
    if (details) details.open = false;
  }, [pathname]);
  return <span ref={ref} hidden />;
}
