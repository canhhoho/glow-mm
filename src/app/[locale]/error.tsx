"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ErrorState } from "@/components/ui/error-state";
import { outlineButton } from "@/components/store/ui";

/** Lỗi bất ngờ ở trang khách: giữ header/footer, hộp lỗi + Thử lại + Về trang chủ (không lộ nội dung lỗi server). */
export default function StoreError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useTranslations("Error");
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-screen-md py-8">
      <ErrorState title={t("title")} hint={t("hint")} digest={error.digest} retryLabel={t("retry")} onRetry={() => retry()} density="touch">
        <Link href="/" className={outlineButton}>
          {t("home")}
        </Link>
      </ErrorState>
    </div>
  );
}
