import { getTranslations } from "next-intl/server";
import { BlockSkeleton, Page } from "@/components/admin/ui";

/** Khung chờ chung khi chuyển trang admin: tiêu đề + vài khối xám, không chặn thao tác với menu. */
export default async function AdminLoading() {
  const t = await getTranslations("Common");
  return (
    <Page>
      <div role="status" aria-label={t("loading")} className="space-y-5">
        <div aria-hidden className="h-7 w-48 animate-pulse rounded-lg bg-muted" />
        <div aria-hidden className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-[4.5rem] animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
        <BlockSkeleton className="h-64" />
      </div>
    </Page>
  );
}
