import { getTranslations } from "next-intl/server";
import { ManualPricingSheet } from "@/components/admin/manual-pricing-sheet";
import { Page, PageHeader } from "@/components/admin/ui";
import { can } from "@/server/auth/roles";
import { requirePagePermission } from "@/server/auth/session";
import { manualPricingView } from "@/server/pricing/manual";
import { rateRecalcVariantIds } from "@/server/pricing/rate-recalc";
import { Notice } from "@/components/ui/notice";

const list = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []).filter((x) => /^[a-z0-9]{1,40}$/i.test(x)).slice(0, 200);

/**
 * Trang Giá bán — chế độ THỦ CÔNG (16/11): đặt giá cho các SKU đã chọn (`ids`) hoặc mọi SKU của một SP (`productId`).
 * Kho hàng nhập VN: bảng công thức (lô cơ sở, lãi VND, tỷ giá, vận chuyển, CTV). Kho mua MMK: nghiệp vụ cũ
 * (giá nhập thẳng + hoa hồng + lãi cố định, đổi giá cần lý do). SP đã duyệt → chờ duyệt, giá + hoa hồng áp cùng lúc.
 */
export default async function ManualPricesPage({ searchParams }: PageProps<"/admin/selling-prices/manual">) {
  const user = await requirePagePermission("pricing:manage");
  const sp = await searchParams;
  // `scope=rate` (18/11/2026): nút "Tính lại theo tỷ giá mới" — mọi SKU kho nhập VN có tỷ giá mới hơn lần đổi giá gần
  // nhất (cùng quy tắc cảnh báo RATE_NEWER), mở sẵn sửa mọi dòng với tỷ giá mới nhất + lãi/vận chuyển/CTV lần trước.
  const rateScope = sp.scope === "rate";
  const ids = rateScope ? await rateRecalcVariantIds() : list(sp.ids);
  const productId = rateScope ? undefined : list(sp.productId)[0];
  const [t, view] = await Promise.all([
    getTranslations("SellingPrices.manualPage"),
    rateScope && ids.length === 0 ? null : manualPricingView({ variantIds: ids, productId }),
  ]);
  const canReview = can(user.role, "catalog:manage");
  const canApprove = can(user.role, "catalog:approve");
  const back = productId ? `/admin/products/${productId}?tab=price` : "/admin/selling-prices";

  return (
    <Page>
      <PageHeader title={rateScope ? t("rateRecalcTitle") : t("title")} description={t("subtitle")} back={{ href: back, label: t("back") }} />
      {rateScope && (
        <Notice tone={ids.length ? "info" : "success"} data-testid="rate-recalc-notice">
          {ids.length ? t("rateRecalcHint", { count: ids.length }) : t("rateRecalcNone")}
        </Notice>
      )}
      {view && <ManualPricingSheet view={view} canReview={canReview} canApprove={canApprove} editAll={rateScope} />}
    </Page>
  );
}
