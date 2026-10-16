import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { fmtDateTime } from "@/lib/format";
import { requirePagePermission } from "@/server/auth/session";
import { deleteBannerAction, moveBannerAction, toggleBannerAction } from "@/server/content/actions";
import { listBannersAdmin } from "@/server/content/banners";
import { ActionButton } from "@/components/admin/action-button";
import { Badge, DataTable, LinkButton, PageHeader, Td } from "@/components/admin/ui";

function status(b: { active: boolean; startAt: Date | null; endAt: Date | null }, now: Date) {
  if (!b.active) return "statusOff" as const;
  if (b.startAt && b.startAt > now) return "statusScheduled" as const;
  if (b.endAt && b.endAt <= now) return "statusEnded" as const;
  return "statusLive" as const;
}

const TONE = { statusLive: "success", statusOff: "neutral", statusScheduled: "warning", statusEnded: "neutral" } as const;

export default async function BannersPage({ searchParams }: PageProps<"/admin/content/banners">) {
  await requirePagePermission("content:manage");
  const [{ saved }, t, banners] = await Promise.all([searchParams, getTranslations("Content"), listBannersAdmin()]);
  const now = new Date();
  const localeLabel = (l: string | null) => (l === "my" ? t("localeMy") : l === "en" ? t("localeEn") : t("localeAll"));

  return (
    <div className="max-w-6xl space-y-4">
      <PageHeader
        title={t("bannersTitle")}
        actions={
          <LinkButton href="/admin/content/banners/new" variant="primary">
            {t("bannerNew")}
          </LinkButton>
        }
      />
      {saved && <p className="text-sm text-emerald-700 dark:text-emerald-400">{t("saved")}</p>}
      <DataTable
        empty={t("bannersEmpty")}
        head={[t("colImage"), t("colAlt"), t("colLocale"), t("colSchedule"), t("colStatus"), ""]}
      >
        {banners.map((b, i) => {
          const st = status(b, now);
          return (
            <tr key={b.id} data-testid="banner-row">
              <Td>
                <div className="relative aspect-[3/1] w-40 overflow-hidden rounded bg-muted">
                  <Image src={b.desktopFile.url} alt={b.alt} fill sizes="160px" className="object-cover" />
                </div>
              </Td>
              <Td>
                <p>{b.alt}</p>
                {b.href && <p className="font-mono text-xs text-muted-foreground">{b.href}</p>}
              </Td>
              <Td>{localeLabel(b.locale)}</Td>
              <Td className="text-xs whitespace-nowrap">
                {b.startAt || b.endAt ? `${fmtDateTime(b.startAt)} → ${fmtDateTime(b.endAt)}` : t("always")}
              </Td>
              <Td>
                <Badge tone={TONE[st]}>{t(st)}</Badge>
              </Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  <LinkButton href={`/admin/content/banners/${b.id}`}>{t("edit")}</LinkButton>
                  {i > 0 && <ActionButton action={moveBannerAction} fields={{ id: b.id, direction: "up" }} label={`↑ ${t("up")}`} variant="outline" />}
                  {i < banners.length - 1 && (
                    <ActionButton action={moveBannerAction} fields={{ id: b.id, direction: "down" }} label={`↓ ${t("down")}`} variant="outline" />
                  )}
                  <ActionButton
                    action={toggleBannerAction}
                    fields={{ id: b.id, active: String(!b.active) }}
                    label={b.active ? t("disable") : t("enable")}
                    variant="outline"
                  />
                  <ActionButton action={deleteBannerAction} fields={{ id: b.id }} label={t("delete")} variant="destructive" confirm={t("deleteConfirm")} />
                </div>
              </Td>
            </tr>
          );
        })}
      </DataTable>
    </div>
  );
}
