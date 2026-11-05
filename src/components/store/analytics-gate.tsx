import { Suspense } from "react";
import { connection } from "next/server";
import { analyticsConfig } from "@/lib/env";
import { StoreAnalytics } from "./analytics";

export async function StoreAnalyticsGate() {
  await connection();
  return analyticsConfig().ANALYTICS_ENABLED ? <Suspense fallback={null}><StoreAnalytics /></Suspense> : null;
}
