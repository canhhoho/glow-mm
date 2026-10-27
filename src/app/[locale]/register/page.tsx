import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { StoreLocale } from "@/i18n/routing";
import { emailAuthEnabled, googleAuthEnabled } from "@/lib/env";
import { safeNextPath } from "@/server/auth/customer-policy";
import { getCustomerUser } from "@/server/auth/customer-session";
import { AuthCard, OrDivider } from "@/components/store/auth-card";
import { GoogleButton, RegisterForm } from "@/components/store/auth-forms";
import { BlockSkeleton } from "@/components/store/ui";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function RegisterPage(props: PageProps<"/[locale]/register">) {
  return (
    <Suspense fallback={<BlockSkeleton />}>
      <RegisterContent {...props} />
    </Suspense>
  );
}

/** Đăng ký khách (P14b): email + mật khẩu → email xác minh; hoặc Google (tạo tài khoản ngay). */
async function RegisterContent({ params, searchParams }: PageProps<"/[locale]/register">) {
  const { locale } = (await params) as { locale: StoreLocale };
  setRequestLocale(locale);
  const sp = await searchParams;
  const prefix = locale === "en" ? "/en" : "";
  const next = safeNextPath(sp.next, `${prefix}/account`);
  if (await getCustomerUser()) redirect(next);

  const t = await getTranslations({ locale, namespace: "Auth" });
  const emailOn = emailAuthEnabled();
  const googleOn = googleAuthEnabled();

  return (
    <AuthCard title={t("registerTitle")}>
      {googleOn && <GoogleButton prefix={prefix} next={next} />}
      {googleOn && emailOn && <OrDivider label={t("or")} />}
      {emailOn ? <RegisterForm prefix={prefix} next={next} /> : <p className="text-sm text-muted-foreground">{t(googleOn ? "emailOff" : "noMethod")}</p>}
      <p className="text-sm">
        {t("haveAccount")}{" "}
        <Link href={{ pathname: "/login", query: { next } }} className="inline-flex min-h-11 items-center font-medium text-brand hover:underline">
          {t("signInLink")}
        </Link>
      </p>
    </AuthCard>
  );
}
