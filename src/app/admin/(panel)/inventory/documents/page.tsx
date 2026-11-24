import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { can } from "@/server/auth/roles";
import { datePresetItems, optionalRange, presetLabels } from "@/lib/date-range";
import { DOC_PAGE_SIZE, DOC_TYPES, isDocType, listDocuments } from "@/server/inventory/queries";
import { LocationName, NewDocMenu } from "@/components/admin/stock-parts";
import { Badge, ClearFilters, DataTable, DateRangeFields, fieldClass, FilterBar, FilterButton, Page, PageHeader, PageNumbers, SearchInput, TabNav, Td } from "@/components/admin/ui";
import { fmtDate } from "@/lib/format";

const STATUS_TONE = { DRAFT: "warning", POSTED: "success", CANCELLED: "neutral" } as const;

export default async function DocumentsPage({ searchParams }: PageProps<"/admin/inventory/documents">) {
  const user = await requirePagePermission("stock:view");
  const sp = await searchParams;
  // Danh sách chỉ có hai nhóm. Phiếu đã huỷ vẫn giữ để tra cứu lịch sử qua trang chi tiết.
  const status = sp.status === "DRAFT" ? "DRAFT" : "POSTED";
  const split = Math.min(20, Math.max(0, Number(typeof sp.split === "string" ? sp.split : 0) || 0)); // thông báo "đã tách thành N phiếu"
  const str = (v: string | string[] | undefined) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const q = str(sp.q)?.slice(0, 100);
  const type = isDocType(sp.type) ? sp.type : undefined;
  // P25 gói A: lọc phiếu do trợ lý AI tạo (badge menu "phiếu nháp do AI tạo" trỏ tới đây).
  const source = sp.source === "AGENT" ? ("AGENT" as const) : undefined;
  const { from, to } = optionalRange(sp);
  const [t, ti, tc, result] = await Promise.all([
    getTranslations("Docs"),
    getTranslations("Inventory"),
    getTranslations("Common"),
    listDocuments({ status, type, source, q, from, to, page: Number(str(sp.page)) || 1 }),
  ]);
  const docs = result.rows;
  const filtered = !!(q || type || source || from || to);
  const href = (over: Record<string, string | number | undefined>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries({ status: status === "DRAFT" ? "DRAFT" : undefined, q, type, source, from, to, ...over })) {
      if (v !== undefined && v !== "" && !(k === "page" && String(v) === "1")) qs.set(k, String(v));
    }
    return `/admin/inventory/documents${qs.size ? `?${qs}` : ""}`;
  };
  return (
    <Page>
      <PageHeader
        title={t("title")}
        actions={<NewDocMenu role={user.role} label={t("new")} td={t} />}
      />
      {split > 1 && status === "DRAFT" && <p role="status" data-testid="receive-split-notice" className="rounded-md bg-success-muted px-3 py-2 text-sm text-success">{t("splitNotice", { n: split })}</p>}
      <TabNav label={t("status")} tabs={(["POSTED", "DRAFT"] as const).map((s) => ({
        href: href({ status: s === "DRAFT" ? "DRAFT" : undefined, page: undefined }), active: status === s, label: t(s),
      }))} />
      {/* 20/11/2026 (audit #3): tìm / lọc / phân trang — giữ tab trạng thái bằng ô ẩn. */}
      <FilterBar>
        {status === "DRAFT" && <input type="hidden" name="status" value="DRAFT" />}
        <SearchInput label={t("searchDocs")} defaultValue={q} />
        <select name="type" defaultValue={type ?? ""} aria-label={t("type")} className={fieldClass}>
          <option value="">{t("allTypes")}</option>
          {DOC_TYPES.map((k) => (
            <option key={k} value={k}>
              {t(k)}
            </option>
          ))}
        </select>
        <select name="source" defaultValue={source ?? ""} aria-label={t("source")} className={fieldClass}>
          <option value="">{t("sourceAll")}</option>
          <option value="AGENT">{t("sourceAgent")}</option>
        </select>
        <DateRangeFields from={from} to={to} fromLabel={t("fromDate")} toLabel={t("toDate")} presetsLabel={tc("datePresets")} presets={datePresetItems(presetLabels(tc), (r) => href({ ...r, page: undefined }), { from, to })} />
        <FilterButton>{tc("filter")}</FilterButton>
        {filtered && <ClearFilters href={href({ q: undefined, type: undefined, source: undefined, from: undefined, to: undefined, page: undefined })}>{t("clearFilters")}</ClearFilters>}
      </FilterBar>
      <DataTable
        stack
        empty={filtered ? t("emptyFiltered") : t("empty")}
        numeric={[5]}
        head={[t("code"), t("type"), t("status"), t("from"), t("to"), t("lines"), t("createdAt")]}
      >
        {docs.map((d) => (
          <tr key={d.id}>
            <Td>
              {/* Phiếu nhập nháp: người có quyền nhập kho mở thẳng form sửa (chọn SP → điền kho/số lượng/hạn); người khác xem chi tiết. */}
              <Link href={d.type === "RECEIVE" && d.status === "DRAFT" && can(user.role, "stock:receive") ? `/admin/inventory/documents/${d.id}/edit` : `/admin/inventory/documents/${d.id}`} className="font-mono text-xs text-primary underline">
                {d.code}
              </Link>
              {d.source === "AGENT" && <span className="ml-1.5 align-middle"><Badge tone="brand">{t("sourceAgentBadge")}</Badge></span>}
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
      {result.total > 0 && (
        <PageNumbers
          page={result.page}
          pageCount={result.pageCount}
          pageSize={DOC_PAGE_SIZE}
          status={t("pageStatus", { page: result.page, pages: result.pageCount, total: result.total })}
          prevLabel={t("prevPage")}
          nextLabel={t("nextPage")}
          href={(pg) => href({ page: pg })}
        />
      )}
    </Page>
  );
}
