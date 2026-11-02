import Link from "next/link";
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
  const [t, rows] = await Promise.all([getTranslations("Reviews"), listReviewsAdmin(status)]);

  return (
    <Page>
      <PageHeader title={t("title")} />
      <TabNav
        label={t("title")}
        tabs={STATUSES.map((s) => ({ href: `/admin/reviews?status=${s}`, active: s === status, label: t(`st.${s}`) }))}
      />
      <DataTable stack empty={t("empty")} head={[t("created"), t("product"), t("rating"), t("body"), t("order"), ""]}>
        {rows.map((r) => (
          <tr key={r.id} data-testid="review-row">
            <Td label={t("created")} className="whitespace-nowrap">
              {fmtDateTime(r.createdAt)}
            </Td>
            <Td label={t("product")}>{productName(r.product.translations, r.product.slug)}</Td>
            <Td label={t("rating")} className="whitespace-nowrap text-primary">
              {"★".repeat(r.rating)}
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
            <Td>
              <div className="flex gap-2">
                {status !== "APPROVED" && (
                  <ActionButton action={moderateReviewAction} fields={{ reviewId: r.id, decision: "approve" }} label={t("approve")} />
                )}
                {status !== "REJECTED" && (
                  <ActionButton
                    action={moderateReviewAction}
                    fields={{ reviewId: r.id, decision: "reject" }}
                    label={t("reject")}
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
