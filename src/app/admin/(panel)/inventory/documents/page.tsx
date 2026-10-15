import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { listDocuments } from "@/server/inventory/queries";
import { Badge, DataTable, LinkButton, PageHeader, Td } from "@/components/admin/ui";
import { fmtDate } from "@/lib/format";

const STATUS_TONE = { DRAFT: "warning", POSTED: "success", CANCELLED: "neutral" } as const;

export default async function DocumentsPage() {
  await requirePagePermission("stock:view");
  const [t, docs] = await Promise.all([getTranslations("Docs"), listDocuments({})]);
  return (
    <div>
      <PageHeader title={t("title")} actions={<LinkButton href="/admin/inventory">← {t("back")}</LinkButton>} />
      <DataTable
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
            <Td>{t(d.type)}</Td>
            <Td>
              <Badge tone={STATUS_TONE[d.status]}>{t(d.status)}</Badge>
            </Td>
            <Td className="font-mono text-xs">{d.from?.code ?? "—"}</Td>
            <Td className="font-mono text-xs">{d.to?.code ?? "—"}</Td>
            <Td className="text-right">{d._count.lines}</Td>
            <Td className="whitespace-nowrap">{fmtDate(d.createdAt)}</Td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
}
