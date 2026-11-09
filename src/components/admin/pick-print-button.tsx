"use client";

import { useState, useTransition } from "react";
import { Printer } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { savePickManifestsAction } from "@/server/orders/actions";

/**
 * D3-lite: "Chốt lô & In" — lưu phiếu soạn (manifest lô) cho các đơn đang xem rồi mở hộp thoại in.
 * Tồn kho đổi sau khi mở trang → server từ chối (hash khác) → tải lại phiếu. Không có đơn soạn được → chỉ in.
 */
export function PickPrintButton({ ids, hash, plannable }: { ids: string[]; hash: string; plannable: boolean }) {
  const t = useTranslations("Orders");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <Button
        size="lg"
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          if (!plannable) return window.print();
          start(async () => {
            const res = await savePickManifestsAction(ids, hash);
            if (res.error) return setError(res.error);
            setSaved(res.saved ?? 0);
            window.print();
            router.refresh();
          });
        }}
      >
        <Printer aria-hidden />
        {plannable ? t("bulk.pickSaveAndPrint") : t("print")}
      </Button>
      {saved != null && (
        <span role="status" className="text-sm text-success">
          {t("bulk.pickSaved", { count: saved })}
        </span>
      )}
      {error && (
        <span role="alert" className="text-sm text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}
