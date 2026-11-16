import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/admin/action-form";
import { ManualVndForm } from "@/components/admin/manual-price-form";
import { DataTable, LinkButton, Page, PageHeader, Section, Td, fieldClass, fieldLabelClass } from "@/components/admin/ui";
import { Notice } from "@/components/ui/notice";
import { fmtInt } from "@/lib/format";
import { can } from "@/server/auth/roles";
import { requirePagePermission } from "@/server/auth/session";
import { saveProductPricingAction } from "@/server/catalog/actions";
import { manualPricingView, type ManualRow } from "@/server/pricing/manual";

const list = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []).filter((x) => /^[a-z0-9]{1,40}$/i.test(x)).slice(0, 200);

/**
 * Trang Giá bán — chế độ THỦ CÔNG (16/11): đặt giá cho các SKU đã chọn (`ids`) hoặc mọi SKU của một SP (`productId`).
 * Kho hàng nhập VN: bảng công thức (lô cơ sở, lãi VND, tỷ giá, vận chuyển, CTV). Kho mua MMK: nghiệp vụ cũ
 * (giá nhập thẳng + hoa hồng + lãi cố định, đổi giá cần lý do). SP đã duyệt → chờ duyệt, giá + hoa hồng áp cùng lúc.
 */
export default async function ManualPricesPage({ searchParams }: PageProps<"/admin/selling-prices/manual">) {
  const user = await requirePagePermission("pricing:manage");
  const sp = await searchParams;
  const ids = list(sp.ids);
  const productId = list(sp.productId)[0];
  const [t, view] = await Promise.all([getTranslations("SellingPrices.manualPage"), manualPricingView({ variantIds: ids, productId })]);
  const canReview = can(user.role, "catalog:manage");
  const canApprove = can(user.role, "catalog:approve");
  const back = productId ? `/admin/products/${productId}?tab=price` : "/admin/selling-prices";

  return (
    <Page>
      <PageHeader title={t("title")} description={t("subtitle")} back={{ href: back, label: t("back") }} />
      {view.groups.length === 0 && <Notice tone="info">{t("empty")}</Notice>}
      {view.truncated && <Notice tone="warning">{t("truncated")}</Notice>}
      {view.groups.map((g) =>
        g.location.pricingMode === "VN_IMPORT" ? (
          <Section key={g.location.id} title={t("groupVnd", { name: g.location.name })} testId="manual-vnd">
            {view.rates.length === 0 ? (
              <Notice tone="warning">
                {t("noRate")} <LinkButton href="/admin/selling-prices?mode=rates">{t("addRate")}</LinkButton>
              </Notice>
            ) : (
              <ManualVndForm location={g.location} rows={g.rows} rates={view.rates} currentRateId={view.currentRateId} roundTo={view.roundTo} canReview={canReview} canApprove={canApprove} />
            )}
          </Section>
        ) : (
          <Section key={g.location.id} title={t("groupMmk", { name: g.location.name })} testId="manual-mmk">
            <p className="text-sm text-muted-foreground">{t("mmkHelp")}</p>
            {[...new Set(g.rows.map((r) => r.productId))].map((pid) => (
              <MmkProductForm key={pid} rows={g.rows.filter((r) => r.productId === pid)} />
            ))}
          </Section>
        ),
      )}
    </Page>
  );
}

/** Kho mua MMK: giữ nghiệp vụ cũ (giá nhập thẳng, hoa hồng CTV, lãi cố định của SP), mỗi SP một form. */
async function MmkProductForm({ rows }: { rows: ManualRow[] }) {
  const t = await getTranslations("SellingPrices.manualPage");
  const first = rows[0];
  return (
    <ActionForm action={saveProductPricingAction} submitLabel={t("saveMmk")} className="space-y-3 rounded-lg border p-3">
      <input type="hidden" name="productId" value={first.productId} />
      <p className="font-medium">{first.productName}</p>
      <DataTable stack head={[t("colSku"), t("colLastCost"), t("colPrice"), t("colCtv")]}>
        {rows.map((r) => (
          <tr key={r.variantId} data-testid="manual-mmk-row">
            <Td>
              <input type="hidden" name="variantId" value={r.variantId} />
              <input type="hidden" name="expectedPriceMmk" value={r.price} />
              <span className="font-mono text-xs">{r.sku}</span> <span className="text-xs text-muted-foreground">({r.label})</span>
              {r.pending && <div className="text-xs text-warning">{t("pending", { price: fmtInt(r.price) })}</div>}
            </Td>
            <Td label={t("colLastCost")} className="tabular-nums">{r.sources[0]?.unitCostMmk != null ? `${fmtInt(r.sources[0].unitCostMmk)} MMK` : "—"}</Td>
            <Td label={t("colPrice")}>
              <input aria-label={`${t("colPrice")} ${r.sku}`} name="priceMmk" type="number" min={1} max={1_000_000_000} step={1} required defaultValue={r.price || ""} className={fieldClass} />
            </Td>
            <Td label={t("colCtv")}>
              <input aria-label={`${t("colCtv")} ${r.sku}`} name="affiliateCommissionMmk" type="number" min={0} step={1} defaultValue={r.commission ?? ""} placeholder={t("ctvPercent")} className={fieldClass} />
            </Td>
          </tr>
        ))}
      </DataTable>
      <div className="flex flex-wrap gap-3">
        <label className={fieldLabelClass}>
          <span className="text-muted-foreground">{t("fixedProfit")}</span>
          <input name="fixedProfitMmk" type="number" min={0} step={1} defaultValue={first.fixedProfitMmk ?? ""} className={fieldClass} />
        </label>
        <label className={fieldLabelClass}>
          <span className="text-muted-foreground">{t("reason")}</span>
          <input name="reason" maxLength={200} className={fieldClass} />
        </label>
      </div>
    </ActionForm>
  );
}
