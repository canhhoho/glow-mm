import Link from "next/link";
import { Check, X } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { productName } from "@/server/inventory/queries";
import { moderateReviewAction } from "@/server/reviews/actions";
import { listReviewsAdminPage, reviewStatusCounts } from "@/server/reviews/reviews";
import { ActionButton } from "@/components/admin/action-button";
import { ClearFilters, DataTable, fieldClass, FilterBar, FilterButton, Page, PageHeader, PageNumbers, SearchInput, TabNav, Td } from "@/components/admin/ui";
import { fmtDateTime } from "@/lib/format";

const STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
type Status = (typeof STATUSES)[number];

export default async function ReviewsPage({ searchParams }: PageProps<"/admin/reviews">) {
  await requirePagePermission("reviews:moderate");
  const sp = await searchParams;
  const status: Status = STATUSES.includes(sp.status as Status) ? (sp.status as Status) : "PENDING";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const rating = sp.rating ? Number(sp.rating) : undefined;
  const page = Math.max(1, Number(sp.page) || 1);

  const [t, tc, result, counts] = await Promise.all([
    getTranslations("Reviews"),
    getTranslations("Common"),
    listReviewsAdminPage({ status, q, rating, page }),
    reviewStatusCounts(),
  ]);

  const rows = result.rows;
  const filtered = Boolean(q || rating);

  const href = (over: Record<string, string | number | undefined>) => {
    const qs = new URLSearchParams();
    const merged = { status, q: q || undefined, rating, page: result.page, ...over };
    for (const [k, v] of Object.entries(merged)) {
      if (v !== undefined && v !== "" && !(k === "page" && String(v) === "1")) {
        qs.set(k, String(v));
      }
    }
    const s = qs.toString();
    return `/admin/reviews${s ? `?${s}` : ""}`;
  };

  return (
    <Page>
      <PageHeader title={t("title")} />
      <TabNav
        label={t("title")}
        tabs={STATUSES.map((s) => ({
          href: href({ status: s, page: undefined }),
          active: s === status,
          label: t(`st.${s}`),
          count: counts[s] > 0 ? counts[s] : undefined,
          tone: s === "PENDING" && counts[s] > 0 ? "brand" : undefined,
        }))}
      />
      <FilterBar>
        <input type="hidden" name="status" value={status} />
        <SearchInput name="q" label={t("searchPlaceholder")} defaultValue={q} />
        <select name="rating" defaultValue={rating ?? ""} className={fieldClass} aria-label={t("filterRating")}>
          <option value="">{t("allRatings")}</option>
          <option value="5">5 ★</option>
          <option value="4">4 ★</option>
          <option value="3">3 ★</option>
          <option value="2">2 ★</option>
          <option value="1">1 ★</option>
        </select>
        <FilterButton>{tc("filter")}</FilterButton>
        {filtered && <ClearFilters href={`/admin/reviews?status=${status}`}>{tc("clearFilters")}</ClearFilters>}
      </FilterBar>
      <DataTable stack empty={t("empty")} head={[t("created"), t("product"), t("rating"), t("body"), t("order"), <span key="act" className="sr-only">{tc("actions")}</span>]}>
        {rows.map((r) => (
          <tr key={r.id} data-testid="review-row">
            <Td label={t("created")} className="whitespace-nowrap">
              {fmtDateTime(r.createdAt)}
            </Td>
            <Td label={t("product")}>
              <Link href={`/admin/products/${r.productId}`} className="font-medium text-primary hover:underline">
                {productName(r.product.translations, r.product.slug)}
              </Link>
            </Td>
            <Td label={t("rating")} className="whitespace-nowrap text-primary">
              <span aria-hidden>{"★".repeat(r.rating)}</span>
              <span className="sr-only">{tc("ratingOf", { n: r.rating })}</span>
            </Td>
            <Td label={t("body")} className="max-w-sm whitespace-pre-line">
              {r.body ?? "—"}
            </Td>
            <Td label={t("order")}>
              <Link href={`/admin/orders/${r.order.id}`} className="font-mono text-xs text-primary underline">
                {r.order.code}
              </Link>
              <div className="text-xs text-muted-foreground">{r.order.recipientName}</div>
            </Td>
            <Td label={tc("actions")}>
              <div className="flex flex-wrap gap-2">
                {status !== "APPROVED" && (
                  <ActionButton action={moderateReviewAction} fields={{ reviewId: r.id, decision: "approve" }} label={t("approve")} icon={<Check aria-hidden />} iconOnly={false} />
                )}
                {status !== "REJECTED" && (
                  <ActionButton
                    action={moderateReviewAction}
                    fields={{ reviewId: r.id, decision: "reject" }}
                    label={t("reject")}
                    icon={<X aria-hidden />}
                    iconOnly={false}
                    variant="outline"
                  />
                )}
              </div>
            </Td>
          </tr>
        ))}
      </DataTable>
      {result.total > 0 && (
        <PageNumbers
          page={result.page}
          pageCount={result.pages}
          pageSize={result.pageSize}
          status={t("pageCount", { page: result.page, pages: result.pages, total: result.total })}
          prevLabel={t("previousPage")}
          nextLabel={t("nextPage")}
          href={(pg) => href({ page: pg })}
        />
      )}
    </Page>
  );
}
