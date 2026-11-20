import { getTranslations } from "next-intl/server";
import { TabNav } from "@/components/admin/ui";
import { navCounts } from "@/server/admin/nav-counts";

/**
 * Tab của các mục menu gộp nhiều trang (menu 6 nhóm): nhãn tab = tên mục cũ trong `Nav.*`, không thêm cấp menu.
 * Mỗi hàm chỉ là điều hướng — không chứa nghiệp vụ; quyền vẫn kiểm ở từng trang.
 */
const positive = (n: number | undefined) => (n && n > 0 ? n : undefined);

/**
 * CTV & hoa hồng: Danh sách · Đăng ký. 20/11/2026 (audit): bỏ tab "Hoa hồng & chi trả" (trùng dữ liệu/cột với Danh sách) —
 * Danh sách có lọc "Có hoa hồng phải trả"; link cũ /admin/affiliates/commissions chuyển về lọc đó.
 */
export async function AffiliateTabs({ active }: { active: "list" | "applications" }) {
  const [tn, counts] = await Promise.all([getTranslations("Nav"), navCounts(new Set(["pendingApplications"]))]);
  return (
    <TabNav
      label={tn("affiliatesCommission")}
      tabs={[
        { href: "/admin/affiliates", label: tn("affiliateList"), active: active === "list" },
        { href: "/admin/affiliates/applications", label: tn("affiliateApplications"), active: active === "applications", count: positive(counts.pendingApplications), tone: "brand" },
      ]}
    />
  );
}

/** Tài khoản (Cài đặt): Nhân viên · Khách hàng (badge = yêu cầu đặt lại mật khẩu chờ xác nhận). */
export async function AccountTabs({ active }: { active: "staff" | "customers" }) {
  const [tn, counts] = await Promise.all([getTranslations("Nav"), navCounts(new Set(["passwordResets"]))]);
  return (
    <TabNav
      label={tn("accounts")}
      tabs={[
        { href: "/admin/users", label: tn("users"), active: active === "staff" },
        { href: "/admin/customer-accounts", label: tn("customers"), active: active === "customers", count: positive(counts.passwordResets), tone: "brand" },
      ]}
    />
  );
}

/** Nội dung website (Cài đặt): Banner · Bộ sưu tập. */
export async function ContentTabs({ active }: { active: "banners" | "collections" }) {
  const tn = await getTranslations("Nav");
  return (
    <TabNav
      label={tn("websiteContent")}
      tabs={[
        { href: "/admin/content/banners", label: tn("banners"), active: active === "banners" },
        { href: "/admin/content/collections", label: tn("collections"), active: active === "collections" },
      ]}
    />
  );
}
