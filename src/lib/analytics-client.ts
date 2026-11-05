"use client";

import { analyticsPath, type ClientEventName } from "./analytics-events";

let memorySession: string | undefined;
export function analyticsContext() {
  if (document.documentElement.dataset.analytics !== "on") return;
  let sessionId = memorySession;
  try {
    sessionId = sessionStorage.getItem("tc-analytics-session") ?? sessionId;
    if (!sessionId || !/^[0-9a-f-]{36}$/i.test(sessionId)) sessionId = crypto.randomUUID();
    sessionStorage.setItem("tc-analytics-session", sessionId);
  } catch { sessionId ??= crypto.randomUUID(); }
  memorySession = sessionId;
  return { sessionId, device: window.matchMedia("(max-width: 767px)").matches ? "mobile" as const : "desktop" as const };
}

/** Telemetry là best-effort; lỗi lưu/truyền không cản thao tác bán hàng. */
export function sendStoreEvent(name: ClientEventName, props?: { metric: "LCP" | "INP" | "CLS"; value: number; pageType: string }, eventId?: string, path = location.pathname) {
  try {
    const context = analyticsContext();
    if (!context) return;
    const locale = /^(my|en|vi)$/.test(document.documentElement.lang) ? document.documentElement.lang : "my";
    const body = JSON.stringify({ ...context, eventId: eventId ?? crypto.randomUUID(), name, path: analyticsPath(path), locale, ...(props && { props }) });
    const blob = new Blob([body], { type: "application/json" });
    if (!navigator.sendBeacon?.("/api/events", blob)) void fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  } catch { /* Không làm hỏng giỏ hàng khi trình duyệt chặn storage hoặc beacon. */ }
}
