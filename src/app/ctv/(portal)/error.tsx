"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Page } from "@/components/admin/ui";
import { ErrorState } from "@/components/ui/error-state";

/** Lỗi bất ngờ trong cổng CTV: giữ header + thanh mục, hiện hộp lỗi và nút thử lại (chuỗi `Common` dùng chung với admin). */
export default function CtvError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useTranslations("Common");
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <Page width="narrow">
      <ErrorState title={t("errorTitle")} hint={t("errorHint")} digest={error.digest} retryLabel={t("retry")} onRetry={() => retry()} density="touch" />
    </Page>
  );
}
