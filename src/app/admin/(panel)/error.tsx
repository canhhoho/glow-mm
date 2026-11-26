"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Page } from "@/components/admin/ui";
import { ErrorState } from "@/components/ui/error-state";

/** Lỗi bất ngờ trong một trang admin: giữ menu + hiện hộp lỗi và nút thử lại (không lộ nội dung lỗi của server). */
export default function AdminError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useTranslations("Common");
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <Page width="narrow">
      <ErrorState title={t("errorTitle")} hint={t("errorHint")} digest={error.digest} retryLabel={t("retry")} onRetry={() => retry()} />
    </Page>
  );
}
