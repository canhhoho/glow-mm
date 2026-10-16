import { getTranslations } from "next-intl/server";
import { fmtDateTime } from "@/lib/format";
import { requirePagePermission } from "@/server/auth/session";
import { createCollectionAction, moveCollectionAction } from "@/server/content/actions";
import { listCollectionsAdmin } from "@/server/content/collections";
import { ActionButton } from "@/components/admin/action-button";
import { ActionForm } from "@/components/admin/action-form";
import { CollectionFields } from "@/components/admin/collection-fields";
import { Badge, DataTable, LinkButton, PageHeader, Td } from "@/components/admin/ui";

export default async function CollectionsPage() {
  await requirePagePermission("content:manage");
  const [t, collections] = await Promise.all([getTranslations("Content"), listCollectionsAdmin()]);
  const now = new Date();

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader title={t("collectionsTitle")} />
      <DataTable
        empty={t("collectionsEmpty")}
        head={[t("colName"), t("slug"), t("colItems"), t("colHome"), t("colSchedule"), t("colStatus"), ""]}
      >
        {collections.map((c, i) => {
          const live = c.active && (!c.startAt || c.startAt <= now) && (!c.endAt || c.endAt > now);
          return (
            <tr key={c.id} data-testid="collection-row">
              <Td>
                <p>{c.nameEn}</p>
                <p className="text-xs text-muted-foreground" lang="my">
                  {c.nameMy}
                </p>
              </Td>
              <Td className="font-mono text-xs">{c.slug}</Td>
              <Td>{c.items}</Td>
              <Td>{c.showOnHome ? t("yes") : t("no")}</Td>
              <Td className="text-xs whitespace-nowrap">
                {c.startAt || c.endAt ? `${fmtDateTime(c.startAt)} → ${fmtDateTime(c.endAt)}` : t("always")}
              </Td>
              <Td>
                <Badge tone={live ? "success" : "neutral"}>{live ? t("statusLive") : c.active ? t("statusScheduled") : t("statusOff")}</Badge>
              </Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  <LinkButton href={`/admin/content/collections/${c.id}`}>{t("edit")}</LinkButton>
                  {i > 0 && <ActionButton action={moveCollectionAction} fields={{ id: c.id, direction: "up" }} label={`↑ ${t("up")}`} variant="outline" />}
                  {i < collections.length - 1 && (
                    <ActionButton action={moveCollectionAction} fields={{ id: c.id, direction: "down" }} label={`↓ ${t("down")}`} variant="outline" />
                  )}
                </div>
              </Td>
            </tr>
          );
        })}
      </DataTable>

      <section aria-labelledby="new-collection" className="rounded-lg border p-4">
        <h2 id="new-collection" className="mb-3 font-medium">
          {t("collectionNew")}
        </h2>
        <ActionForm action={createCollectionAction} submitLabel={t("create")}>
          <CollectionFields />
        </ActionForm>
      </section>
    </div>
  );
}
