import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { setCtvLocaleAction } from "@/server/auth/actions";
import { MIN_STAFF_PASSWORD } from "@/server/auth/roles";
import { inviterByCode } from "@/server/affiliates/applications";
import { LoginScreen } from "@/components/admin/login-screen";
import { JoinForm } from "@/components/ctv/join-form";

/** Đăng ký làm CTV qua link mời `/ctv/join?inv=CODE` (P11b) — trang công khai, admin duyệt mới hoạt động. */
export default async function CtvJoinPage({ searchParams }: PageProps<"/ctv/join">) {
  const { inv } = await searchParams;
  const [t, tNav, locale, inviter] = await Promise.all([
    getTranslations("Ctv"),
    getTranslations("Nav"),
    getLocale(),
    inviterByCode(typeof inv === "string" ? inv : ""),
  ]);

  return (
    <LoginScreen
      title={t("join.title")}
      subtitle={inviter ? t("join.invitedBy", { name: inviter.user.name, code: inviter.code }) : t("join.subtitle")}
      brandSubtitle={t("portal")}
      languageLabel={tNav("language")}
      locale={locale}
      localeAction={setCtvLocaleAction}
    >
      {inviter ? (
        <JoinForm invite={inviter.code} minPassword={MIN_STAFF_PASSWORD} />
      ) : (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="join-invalid">
          {t("join.invalidLink")}
        </p>
      )}
      <p className="mt-4 text-center text-sm text-muted-foreground">
        {t("join.haveAccount")}{" "}
        <Link href="/ctv/login" className="text-primary underline">
          {t("join.login")}
        </Link>
      </p>
    </LoginScreen>
  );
}
