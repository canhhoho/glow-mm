import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { AUDIT_PAGE_SIZE, SYSTEM_USER, auditEntityHref, auditFilterOptions, listAuditLogs, parseAuditFilter } from "@/server/admin/audit-log";
import { datePresetItems, presetLabels } from "@/lib/date-range";
import { ClearFilters, DataTable, DateRangeFields, FilterBar, FilterButton, Page, PageHeader, PageNumbers, SearchInput, Td, fieldClass } from "@/components/admin/ui";
import { fmtDateTime } from "@/lib/format";

/**
 * P25 gói A (A2) — Nhật ký thao tác: mọi thao tác ghi của nhân viên, trợ lý AI (`agent.*`) và hệ thống (cron).
 * Chỉ đọc. Lọc theo người / nhóm hành động / mã đối tượng / ngày; có link sang đối tượng khi có trang admin.
 */
export default async function AuditLogPage({ searchParams }: PageProps<"/admin/settings/audit">) {
  await requirePagePermission("settings:manage");
  const f = parseAuditFilter(await searchParams);
  const [t, tc, result, opts] = await Promise.all([getTranslations("AuditLog"), getTranslations("Common"), listAuditLogs(f), auditFilterOptions()]);
  const filtered = !!(f.userId || f.action || f.entityId || f.from || f.to);
  const href = (over: Record<string, string | number | undefined>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries({ user: f.userId, action: f.action, q: f.entityId, from: f.from, to: f.to, ...over })) {
      if (v !== undefined && v !== "" && !(k === "page" && String(v) === "1")) qs.set(k, String(v));
    }
    return `/admin/settings/audit${qs.size ? `?${qs}` : ""}`;
  };

  return (
    <Page>
      <PageHeader title={(await getTranslations("Nav"))("auditLog")} description={t("description")} />
      <FilterBar>
        <select name="user" defaultValue={f.userId ?? ""} aria-label={t("user")} className={fieldClass}>
          <option value="">{t("allUsers")}</option>
          <option value={SYSTEM_USER}>{t("system")}</option>
          {opts.users.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
        <select name="action" defaultValue={f.action ?? ""} aria-label={t("action")} className={fieldClass}>
          <option value="">{t("allActions")}</option>
          {opts.actionGroups.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        <SearchInput label={t("searchEntity")} name="q" defaultValue={f.entityId} />
        <DateRangeFields from={f.from} to={f.to} fromLabel={t("from")} toLabel={t("to")} presetsLabel={tc("datePresets")} presets={datePresetItems(presetLabels(tc), (r) => href({ ...r, page: undefined }), { from: f.from, to: f.to })} />
        <FilterButton>{tc("filter")}</FilterButton>
        {filtered && <ClearFilters href="/admin/settings/audit">{t("clearFilters")}</ClearFilters>}
      </FilterBar>
      <DataTable stack empty={filtered ? t("emptyFiltered") : t("empty")} head={[t("time"), t("user"), t("action"), t("entity"), t("data")]}>
        {result.rows.map((r) => {
          const link = auditEntityHref(r.entity, r.entityId);
          const data = r.data === null ? "" : JSON.stringify(r.data);
          return (
            <tr key={r.id} data-testid="audit-row">
              <Td className="text-xs whitespace-nowrap">{fmtDateTime(r.createdAt)}</Td>
              <Td label={t("user")}>{r.user?.name ?? (r.userId ? r.userId : t("system"))}</Td>
              <Td label={t("action")} className="font-mono text-xs">{r.action}</Td>
              <Td label={t("entity")} className="text-xs">
                <div>{r.entity}</div>
                {r.entityId && (link ? <Link href={link} className="font-mono text-primary underline break-all">{r.entityId}</Link> : <span className="font-mono break-all text-muted-foreground">{r.entityId}</span>)}
              </Td>
              <Td label={t("data")} className="max-w-md text-xs">
                {data && (data.length <= 120 ? (
                  <code className="break-all">{data}</code>
                ) : (
                  <details>
                    <summary className="cursor-pointer break-all">{data.slice(0, 120)}…</summary>
                    <pre className="mt-1 max-h-64 overflow-auto rounded bg-muted p-2 whitespace-pre-wrap break-all">{JSON.stringify(r.data, null, 2)}</pre>
                  </details>
                ))}
              </Td>
            </tr>
          );
        })}
      </DataTable>
      {result.total > 0 && (
        <PageNumbers
          page={result.page}
          pageCount={result.pageCount}
          pageSize={AUDIT_PAGE_SIZE}
          status={t("pageStatus", { page: result.page, pages: result.pageCount, total: result.total })}
          prevLabel={t("prevPage")}
          nextLabel={t("nextPage")}
          href={(pg) => href({ page: pg })}
        />
      )}
    </Page>
  );
}
