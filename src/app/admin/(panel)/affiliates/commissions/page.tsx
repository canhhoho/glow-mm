import { getTranslations } from "next-intl/server";
import { fmtInt } from "@/lib/format";
import { requirePagePermission } from "@/server/auth/session";
import { listAffiliates } from "@/server/affiliates/affiliates";
import { DataTable, FilterBar, FilterButton, LinkButton, Page, PageHeader, SearchInput, Td } from "@/components/admin/ui";

export default async function CommissionsPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  await requirePagePermission("affiliates:manage");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const [t, tn, affiliates] = await Promise.all([
    getTranslations("Affiliates"), getTranslations("Nav"), listAffiliates({ q: q || undefined }),
  ]);
  return <Page>
    <PageHeader title={tn("affiliateCommissions")} />
    <FilterBar><SearchInput label={t("search")} defaultValue={q} /><FilterButton>{t("filter")}</FilterButton></FilterBar>
    <DataTable head={[t("colCtv"), t("colCode"), t("colPending"), t("colPayable"), t("colPaid"), ""]} empty={t("emptyFiltered")} numeric={[2, 3, 4]}>
      {affiliates.map(a => <tr key={a.id}>
        <Td>{a.user.name}</Td><Td className="font-mono text-xs">{a.code}</Td>
        <Td className="text-right tabular-nums">{fmtInt(a.summary.pendingMmk)} MMK</Td>
        <Td className="text-right font-medium tabular-nums">{fmtInt(a.summary.payableMmk)} MMK</Td>
        <Td className="text-right tabular-nums">{fmtInt(a.summary.paidMmk)} MMK</Td>
        <Td><LinkButton href={`/admin/affiliates/${a.id}#affiliate-payouts`}>{t("view")}</LinkButton></Td>
      </tr>)}
    </DataTable>
  </Page>;
}
