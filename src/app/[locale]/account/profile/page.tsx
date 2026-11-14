import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { StoreLocale } from "@/i18n/routing";
import { emailAuthEnabled } from "@/lib/env";
import { requireCustomer } from "@/server/auth/customer-session";
import { AccountShell } from "@/components/store/account-shell";
import { ChangePasswordForm, ProfileForm } from "@/components/store/account-forms";
import { BlockSkeleton, storeCard } from "@/components/store/ui";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function ProfilePage(props: PageProps<"/[locale]/account/profile">) {
  return (
    <Suspense fallback={<BlockSkeleton />}>
      <ProfileContent {...props} />
    </Suspense>
  );
}

/** Hồ sơ (P14b): sửa tên; đổi mật khẩu khi tài khoản có mật khẩu (tài khoản chỉ Google thì không có). */
async function ProfileContent({ params }: PageProps<"/[locale]/account/profile">) {
  const { locale } = (await params) as { locale: StoreLocale };
  setRequestLocale(locale);
  const user = await requireCustomer(locale, "/account/profile");
  const [t, ta] = await Promise.all([getTranslations({ locale, namespace: "Account" }), getTranslations({ locale, namespace: "Auth" })]);

  return (
    <AccountShell user={user} locale={locale} active="profile">
      <section aria-labelledby="profile-h" className={`${storeCard} space-y-3`}>
        <h2 id="profile-h" className="font-medium">
          {t("profileTitle")}
        </h2>
        <p className="text-sm">
          <span className="text-muted-foreground">{t(user.contact === user.phone ? "phone" : "email")}:</span> {user.contact}
        </p>
        <ProfileForm locale={locale} name={user.name} />
      </section>
      <section aria-labelledby="password-h" className={`${storeCard} space-y-3`}>
        <h2 id="password-h" className="font-medium">
          {t("passwordTitle")}
        </h2>
        {user.hasPassword ? (
          <ChangePasswordForm locale={locale} />
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("noPassword")}{" "}
            {emailAuthEnabled() && (
              <Link href="/forgot-password" className="inline-flex min-h-11 items-center text-accent-foreground hover:underline">
                {ta("forgot")}
              </Link>
            )}
          </p>
        )}
      </section>
    </AccountShell>
  );
}
