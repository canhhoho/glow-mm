"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";
import { analyticsPath, analyticsPageType } from "@/lib/analytics-events";
import { sendStoreEvent } from "@/lib/analytics-client";

const vitalIds = new Map<string, string>();
const reportVital: Parameters<typeof useReportWebVitals>[0] = (metric) => {
  if (metric.name !== "LCP" && metric.name !== "INP" && metric.name !== "CLS") return;
  try {
    const id = vitalIds.get(metric.id) ?? crypto.randomUUID();
    vitalIds.set(metric.id, id);
    const path = new URL(metric.navigationURL ?? location.href, location.origin).pathname;
    sendStoreEvent("web_vital", { metric: metric.name, value: metric.value, pageType: analyticsPageType(path) }, id, path);
  } catch { /* Không cản thao tác khi Web Vitals không được hỗ trợ. */ }
};

export function StoreAnalytics() {
  const pathname = usePathname();
  const search = useSearchParams();
  const lastPage = useRef("");
  useReportWebVitals(reportVital);
  useEffect(() => {
    document.documentElement.dataset.analytics = "on";
    const click = (event: MouseEvent) => {
      const a = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!a) return;
      const url = new URL(a.getAttribute("href")!, location.href);
      if (url.origin !== location.origin) return;
      if (analyticsPath(url.pathname) === "/p/:product") sendStoreEvent("select_item");
      if (analyticsPath(url.pathname) === "/checkout") sendStoreEvent("begin_checkout");
    };
    const submit = (event: SubmitEvent) => {
      if (event.target instanceof HTMLFormElement && event.target.hasAttribute("data-analytics-add-cart")) {
        sendStoreEvent("add_to_cart");
        const button = event.submitter;
        if (button instanceof HTMLButtonElement && button.value === "buy") sendStoreEvent("begin_checkout");
      }
    };
    document.addEventListener("click", click);
    document.addEventListener("submit", submit);
    return () => {
      delete document.documentElement.dataset.analytics;
      document.removeEventListener("click", click);
      document.removeEventListener("submit", submit);
    };
  }, []);
  useEffect(() => {
    const key = `${pathname}?${search.toString()}`;
    if (lastPage.current === key) return;
    lastPage.current = key;
    const path = analyticsPath(pathname);
    if (path === "/p/:product") sendStoreEvent("view_item");
    else if (["/", "/c/:category", "/collection/:collection", "/search"].includes(path)) sendStoreEvent("view_item_list");
    else if (path === "/cart") sendStoreEvent("view_cart");
    else if (path === "/checkout") sendStoreEvent("begin_checkout");
    try {
      if (path === "/login") {
        sessionStorage.setItem("tc-analytics-login", String(Date.now()));
        if ((search.get("next") ?? "").includes("checkout")) sendStoreEvent("login_required");
      }
      if (path === "/checkout" || path === "/account") {
        const at = Number(sessionStorage.getItem("tc-analytics-login"));
        if (at > 0 && Date.now() - at < 3600000) sendStoreEvent("login_success");
        sessionStorage.removeItem("tc-analytics-login");
      }
    } catch { /* Storage có thể bị trình duyệt chặn. */ }
  }, [pathname, search]);
  return null;
}
