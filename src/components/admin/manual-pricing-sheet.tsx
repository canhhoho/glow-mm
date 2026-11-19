import { getTranslations } from "next-intl/server";
import { ManualPriceForm } from "@/components/admin/manual-price-form";
import { LinkButton, Section } from "@/components/admin/ui";
import { Notice } from "@/components/ui/notice";
import type { manualPricingView } from "@/server/pricing/manual";

/**
 * Bảng đặt giá thủ công, mỗi kho bán một khung (19/11/2026: kho nhập VN và kho mua tại Myanmar dùng CHUNG một bảng —
 * khác nhau ở tiền của giá mua/lãi, tỷ giá và cột vận chuyển; xem `ManualPriceForm`).
 * `editAll`: mở sẵn chế độ sửa mọi dòng (nút "Tính lại theo tỷ giá mới", chỉ kho nhập VN) — xem lại rồi lưu một lần.
 */
export async function ManualPricingSheet({ view, canReview, canApprove, editAll = false }: { view: Awaited<ReturnType<typeof manualPricingView>>; canReview: boolean; canApprove: boolean; editAll?: boolean }) {
  const t = await getTranslations("SellingPrices.manualPage");
  return (<>
      {view.groups.length === 0 && view.unplaced.length === 0 && <Notice tone="info">{t("empty")}</Notice>}
      {view.unplaced.length > 0 && (
        <Notice tone="warning" data-testid="manual-unplaced">{t("unplaced", { skus: view.unplaced.join(", ") })}</Notice>
      )}
      {view.truncated && <Notice tone="warning">{t("truncated")}</Notice>}
      {view.groups.map((g) => {
        const mmk = g.location.pricingMode === "LOCAL_MMK";
        return (
          <Section key={g.location.id} title={t(mmk ? "groupMmk" : "groupVnd", { name: g.location.name })} testId={mmk ? "manual-mmk" : "manual-vnd"}>
            {!mmk && view.rates.length === 0 && (
              <Notice tone="warning">
                {t("noRate")} <LinkButton href="/admin/selling-prices?mode=rates">{t("addRate")}</LinkButton>
              </Notice>
            )}
            {/* key theo tập SKU (không theo giá): lưu xong giá đổi thì form KHÔNG dựng lại → giữ thông báo "Đã áp dụng…"; đổi trang/bộ lọc/tỷ giá thì dựng lại. */}
            <ManualPriceForm
              key={`${g.location.id}|${g.rows.map((r) => r.variantId).join(",")}|${view.currentRateId}|${view.roundTo}`}
              mode={g.location.pricingMode}
              location={g.location}
              rows={g.rows}
              rates={view.rates}
              currentRateId={view.currentRateId}
              roundTo={view.roundTo}
              canReview={canReview}
              canApprove={canApprove}
              editAll={editAll && !mmk}
            />
          </Section>
        );
      })}
  </>);
}
