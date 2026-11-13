import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { getLocationState, listLocationStates, searchTownships, type LocationLevel } from "@/server/locations/admin";
import { saveLocationsAction } from "@/server/locations/actions";
import { ActionForm } from "@/components/admin/action-form";
import { Badge, checkboxClass, DataTable, EmptyState, fieldClass, FilterBar, FilterButton, Page, PageHeader, SearchInput } from "@/components/admin/ui";
import { cn } from "@/lib/utils";

type Row = { level: LocationLevel; id: string; code: string; nameEn: string; nameMy: string; active: boolean };

/** Một dòng sửa được: mã VTP chỉ đọc, tên Anh / Myanmar, ô "đang giao". `row` hidden = dòng có trong form. */
function LocationRow({ r, label, extra, strong }: { r: Row; label: string; extra?: React.ReactNode; strong?: boolean }) {
  return (
    <tr className={cn("align-middle", strong && "bg-muted/50")} data-testid={`location-${r.level}`}>
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
        <input type="checkbox" name={`active:${r.id}`} defaultChecked={r.active} aria-label={`${label} active`} className={checkboxClass} />
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

  const table = (children: React.ReactNode, extra?: string) => (
    <DataTable tableClassName="min-w-[40rem]" head={[t("code"), t("nameEn"), t("nameMy"), t("active"), ...(extra ? [extra] : [])]}>
      {children}
    </DataTable>
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
        <EmptyState>{t("noResults")}</EmptyState>
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
      <EmptyState>{t("noResults")}</EmptyState>
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
                {t("townships", { active: s.townships.active, total: s.townships.total, districts: s._count.districts })}
                <ArrowRight aria-hidden className="ml-1 inline size-3.5" />
              </Link>
            }
          />
        )),
        t("children"),
      ),
    );
  }

  return (
    <Page>
      <PageHeader
        title={t("title")}
        description={t("hint")}
        back={stateId || q ? { href: "/admin/settings/locations", label: t("allStates") } : undefined}
      />
      <FilterBar>
        <SearchInput label={t("search")} defaultValue={q} />
        <FilterButton>{(await getTranslations("Common"))("filter")}</FilterButton>
      </FilterBar>
      {body}
    </Page>
  );
}
