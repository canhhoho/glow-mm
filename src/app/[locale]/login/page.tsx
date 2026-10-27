import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { StoreLocale } from "@/i18n/routing";
import { emailAuthEnabled, googleAuthEnabled } from "@/lib/env";
import { authRedirectErrorKey, safeNextPath } from "@/server/auth/customer-policy";
import { getCustomerUser } from "@/server/auth/customer-session";
import { AuthCard, OrDivider } from "@/components/store/auth-card";
import { GoogleButton, LoginForm } from "@/components/store/auth-forms";
import { BlockSkeleton, Notice } from "@/components/store/ui";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function LoginPage(props: PageProps<"/[locale]/login">) {
  return (
    <Suspense fallback={<BlockSkeleton />}>
      <LoginContent {...props} />
    </Suspense>
  );
}

/**
 * Đăng nhập khách (P14b). `?next=` = trang quay lại (đường dẫn nội bộ, đã có tiền tố ngôn ngữ);
 * `?error=` = mã lỗi Better Auth khi Google / link xác minh chuyển về. Đã đăng nhập → đi thẳng tới `next`.
 */
async function LoginContent({ params, searchParams }: PageProps<"/[locale]/login">) {
  const { locale } = (await params) as { locale: StoreLocale };
  setRequestLocale(locale);
  const sp = await searchParams;
  const prefix = locale === "en" ? "/en" : "";
  const next = safeNextPath(sp.next, `${prefix}/account`);
  if (await getCustomerUser()) redirect(next);

  const t = await getTranslations({ locale, namespace: "Auth" });
  const emailOn = emailAuthEnabled();
  const googleOn = googleAuthEnabled();
  const error = typeof sp.error === "string" ? authRedirectErrorKey(sp.error) : null;

  return (
    <AuthCard title={t("loginTitle")} intro={t("loginIntro")}>
      {error && <Notice tone="error">{t(`err.${error}`, { min: 8 })}</Notice>}
      {sp.verified && !error && <Notice tone="success">{t("verified")}</Notice>}
      {googleOn && <GoogleButton prefix={prefix} next={next} />}
      {googleOn && emailOn && <OrDivider label={t("or")} />}
      {emailOn ? (
        <>
          <LoginForm prefix={prefix} next={next} />
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <Link href="/forgot-password" className="inline-flex min-h-11 items-center text-accent-foreground hover:underline">
              {t("forgot")}
            </Link>
            <span>
              {t("noAccount")}{" "}
              <Link
                href={{ pathname: "/register", query: { next } }}
                className="inline-flex min-h-11 items-center font-medium text-brand hover:underline"
              >
                {t("createAccount")}
              </Link>
            </span>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{t(googleOn ? "emailOff" : "noMethod")}</p>
      )}
    </AuthCard>
  );
}
