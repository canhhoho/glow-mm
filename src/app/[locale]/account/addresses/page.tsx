import { Pencil, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { StoreLocale } from "@/i18n/routing";
import { listAddresses, MAX_ADDRESSES } from "@/server/accounts/accounts";
import { deleteAddressAction, setDefaultAddressAction } from "@/server/accounts/actions";
import { requireCustomer } from "@/server/auth/customer-session";
import { addressCatalog } from "@/server/locations/cached";
import { AccountShell } from "@/components/store/account-shell";
import { AddressForm } from "@/components/store/account-forms";
import { Notice, storeCard } from "@/components/store/ui";
import { PageSkeleton } from "@/components/ui/skeleton";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit";
import { buttonVariants } from "@/components/ui/button-variants";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AddressesPage(props: PageProps<"/[locale]/account/addresses">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AddressesContent {...props} />
    </Suspense>
  );
}

const smallButton = "inline-flex min-h-11 items-center px-2 text-sm hover:underline";

/** Sổ địa chỉ (P14b): danh sách + thêm; `?edit=<id>` mở form sửa. Đặt mặc định / xoá là form thường (không cần JS). */
async function AddressesContent({ params, searchParams }: PageProps<"/[locale]/account/addresses">) {
  const { locale } = (await params) as { locale: StoreLocale };
  setRequestLocale(locale);
  const user = await requireCustomer(locale, "/account/addresses");
  const { edit, saved } = await searchParams;
  const [t, addresses, catalog] = await Promise.all([
    getTranslations({ locale, namespace: "Account" }),
    listAddresses(user.id),
    addressCatalog(locale),
  ]);
  const editing = typeof edit === "string" ? addresses.find((a) => a.id === edit) : undefined;

  return (
    <AccountShell user={user} locale={locale} active="addresses">
      <h2 className="font-medium">{t("addressesTitle")}</h2>
      {saved && <Notice tone="success">{t("saved")}</Notice>}
      {addresses.length === 0 && <EmptyState>{t("noAddresses")}</EmptyState>}
      <ul className="space-y-2">
        {addresses.map((a) => (
          <li key={a.id} className={`${storeCard} space-y-2 text-sm`} data-testid="address">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{a.recipientName}</span>
              <span>{a.phone}</span>
              {a.phone2 && <span>· {a.phone2}</span>}
              {a.isDefault && <Badge tone="success">{t("default")}</Badge>}
            </p>
            <p>
              {a.line}
              <br />
              {[a.township, a.township.district, a.township.district.state].map((x) => (locale === "my" ? x.nameMy : x.nameEn)).join(", ")}
              {!(a.township.active && a.township.district.active && a.township.district.state.active) && (
                <span className="text-destructive"> · {t("zoneInactive")}</span>
              )}
            </p>
            {a.note && <p className="text-muted-foreground">{a.note}</p>}
            <div className="flex flex-wrap gap-1 border-t border-border pt-1">
              <Link href={{ pathname: "/account/addresses", query: { edit: a.id } }} className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-border hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:size-9" title={t("edit")} aria-label={t("edit")}><Pencil aria-hidden className="size-4 shrink-0" /></Link>
              {!a.isDefault && (
                <form action={setDefaultAddressAction}>
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="id" value={a.id} />
                  <button type="submit" className={smallButton}>
                    {t("setDefault")}
                  </button>
                </form>
              )}
              <form action={deleteAddressAction}>
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="id" value={a.id} />
                <ConfirmSubmitButton confirm={t("deleteAddressConfirm")} className={buttonVariants({ variant: "destructive", size: "icon-lg" })} title={t("delete")} aria-label={t("delete")}><Trash2 aria-hidden className="size-4 shrink-0" /></ConfirmSubmitButton>
              </form>
            </div>
          </li>
        ))}
      </ul>

      {(editing || addresses.length < MAX_ADDRESSES) && (
        <section aria-labelledby="addr-form-h" className={`${storeCard} space-y-3`}>
          <h3 id="addr-form-h" className="font-medium">
            {t(editing ? "editAddress" : "addAddress")}
          </h3>
          {/* key: đổi địa chỉ đang sửa → form mới với giá trị mặc định mới. */}
          <AddressForm key={editing?.id ?? "new"} locale={locale} catalog={catalog} address={editing} />
        </section>
      )}
      {!editing && addresses.length >= MAX_ADDRESSES && (
        <p className="text-sm text-muted-foreground">{t("maxAddresses", { n: MAX_ADDRESSES })}</p>
      )}
    </AccountShell>
  );
}
