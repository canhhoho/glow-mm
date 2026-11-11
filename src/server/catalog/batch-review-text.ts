import "server-only";
import { getTranslations } from "next-intl/server";
import { approveSubmitted, type BatchSubmitResult } from "./review";

/** Kết quả "Gửi duyệt ngay" / "Duyệt luôn" của một lượt (Excel, bảng tính giá) để hiện trên giao diện. */
export type BatchReviewView = {
  submitted: number;
  already: number;
  notReady: { id: string; name: string; reason: string }[];
  approved: number;
  approveFailed: { id: string; name: string; reason: string }[];
};

/**
 * Lượt đã commit → (tuỳ chọn) duyệt luôn các SP vừa gửi, mỗi SP một transaction; dịch lý do theo ngôn ngữ admin.
 * Gọi từ Server Action sau khi kiểm quyền `catalog:approve`.
 */
export async function finishBatchReview(review: BatchSubmitResult, userId: string, approve: boolean): Promise<BatchReviewView> {
  const t = await getTranslations("Products");
  const reason = (r: { error?: string; issues?: { code: string; skus?: string[] }[] }) =>
    r.issues?.length
      ? r.issues.map((i) => t(`readiness.issue.${i.code}` as Parameters<typeof t>[0]) + (i.skus?.length ? ` (${i.skus.join(", ")})` : "")).join("; ")
      : (r.error ?? "");
  const approvedResults = approve ? await approveSubmitted([...review.submitted, ...review.already], userId) : [];
  return {
    submitted: review.submitted.length,
    already: review.already.length,
    notReady: review.skipped.map((s) => ({ id: s.id, name: s.name, reason: reason(s) })),
    approved: approvedResults.filter((r) => r.ok).length,
    approveFailed: approvedResults.filter((r) => !r.ok).map((r) => ({ id: r.id, name: r.name, reason: reason(r) })),
  };
}
