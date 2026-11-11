import Link from "next/link";
import { useTranslations } from "next-intl";
import type { BatchReviewView } from "@/server/catalog/batch-review-text";

/**
 * §6.4 — hai ô ở form xác nhận lượt nhập Excel / áp bảng tính giá: "Gửi duyệt ngay" (bật sẵn) và
 * "Duyệt luôn" (chỉ người có quyền duyệt, tắt sẵn, không tự đăng SP mới). Server kiểm lại quyền.
 */
export function BatchReviewOptions({ canApprove }: { canApprove: boolean }) {
  const t = useTranslations("BatchReview");
  return (
    <fieldset className="space-y-1.5 text-sm">
      <legend className="sr-only">{t("legend")}</legend>
      <label className="flex items-start gap-2">
        <input type="checkbox" name="submitNow" defaultChecked className="mt-0.5 size-4 accent-primary" />
        <span>
          {t("submitNow")}
          <span className="block text-xs text-muted-foreground">{t("submitNowHint")}</span>
        </span>
      </label>
      {canApprove && (
        <label className="flex items-start gap-2">
          <input type="checkbox" name="approveNow" className="mt-0.5 size-4 accent-primary" />
          <span>
            {t("approveNow")}
            <span className="block text-xs text-muted-foreground">{t("approveNowHint")}</span>
          </span>
        </label>
      )}
    </fieldset>
  );
}

/** Kết quả gửi / duyệt theo từng SP (SP chưa đủ điều kiện / duyệt lỗi có link sang trang SP). */
export function BatchReviewSummary({ review }: { review: BatchReviewView }) {
  const t = useTranslations("BatchReview");
  const list = (items: BatchReviewView["notReady"]) => (
    <ul className="list-disc space-y-0.5 pl-5">
      {items.map((i) => (
        <li key={i.id}>
          <Link href={`/admin/products/${i.id}`} className="text-primary underline">{i.name}</Link>
          {i.reason && <span className="text-muted-foreground"> — {i.reason}</span>}
        </li>
      ))}
    </ul>
  );
  return (
    <div className="space-y-1.5" data-testid="batch-review">
      <p>{t("submitted", { n: review.submitted + review.already })}{review.approved > 0 && ` · ${t("approved", { n: review.approved })}`}</p>
      {review.notReady.length > 0 && (
        <div>
          <p className="font-medium">{t("notReady", { n: review.notReady.length })}</p>
          {list(review.notReady)}
        </div>
      )}
      {review.approveFailed.length > 0 && (
        <div>
          <p className="font-medium text-destructive">{t("approveFailed", { n: review.approveFailed.length })}</p>
          {list(review.approveFailed)}
        </div>
      )}
    </div>
  );
}
