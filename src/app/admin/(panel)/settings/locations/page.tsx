import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { getLocationState, listLocationStates, searchTownships, type LocationLevel } from "@/server/locations/admin";
import { saveLocationsAction } from "@/server/locations/actions";
import { ActionForm } from "@/components/admin/action-form";
import { Badge, fieldClass, LinkButton, PageHeader } from "@/components/admin/ui";
import { cn } from "@/lib/utils";

type Row = { level: LocationLevel; id: string; code: string; nameEn: string; nameMy: string; active: boolean };

/** Một dòng sửa được: mã VTP chỉ đọc, tên Anh / Myanmar, ô "đang giao". `row` hidden = dòng có trong form. */
function LocationRow({ r, label, extra, strong }: { r: Row; label: string; extra?: React.ReactNode; strong?: boolean }) {
  return (
    <tr className={cn("border-t align-middle", strong && "bg-muted/50")} data-testid={`location-${r.level}`}>
      <td className={cn("px-3 py-1.5 font-mono text-xs", r.level === "township" && "pl-6")}>
        <input type="hidden" name="row" value={`${r.level}:${r.id}`} />
        {r.code}
      </td>
      <td className="px-3 py-1.5">
        <input name={`nameEn:${r.id}`} defaultValue={r.nameEn} required maxLength={100} aria-label={`${label} EN`} className={cn(fieldClass, strong && "font-medium")} />
      </td>
      <td className="px-3 py-1.5">
        <input name={`nameMy:${r.id}`} defaultValue={r.nameMy} required maxLength={100} lang="my" aria-label={`${label} MY`} className={fieldClass} />
      </td>
      <td className="px-3 py-1.5 text-center">
        <input type="checkbox" name={`active:${r.id}`} defaultChecked={r.active} aria-label={`${label} active`} className="size-4" />
      </td>
      {extra !== undefined && <td className="px-3 py-1.5 text-sm whitespace-nowrap">{extra}</td>}
    </tr>
  );
}

/**
 * Địa bàn giao hàng (P15b): danh mục VTP Myanmar Vùng → Huyện → Thị trấn.
 * Không có tham số: 15 vùng. `?state=<id>`: huyện + thị trấn của một vùng. `?q=`: tìm thị trấn.
 */
export default async function LocationsPage({ searchParams }: PageProps<"/admin/settings/locations">) {
  await requirePagePermission("settings:manage");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const stateId = typeof sp.state === "string" ? sp.state : "";
  const t = await getTranslations("Locations");

  const head = (extra?: string) => (
    <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
      <tr>
        <th className="px-3 py-2 font-medium">{t("code")}</th>
        <th className="px-3 py-2 font-medium">{t("nameEn")}</th>
        <th className="px-3 py-2 font-medium">{t("nameMy")}</th>
        <th className="px-3 py-2 text-center font-medium">{t("active")}</th>
        {extra && <th className="px-3 py-2 font-medium">{extra}</th>}
      </tr>
    </thead>
  );
  const table = (children: React.ReactNode, extra?: string) => (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[40rem] text-sm">
        {head(extra)}
        <tbody>{children}</tbody>
      </table>
    </div>
  );
  const form = (children: React.ReactNode) => (
    <ActionForm action={saveLocationsAction} submitLabel={t("save")} className="space-y-3">
      {children}
    </ActionForm>
  );

  let body: React.ReactNode;
  if (q) {
    const rows = await searchTownships(q);
    body =
      rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noResults")}</p>
      ) : (
        form(
          table(
            rows.map((r) => (
              <LocationRow
                key={r.id}
                r={{ level: "township", ...r }}
                label={r.nameEn}
                extra={`${r.district.nameEn}, ${r.district.state.nameEn}`}
              />
            )),
            t("path"),
          ),
        )
      );
  } else if (stateId) {
    const state = await getLocationState(stateId);
    body = !state ? (
      <p className="text-sm text-muted-foreground">{t("noResults")}</p>
    ) : (
      <>
        <h2 className="font-medium">
          {state.nameEn} · <span lang="my">{state.nameMy}</span> <span className="font-mono text-xs text-muted-foreground">({state.code})</span>
          {!state.active && (
            <span className="ml-2">
              <Badge tone="warning">{t("stateOff")}</Badge>
            </span>
          )}
        </h2>
        {form(
          table(
            state.districts.flatMap((d) => [
              <LocationRow key={d.id} r={{ level: "district", ...d }} label={d.nameEn} strong />,
              ...d.townships.map((tw) => <LocationRow key={tw.id} r={{ level: "township", ...tw }} label={tw.nameEn} />),
            ]),
          ),
        )}
      </>
    );
  } else {
    const states = await listLocationStates();
    body = form(
      table(
        states.map((s) => (
          <LocationRow
            key={s.id}
            r={{ level: "state", ...s }}
            label={s.nameEn}
            extra={
              <Link href={`/admin/settings/locations?state=${s.id}`} className="text-primary hover:underline">
                {t("townships", { active: s.townships.active, total: s.townships.total, districts: s._count.districts })} →
              </Link>
            }
          />
        )),
        t("children"),
      ),
    );
  }

  return (
    <div className="max-w-4xl space-y-4">
      <PageHeader
        title={t("title")}
        actions={
          stateId || q ? <LinkButton href="/admin/settings/locations">← {t("allStates")}</LinkButton> : undefined
        }
      />
      <p className="text-sm text-muted-foreground">{t("hint")}</p>
      <form role="search" className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">{t("search")}</span>
          <input name="q" defaultValue={q} placeholder="Kamaryut / ကမာရွတ် / KMY" className={cn(fieldClass, "w-64")} />
        </label>
        <button type="submit" className="h-9 rounded-lg border px-3 text-sm hover:bg-muted">
          {t("find")}
        </button>
      </form>
      {body}
    </div>
  );
}
