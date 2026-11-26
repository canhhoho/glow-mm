import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getPathname, Link } from "@/i18n/navigation";
import type { StoreLocale } from "@/i18n/routing";
import { AuthCard } from "@/components/store/auth-card";
import { ResetPasswordForm } from "@/components/store/auth-forms";
import { Notice } from "@/components/store/ui";
import { PageSkeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function ResetPasswordPage(props: PageProps<"/[locale]/reset-password">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ResetContent {...props} />
    </Suspense>
  );
}

/** Đặt mật khẩu mới từ link trong email: Better Auth chuyển về đây kèm `?token=` (hoặc `?error=INVALID_TOKEN`). */
async function ResetContent({ params, searchParams }: PageProps<"/[locale]/reset-password">) {
  const { locale } = (await params) as { locale: StoreLocale };
  setRequestLocale(locale);
  const { token, error } = await searchParams;
  const t = await getTranslations({ locale, namespace: "Auth" });
  const valid = typeof token === "string" && token.length > 0 && !error;
  return (
    <AuthCard title={t("resetTitle")}>
      {valid ? (
        <ResetPasswordForm token={token} loginHref={getPathname({ href: "/login", locale })} />
      ) : (
        <>
          <Notice tone="danger">{t("err.invalidLink")}</Notice>
          <Link href="/forgot-password" className="inline-flex min-h-11 items-center text-sm text-accent-foreground hover:underline">
            {t("forgot")}
          </Link>
        </>
      )}
    </AuthCard>
  );
}
