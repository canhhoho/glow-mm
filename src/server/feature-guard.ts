import "server-only";
import { notFound, redirect } from "next/navigation";
import { featureOn, type FeatureKey } from "@/lib/features";

/** Trang của tính năng đang tắt: 404, hoặc chuyển sang trang thay thế (link cũ / bookmark vẫn dùng được). */
export function requireFeature(key: FeatureKey, opts: { redirectTo?: string } = {}): void {
  if (featureOn(key)) return;
  if (opts.redirectTo) redirect(opts.redirectTo);
  notFound();
}

export const FEATURE_OFF_MESSAGE = "Tính năng đang tạm tắt";

/** Server action / route của tính năng đang tắt: chặn ở phía server (ẩn giao diện chưa đủ — payload là JSON từ client). */
export function assertFeature(key: FeatureKey): void {
  if (!featureOn(key)) throw new Error(FEATURE_OFF_MESSAGE);
}
