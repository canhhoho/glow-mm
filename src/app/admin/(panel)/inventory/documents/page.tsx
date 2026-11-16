import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { listDocuments } from "@/server/inventory/queries";
import { LocationName, NewDocMenu } from "@/components/admin/stock-parts";
import { Badge, DataTable, Page, PageHeader, TabNav, Td } from "@/components/admin/ui";
import { fmtDate } from "@/lib/format";

const STATUS_TONE = { DRAFT: "warning", POSTED: "success", CANCELLED: "neutral" } as const;

export default async function DocumentsPage({ searchParams }: PageProps<"/admin/inventory/documents">) {
  const user = await requirePagePermission("stock:view");
  const sp = await searchParams;
  // Danh sách chỉ có hai nhóm. Phiếu đã huỷ vẫn giữ để tra cứu lịch sử qua trang chi tiết.
  const status = sp.status === "DRAFT" ? "DRAFT" : "POSTED";
  const [t, ti, docs] = await Promise.all([getTranslations("Docs"), getTranslations("Inventory"), listDocuments({ status })]);
  return (
    <Page>
      <PageHeader
        title={t("title")}
        actions={<NewDocMenu role={user.role} label={t("new")} td={t} />}
      />
      <TabNav label={t("status")} tabs={(["POSTED", "DRAFT"] as const).map((s) => ({
        href: `/admin/inventory/documents?status=${s}`, active: status === s, label: t(s),
      }))} />
      <DataTable
        stack
        empty={t("empty")}
        numeric={[5]}
        head={[t("code"), t("type"), t("status"), t("from"), t("to"), t("lines"), t("createdAt")]}
      >
        {docs.map((d) => (
          <tr key={d.id}>
            <Td>
              <Link href={`/admin/inventory/documents/${d.id}`} className="font-mono text-xs text-primary underline">
                {d.code}
              </Link>
            </Td>
            <Td label={t("type")}>{t(d.type)}</Td>
            <Td label={t("status")}>
              <Badge tone={STATUS_TONE[d.status]}>{t(d.status)}</Badge>
            </Td>
            <Td label={t("from")}>{d.from ? <LocationName loc={d.from} inactiveLabel={ti("inactive")} /> : "—"}</Td>
            <Td label={t("to")}>{d.to ? <LocationName loc={d.to} inactiveLabel={ti("inactive")} /> : "—"}</Td>
            <Td label={t("lines")} numeric>{d._count.lines}</Td>
            <Td label={t("createdAt")} className="whitespace-nowrap">{fmtDate(d.createdAt)}</Td>
          </tr>
        ))}
      </DataTable>
    </Page>
  );
}
