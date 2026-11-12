"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice, Page } from "@/components/admin/ui";

/** Lỗi bất ngờ trong một trang admin: giữ menu + hiện hộp lỗi và nút thử lại (không lộ nội dung lỗi của server). */
export default function AdminError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useTranslations("Common");
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <Page width="narrow">
      <Notice tone="danger" className="space-y-3 p-4">
        <div>
          <h1 className="font-medium">{t("errorTitle")}</h1>
          <p>{t("errorHint")}</p>
          {error.digest && <p className="mt-1 font-mono text-xs opacity-70">{error.digest}</p>}
        </div>
        <Button type="button" size="lg" variant="outline" onClick={() => retry()}>
          <RotateCcw aria-hidden /> {t("retry")}
        </Button>
      </Notice>
    </Page>
  );
}
