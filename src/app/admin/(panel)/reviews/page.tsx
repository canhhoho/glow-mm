import Link from "next/link";
import { Check, X } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { productName } from "@/server/inventory/queries";
import { moderateReviewAction } from "@/server/reviews/actions";
import { listReviewsAdmin } from "@/server/reviews/reviews";
import { ActionButton } from "@/components/admin/action-button";
import { DataTable, Page, PageHeader, TabNav, Td } from "@/components/admin/ui";
import { fmtDateTime } from "@/lib/format";

const STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
type Status = (typeof STATUSES)[number];

export default async function ReviewsPage({ searchParams }: PageProps<"/admin/reviews">) {
  await requirePagePermission("reviews:moderate");
  const { status: raw } = await searchParams;
  const status: Status = STATUSES.includes(raw as Status) ? (raw as Status) : "PENDING";
  const [t, tc, rows] = await Promise.all([getTranslations("Reviews"), getTranslations("Common"), listReviewsAdmin(status)]);

  return (
    <Page>
      <PageHeader title={t("title")} />
      <TabNav
        label={t("title")}
        tabs={STATUSES.map((s) => ({ href: `/admin/reviews?status=${s}`, active: s === status, label: t(`st.${s}`) }))}
      />
      <DataTable stack empty={t("empty")} head={[t("created"), t("product"), t("rating"), t("body"), t("order"), <span key="act" className="sr-only">{tc("actions")}</span>]}>
        {rows.map((r) => (
          <tr key={r.id} data-testid="review-row">
            <Td label={t("created")} className="whitespace-nowrap">
              {fmtDateTime(r.createdAt)}
            </Td>
            <Td label={t("product")}>{productName(r.product.translations, r.product.slug)}</Td>
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
    </Page>
  );
}
