import { getLocale, getTranslations } from "next-intl/server";
import { setAdminLocaleAction } from "@/server/auth/actions";
import { LoginScreen } from "@/components/admin/login-screen";

export default async function LoginPage() {
  const [t, tNav, locale] = await Promise.all([getTranslations("Login"), getTranslations("Nav"), getLocale()]);
  return (
    <LoginScreen
      portal="admin"
      title={t("title")}
      subtitle={t("subtitle")}
      brandSubtitle={tNav("subtitle")}
      languageLabel={tNav("language")}
      locale={locale}
      localeAction={setAdminLocaleAction}
    />
  );
}
