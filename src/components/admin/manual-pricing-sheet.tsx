import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/admin/action-form";
import { ManualVndForm } from "@/components/admin/manual-price-form";
import { DataTable, LinkButton, Section, Td, fieldClass, fieldLabelClass } from "@/components/admin/ui";
import { Notice } from "@/components/ui/notice";
import { fmtInt } from "@/lib/format";
import { saveProductPricingAction } from "@/server/catalog/actions";
import type { manualPricingView, ManualRow } from "@/server/pricing/manual";

/** `editAll`: mở sẵn chế độ sửa mọi dòng VND (nút "Tính lại theo tỷ giá mới") — người dùng xem lại rồi lưu một lần. */
export async function ManualPricingSheet({ view, canReview, canApprove, editAll = false }: { view: Awaited<ReturnType<typeof manualPricingView>>; canReview: boolean; canApprove: boolean; editAll?: boolean }) {
  const t = await getTranslations("SellingPrices.manualPage");
  return (<>
      {view.groups.length === 0 && view.unplaced.length === 0 && <Notice tone="info">{t("empty")}</Notice>}
      {view.unplaced.length > 0 && (
        <Notice tone="warning" data-testid="manual-unplaced">{t("unplaced", { skus: view.unplaced.join(", ") })}</Notice>
      )}
      {view.truncated && <Notice tone="warning">{t("truncated")}</Notice>}
      {view.groups.map((g) =>
        g.location.pricingMode === "VN_IMPORT" ? (
          <Section key={g.location.id} title={t("groupVnd", { name: g.location.name })} testId="manual-vnd">
            {view.rates.length === 0 && (
              <Notice tone="warning">
                {t("noRate")} <LinkButton href="/admin/selling-prices?mode=rates">{t("addRate")}</LinkButton>
              </Notice>
            )}
            {/* key theo tập SKU (không theo giá): lưu xong giá đổi thì form KHÔNG dựng lại → giữ thông báo "Đã áp dụng…"; đổi trang/bộ lọc/tỷ giá thì dựng lại. */}
            <ManualVndForm key={`${g.location.id}|${g.rows.map((r) => r.variantId).join(",")}|${view.currentRateId}|${view.roundTo}`} location={g.location} rows={g.rows} rates={view.rates} currentRateId={view.currentRateId} roundTo={view.roundTo} canReview={canReview} canApprove={canApprove} editAll={editAll} />
          </Section>
        ) : (
          <Section key={g.location.id} title={t("groupMmk", { name: g.location.name })} testId="manual-mmk">
            <p className="text-sm text-muted-foreground">{t("mmkHelp")}</p>
            {[...new Set(g.rows.map((r) => r.productId))].map((pid) => (
              <MmkProductForm key={`${pid}|${g.rows.filter((r) => r.productId === pid).map((r) => r.variantId).join(",")}`} rows={g.rows.filter((r) => r.productId === pid)} />
            ))}
          </Section>
        ),
      )}
  </>);
}

/** Kho mua MMK: giá mua, CTV và giá bán; mỗi sản phẩm một form. */
async function MmkProductForm({ rows }: { rows: ManualRow[] }) {
  const t = await getTranslations("SellingPrices.manualPage");
  const first = rows[0];
  return (
    <ActionForm action={saveProductPricingAction} submitLabel={t("saveMmk")} className="space-y-3 rounded-lg border p-3">
      <input type="hidden" name="productId" value={first.productId} />
      <p className="font-medium">{first.productName}</p>
      <DataTable stack head={[t("colSku"), t("colPurchaseMmk"), t("colCtv"), t("colPrice")]}>
        {rows.map((r) => (
          <tr key={r.variantId} data-testid="manual-mmk-row">
            <Td>
              <input type="hidden" name="variantId" value={r.variantId} />
              <input type="hidden" name="expectedPriceMmk" value={r.price} />
              <span className="font-mono text-xs">{r.sku}</span>{!r.standardLabel && <span className="text-xs text-muted-foreground"> · {r.label}</span>}
              {r.pending && <div className="text-xs text-warning">{t("pending", { price: fmtInt(r.price) })}</div>}
            </Td>
            <Td label={t("colPurchaseMmk")} className="tabular-nums">{r.sources[0]?.unitCostMmk != null ? `${fmtInt(r.sources[0].unitCostMmk)} MMK` : "—"}</Td>
            <Td label={t("colCtv")}>
              <input aria-label={`${t("colCtv")} ${r.sku}`} name="affiliateCommissionMmk" type="number" min={0} step={1} defaultValue={r.commission ?? ""} placeholder={t("ctvPercent")} className={fieldClass} />
            </Td>
            <Td label={t("colPrice")}>
              <input aria-label={`${t("colPrice")} ${r.sku}`} name="priceMmk" type="number" min={1} max={1_000_000_000} step={1} required defaultValue={r.price || ""} className={fieldClass} />
            </Td>
          </tr>
        ))}
      </DataTable>
      <div className="flex flex-wrap gap-3">
        <label className={fieldLabelClass}>
          <span className="text-muted-foreground">{t("reason")}</span>
          <input name="reason" maxLength={200} className={fieldClass} />
        </label>
      </div>
    </ActionForm>
  );
}
