import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { listDocuments } from "@/server/inventory/queries";
import { NewDocMenu } from "@/components/admin/stock-parts";
import { Badge, DataTable, Page, PageHeader, Td } from "@/components/admin/ui";
import { fmtDate } from "@/lib/format";

const STATUS_TONE = { DRAFT: "warning", POSTED: "success", CANCELLED: "neutral" } as const;

export default async function DocumentsPage() {
  const user = await requirePagePermission("stock:view");
  const [t, docs] = await Promise.all([getTranslations("Docs"), listDocuments({})]);
  return (
    <Page>
      <PageHeader
        title={t("title")}
        back={{ href: "/admin/inventory", label: t("back") }}
        actions={<NewDocMenu role={user.role} label={t("new")} td={t} />}
      />
      <DataTable
        stack
        empty={t("empty")}
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
            <Td label={t("from")} className="font-mono text-xs">{d.from?.code ?? "—"}</Td>
            <Td label={t("to")} className="font-mono text-xs">{d.to?.code ?? "—"}</Td>
            <Td label={t("lines")} className="text-right">{d._count.lines}</Td>
            <Td label={t("createdAt")} className="whitespace-nowrap">{fmtDate(d.createdAt)}</Td>
          </tr>
        ))}
      </DataTable>
    </Page>
  );
}
