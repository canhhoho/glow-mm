import { getTranslations } from "next-intl/server";
import { fmtInt } from "@/lib/format";
import { requirePagePermission } from "@/server/auth/session";
import { listAffiliates } from "@/server/affiliates/affiliates";
import { DataTable, FilterBar, FilterButton, LinkButton, Page, PageHeader, SearchInput, Td } from "@/components/admin/ui";

export default async function CommissionsPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  await requirePagePermission("affiliates:manage");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const [t, tn, tc, affiliates] = await Promise.all([
    getTranslations("Affiliates"), getTranslations("Nav"), getTranslations("Common"), listAffiliates({ q: q || undefined }),
  ]);
  return <Page>
    <PageHeader title={tn("affiliateCommissions")} />
    <FilterBar><SearchInput label={t("search")} defaultValue={q} /><FilterButton>{tc("filter")}</FilterButton></FilterBar>
    <DataTable stack head={[t("colCtv"), t("colCode"), t("colPending"), t("colPayable"), t("colPaid"), <span key="a" className="sr-only">{tc("actions")}</span>]} empty={q ? t("emptyFiltered") : tc("noData")} numeric={[2, 3, 4]}>
      {affiliates.map((a) => (
        <tr key={a.id}>
          <Td className="font-medium">{a.user.name}</Td>
          <Td label={t("colCode")} className="font-mono text-xs">{a.code}</Td>
          <Td label={t("colPending")} numeric>{fmtInt(a.summary.pendingMmk)} MMK</Td>
          <Td label={t("colPayable")} numeric className="font-medium">{fmtInt(a.summary.payableMmk)} MMK</Td>
          <Td label={t("colPaid")} numeric>{fmtInt(a.summary.paidMmk)} MMK</Td>
          <Td label={tc("actions")}>
            <LinkButton href={`/admin/affiliates/${a.id}#affiliate-payouts`} icon="view">{t("view")}</LinkButton>
          </Td>
        </tr>
      ))}
    </DataTable>
  </Page>;
}
