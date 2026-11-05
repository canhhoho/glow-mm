import { getTranslations } from "next-intl/server";
import { TabNav } from "@/components/admin/ui";

/** Tab giữa báo cáo bán hàng và báo cáo sức khoẻ dữ liệu (D0). */
export async function ReportsTabs({ active }: { active: "sales" | "health" | "analytics" }) {
  const t = await getTranslations("DataHealth");
  return (
    <TabNav
      label={t("title")}
      tabs={[
        { href: "/admin/reports", label: t("tabSales"), active: active === "sales" },
        { href: "/admin/reports/data-health", label: t("tabHealth"), active: active === "health" },
        { href: "/admin/reports/analytics", label: t("tabAnalytics"), active: active === "analytics" },
      ]}
    />
  );
}
