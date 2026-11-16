import { getTranslations } from "next-intl/server";
import { TabNav } from "@/components/admin/ui";

/** Tab giữa các báo cáo (bán hàng, tồn kho, hành vi mua hàng, sức khoẻ dữ liệu). */
export async function ReportsTabs({ active }: { active: "sales" | "inventory" | "health" | "analytics" }) {
  // Nhãn tab = tên mục menu Báo cáo (cùng chữ với menu, breadcrumb và tiêu đề trang).
  const t = await getTranslations("Nav");
  return (
    <TabNav
      label={t("reports")}
      tabs={[
        { href: "/admin/reports", label: t("salesReports"), active: active === "sales" },
        { href: "/admin/reports/inventory", label: t("inventoryReports"), active: active === "inventory" },
        { href: "/admin/reports/analytics", label: t("analyticsReports"), active: active === "analytics" },
        { href: "/admin/reports/data-health", label: t("dataHealth"), active: active === "health" },
      ]}
    />
  );
}
