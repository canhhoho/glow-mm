import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import type { StoreLocale } from "@/i18n/routing";
import { emailAuthEnabled } from "@/lib/env";
import { AuthCard } from "@/components/store/auth-card";
import { ForgotPasswordForm } from "@/components/store/auth-forms";
import { BlockSkeleton } from "@/components/store/ui";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function ForgotPasswordPage(props: PageProps<"/[locale]/forgot-password">) {
  return (
    <Suspense fallback={<BlockSkeleton />}>
      <ForgotContent {...props} />
    </Suspense>
  );
}

/** Quên mật khẩu (P14b): gửi link đặt lại qua email — chỉ có khi bật đăng nhập email. */
async function ForgotContent({ params }: PageProps<"/[locale]/forgot-password">) {
  const { locale } = (await params) as { locale: StoreLocale };
  setRequestLocale(locale);
  if (!emailAuthEnabled()) notFound();
  const t = await getTranslations({ locale, namespace: "Auth" });
  return (
    <AuthCard title={t("forgotTitle")} intro={t("forgotIntro")}>
      <ForgotPasswordForm prefix={locale === "en" ? "/en" : ""} />
      <Link href="/login" className="inline-flex min-h-11 items-center text-sm text-accent-foreground hover:underline">
        {t("signInLink")}
      </Link>
    </AuthCard>
  );
}
