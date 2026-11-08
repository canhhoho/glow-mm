import { getTranslations } from "next-intl/server";
import { TabNav } from "@/components/admin/ui";

/** Tab giữa báo cáo bán hàng và báo cáo sức khoẻ dữ liệu (D0). */
export async function ReportsTabs({ active }: { active: "sales" | "health" | "analytics" }) {
  // Nhãn tab = tên mục menu Báo cáo (cùng chữ với menu, breadcrumb và tiêu đề trang).
  const t = await getTranslations("Nav");
  return (
    <TabNav
      label={t("reports")}
      tabs={[
        { href: "/admin/reports", label: t("salesReports"), active: active === "sales" },
        { href: "/admin/reports/data-health", label: t("dataHealth"), active: active === "health" },
        { href: "/admin/reports/analytics", label: t("analyticsReports"), active: active === "analytics" },
      ]}
    />
  );
}
