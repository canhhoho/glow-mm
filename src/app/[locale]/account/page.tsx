import type { Metadata } from "next";
import { Suspense } from "react";
import { ChevronRight } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { StoreLocale } from "@/i18n/routing";
import { fmtDateTime } from "@/lib/format";
import { formatMmk } from "@/lib/money";
import { accountOrders } from "@/server/accounts/accounts";
import { requireCustomer } from "@/server/auth/customer-session";
import { AccountShell } from "@/components/store/account-shell";
import { primaryButton, storeCard } from "@/components/store/ui";
import { PageSkeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AccountPage(props: PageProps<"/[locale]/account">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AccountContent {...props} />
    </Suspense>
  );
}

/** Đơn của tôi (P14b): đơn đặt khi đăng nhập + đơn cũ đã nhận về tài khoản (mã + SĐT). */
async function AccountContent({ params }: PageProps<"/[locale]/account">) {
  const { locale } = (await params) as { locale: StoreLocale };
  setRequestLocale(locale);
  const user = await requireCustomer(locale, "/account");
  const [t, to, orders] = await Promise.all([
    getTranslations({ locale, namespace: "Account" }),
    getTranslations({ locale, namespace: "Order" }),
    accountOrders(user.id),
  ]);

  return (
    <AccountShell user={user} locale={locale} active="orders">
      <section aria-labelledby="orders-h" className="space-y-3">
        <h2 id="orders-h" className="font-medium">
          {t("ordersTitle")}
        </h2>
        {orders.length === 0 ? (
          <div className={`${storeCard} space-y-3 text-sm`}>
            <p>{t("noOrders")}</p>
            <Link href="/" className={primaryButton}>
              {t("shopNow")}
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {orders.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/order/${o.code}`}
                  data-testid="account-order"
                  className={`${storeCard} flex items-center gap-3 hover:ring-brand`}
                >
                  <span className="min-w-0 flex-1 space-y-0.5">
                    <span className="block font-mono font-medium">{o.code}</span>
                    <span className="block text-xs text-muted-foreground">
                      {fmtDateTime(o.createdAt)} · {t("items", { n: o._count.items })}
                    </span>
                    <span className="block text-sm">
                      {to(`st.${o.status}`)} · {to(`pay.${o.paymentStatus}`)}
                      {o.status === "COMPLETED" && (
                        <span className="ml-2 text-xs font-normal text-brand-dark underline">
                          · {to("ratePrompt")}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="font-medium whitespace-nowrap">{formatMmk(o.totalMmk, locale)}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm text-muted-foreground">
          {t("missingOrder")}{" "}
          <Link href="/track" className="inline-flex min-h-11 items-center text-accent-foreground hover:underline">
            {t("trackLink")}
          </Link>
        </p>
      </section>
    </AccountShell>
  );
}
