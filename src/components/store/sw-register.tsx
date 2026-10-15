"use client";

import { useEffect } from "react";

/** Đăng ký service worker (chỉ bản production; dev bỏ qua để không cache nhầm khi đang sửa code). */
export function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
  }, []);
  return null;
}
