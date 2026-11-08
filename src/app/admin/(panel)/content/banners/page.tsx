import { LockKeyhole, LockKeyholeOpen, Trash2 } from "lucide-react";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { fmtDateTime } from "@/lib/format";
import { requirePagePermission } from "@/server/auth/session";
import { deleteBannerAction, moveBannerAction, toggleBannerAction } from "@/server/content/actions";
import { listBannersAdmin } from "@/server/content/banners";
import { SCHEDULE_TONE, scheduleStatus } from "@/server/content/common";
import { ActionButton } from "@/components/admin/action-button";
import { Badge, DataTable, LinkButton, Page, PageHeader, Td } from "@/components/admin/ui";

export default async function BannersPage({ searchParams }: PageProps<"/admin/content/banners">) {
  await requirePagePermission("content:manage");
  const [{ saved }, t, banners] = await Promise.all([searchParams, getTranslations("Content"), listBannersAdmin()]);
  const now = new Date();
  const localeLabel = (l: string | null) =>
    l === "my" ? t("localeMy") : l === "en" ? t("localeEn") : l === "vi" ? t("localeVi") : t("localeAll");

  return (
    <Page>
      <PageHeader
        title={t("bannersTitle")}
        actions={
          <LinkButton href="/admin/content/banners/new" variant="primary" icon="new" iconOnly={false}>
            {t("bannerNew")}
          </LinkButton>
        }
      />
      {saved && <p className="text-sm text-emerald-700 dark:text-emerald-400">{t("saved")}</p>}
      <DataTable
        stack
        empty={t("bannersEmpty")}
        head={[t("colImage"), t("colAlt"), t("colLocale"), t("colSchedule"), t("colStatus"), ""]}
      >
        {banners.map((b, i) => {
          const st = scheduleStatus(b, now);
          return (
            <tr key={b.id} data-testid="banner-row">
              <Td>
                <div className="relative aspect-[3/1] w-40 overflow-hidden rounded bg-muted">
                  <Image src={b.desktopFile.url} alt={b.alt} fill sizes="160px" className="object-cover" />
                </div>
              </Td>
              <Td label={t("colAlt")}>
                <p>{b.alt}</p>
                {b.href && <p className="font-mono text-xs text-muted-foreground">{b.href}</p>}
              </Td>
              <Td label={t("colLocale")}>{localeLabel(b.locale)}</Td>
              <Td label={t("colSchedule")} className="text-xs whitespace-nowrap">
                {b.startAt || b.endAt ? `${fmtDateTime(b.startAt)} → ${fmtDateTime(b.endAt)}` : t("always")}
              </Td>
              <Td label={t("colStatus")}>
                <Badge tone={SCHEDULE_TONE[st]}>{t(st)}</Badge>
              </Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  <LinkButton href={`/admin/content/banners/${b.id}`} iconOnly={true} icon="edit">{t("edit")}</LinkButton>
                  {i > 0 && <ActionButton action={moveBannerAction} fields={{ id: b.id, direction: "up" }} label={`↑ ${t("up")}`} variant="outline" />}
                  {i < banners.length - 1 && (
                    <ActionButton action={moveBannerAction} fields={{ id: b.id, direction: "down" }} label={`↓ ${t("down")}`} variant="outline" />
                  )}
                  <ActionButton
                    action={toggleBannerAction}
                    fields={{ id: b.id, active: String(!b.active) }}
                    label={b.active ? t("disable") : t("enable")}
                    variant="outline" iconOnly={true} icon={b.active ? <LockKeyhole aria-hidden className="size-4 shrink-0" /> : <LockKeyholeOpen aria-hidden className="size-4 shrink-0" />}
                  />
                  <ActionButton action={deleteBannerAction} fields={{ id: b.id }} label={t("delete")} variant="destructive" confirm={t("deleteConfirm")} iconOnly={true} icon={<Trash2 aria-hidden className="size-4 shrink-0" />} />
                </div>
              </Td>
            </tr>
          );
        })}
      </DataTable>
    </Page>
  );
}
