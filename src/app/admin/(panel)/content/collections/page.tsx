import { getTranslations } from "next-intl/server";
import { fmtDateTime } from "@/lib/format";
import { requirePagePermission } from "@/server/auth/session";
import { createCollectionAction, moveCollectionAction } from "@/server/content/actions";
import { listCollectionsAdmin } from "@/server/content/collections";
import { SCHEDULE_TONE, scheduleStatus } from "@/server/content/common";
import { ActionButton } from "@/components/admin/action-button";
import { ActionForm } from "@/components/admin/action-form";
import { CollectionFields } from "@/components/admin/collection-fields";
import { Badge, DataTable, LinkButton, Page, PageHeader, Section, Td } from "@/components/admin/ui";

export default async function CollectionsPage() {
  await requirePagePermission("content:manage");
  const [t, collections] = await Promise.all([getTranslations("Content"), listCollectionsAdmin()]);
  const now = new Date();

  return (
    <Page>
      <PageHeader title={t("collectionsTitle")} />
      <Section title={t("collectionNew")}>
        <ActionForm action={createCollectionAction} submitLabel={t("create")}>
          <CollectionFields />
        </ActionForm>
      </Section>
      <DataTable
        stack
        empty={t("collectionsEmpty")}
        head={[t("colName"), t("slug"), t("colItems"), t("colHome"), t("colSchedule"), t("colStatus"), ""]}
      >
        {collections.map((c, i) => {
          const st = scheduleStatus(c, now);
          return (
            <tr key={c.id} data-testid="collection-row">
              <Td>
                <p>{c.nameEn}</p>
                <p className="text-xs text-muted-foreground" lang="my">
                  {c.nameMy}
                </p>
              </Td>
              <Td label={t("slug")} className="font-mono text-xs">{c.slug}</Td>
              <Td label={t("colItems")}>{c.items}</Td>
              <Td label={t("colHome")}>{c.showOnHome ? t("yes") : t("no")}</Td>
              <Td label={t("colSchedule")} className="text-xs whitespace-nowrap">
                {c.startAt || c.endAt ? `${fmtDateTime(c.startAt)} → ${fmtDateTime(c.endAt)}` : t("always")}
              </Td>
              <Td label={t("colStatus")}>
                <Badge tone={SCHEDULE_TONE[st]}>{t(st)}</Badge>
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
    </Page>
  );
}
