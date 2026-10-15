import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { productName } from "@/server/inventory/queries";
import { moderateReviewAction } from "@/server/reviews/actions";
import { listReviewsAdmin } from "@/server/reviews/reviews";
import { ActionButton } from "@/components/admin/action-button";
import { DataTable, PageHeader, Td } from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import { fmtDateTime } from "@/lib/format";

const STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
type Status = (typeof STATUSES)[number];

export default async function ReviewsPage({ searchParams }: PageProps<"/admin/reviews">) {
  await requirePagePermission("reviews:moderate");
  const { status: raw } = await searchParams;
  const status: Status = STATUSES.includes(raw as Status) ? (raw as Status) : "PENDING";
  const [t, rows] = await Promise.all([getTranslations("Reviews"), listReviewsAdmin(status)]);

  return (
    <div className="max-w-5xl space-y-4">
      <PageHeader title={t("title")} />
      <nav className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/reviews?status=${s}`}
            aria-current={s === status ? "page" : undefined}
            className={cn(
              "inline-flex h-8 items-center rounded-lg border px-3 text-sm",
              s === status ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted",
            )}
          >
            {t(`st.${s}`)}
          </Link>
        ))}
      </nav>
      <DataTable empty={t("empty")} head={[t("created"), t("product"), t("rating"), t("body"), t("order"), ""]}>
        {rows.map((r) => (
          <tr key={r.id} data-testid="review-row">
            <Td className="whitespace-nowrap">{fmtDateTime(r.createdAt)}</Td>
            <Td>{productName(r.product.translations, r.product.slug)}</Td>
            <Td className="whitespace-nowrap text-primary">{"★".repeat(r.rating)}</Td>
            <Td className="max-w-sm whitespace-pre-line">{r.body ?? "—"}</Td>
            <Td>
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
    </div>
  );
}
