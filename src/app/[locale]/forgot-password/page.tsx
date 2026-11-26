import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { connection } from "next/server";
import { Link } from "@/i18n/navigation";
import type { StoreLocale } from "@/i18n/routing";
import { localePrefix } from "@/lib/site";
import { emailAuthEnabled } from "@/lib/env";
import { AuthCard } from "@/components/store/auth-card";
import { ForgotPasswordForm, PhoneResetRequestForm } from "@/components/store/auth-forms";
import { PageSkeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function ForgotPasswordPage(props: PageProps<"/[locale]/forgot-password">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ForgotContent {...props} />
    </Suspense>
  );
}

/**
 * Quên mật khẩu: khách nhập SĐT + mật khẩu mới → yêu cầu chờ cửa hàng xác nhận trên web admin (luôn có).
 * Khi bật gửi email (P14b) còn thêm cách gửi link đặt lại qua email.
 */
async function ForgotContent({ params }: PageProps<"/[locale]/forgot-password">) {
  const { locale } = (await params) as { locale: StoreLocale };
  setRequestLocale(locale);
  // Đọc env lúc chạy, không lúc build (Docker build không có secret; EMAIL_DRIVER đổi không cần build lại).
  await connection();
  const emailOn = emailAuthEnabled();
  const t = await getTranslations({ locale, namespace: "Auth" });
  return (
    <AuthCard title={t("forgotTitle")} intro={t("forgotPhoneIntro")}>
      <PhoneResetRequestForm />
      {emailOn && (
        <details className="rounded-lg border border-border p-3">
          <summary className="min-h-11 cursor-pointer content-center text-sm text-accent-foreground">{t("forgotByEmail")}</summary>
          <div className="space-y-3 pt-3">
            <p className="text-sm text-muted-foreground">{t("forgotIntro")}</p>
            <ForgotPasswordForm prefix={localePrefix(locale)} />
          </div>
        </details>
      )}
      <Link href="/login" className="inline-flex min-h-11 items-center text-sm text-accent-foreground hover:underline">
        {t("signInLink")}
      </Link>
    </AuthCard>
  );
}
