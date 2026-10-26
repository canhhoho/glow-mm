import { getLocale, getTranslations } from "next-intl/server";
import { setAdminLocaleAction } from "@/server/auth/actions";
import { LoginForm } from "@/components/admin/login-form";
import { LoginScreen } from "@/components/admin/login-screen";

export default async function LoginPage() {
  const [t, tNav, locale] = await Promise.all([getTranslations("Login"), getTranslations("Nav"), getLocale()]);
  return (
    <LoginScreen
      title={t("title")}
      subtitle={t("subtitle")}
      brandSubtitle={tNav("subtitle")}
      languageLabel={tNav("language")}
      locale={locale}
      localeAction={setAdminLocaleAction}
    >
      <LoginForm portal="admin" />
    </LoginScreen>
  );
}
