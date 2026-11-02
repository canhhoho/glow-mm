import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { StoreLocale } from "@/i18n/routing";
import { localePrefix } from "@/lib/site";
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
  const prefix = localePrefix(locale);
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
      {googleOn && <OrDivider label={t("or")} />}
      {/* SĐT + mật khẩu luôn có (P17); email thêm vào cùng ô khi bật gửi email. */}
      <LoginForm prefix={prefix} next={next} emailEnabled={emailOn} />
      <div className="space-y-1 text-sm">
        {emailOn ? (
          <Link href="/forgot-password" className="inline-flex min-h-11 items-center text-accent-foreground hover:underline">
            {t("forgot")}
          </Link>
        ) : (
          <p className="text-muted-foreground">{t("forgotPhone")}</p>
        )}
        <p>
          {t("noAccount")}{" "}
          <Link
            href={{ pathname: "/register", query: { next } }}
            className="inline-flex min-h-11 items-center font-medium text-brand hover:underline"
          >
            {t("createAccount")}
          </Link>
        </p>
      </div>
    </AuthCard>
  );
}
