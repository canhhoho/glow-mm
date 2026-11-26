import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { StoreLocale } from "@/i18n/routing";
import { localePrefix } from "@/lib/site";
import { emailAuthEnabled } from "@/lib/env";
import { safeNextPath } from "@/server/auth/customer-policy";
import { getCustomerUser } from "@/server/auth/customer-session";
import { AuthCard } from "@/components/store/auth-card";
import { PhoneRegisterForm, RegisterForm } from "@/components/store/auth-forms";
import { PageSkeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function RegisterPage(props: PageProps<"/[locale]/register">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <RegisterContent {...props} />
    </Suspense>
  );
}

/** Đăng ký khách: SĐT + mật khẩu (mặc định, P17); email + mật khẩu → email xác minh khi đã bật gửi email. */
async function RegisterContent({ params, searchParams }: PageProps<"/[locale]/register">) {
  const { locale } = (await params) as { locale: StoreLocale };
  setRequestLocale(locale);
  const sp = await searchParams;
  const prefix = localePrefix(locale);
  const next = safeNextPath(sp.next, `${prefix}/account`);
  if (await getCustomerUser()) redirect(next);

  const t = await getTranslations({ locale, namespace: "Auth" });
  const emailOn = emailAuthEnabled();

  return (
    <AuthCard title={t("registerTitle")}>
      {/* Mặc định đăng ký bằng SĐT + mật khẩu (P17); email là tuỳ chọn khi đã bật gửi email. */}
      <PhoneRegisterForm locale={locale} next={next} />
      {emailOn && (
        <details className="rounded-lg border border-border p-3">
          <summary className="min-h-11 cursor-pointer content-center text-sm text-accent-foreground">{t("registerWithEmail")}</summary>
          <div className="pt-3">
            <RegisterForm prefix={prefix} next={next} />
          </div>
        </details>
      )}
      <p className="text-sm">
        {t("haveAccount")}{" "}
        <Link href={{ pathname: "/login", query: { next } }} className="inline-flex min-h-11 items-center font-medium text-brand-dark hover:underline">
          {t("signInLink")}
        </Link>
      </p>
    </AuthCard>
  );
}
