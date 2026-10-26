import { getLocale, getTranslations } from "next-intl/server";
import { setCtvLocaleAction } from "@/server/auth/actions";
import { LoginForm } from "@/components/admin/login-form";
import { LoginScreen } from "@/components/admin/login-screen";

export default async function CtvLoginPage() {
  const [t, tNav, locale] = await Promise.all([getTranslations("Ctv"), getTranslations("Nav"), getLocale()]);
  return (
    <LoginScreen
      title={t("loginTitle")}
      subtitle={t("loginSubtitle")}
      brandSubtitle={t("portal")}
      languageLabel={tNav("language")}
      locale={locale}
      localeAction={setCtvLocaleAction}
    >
      <LoginForm portal="ctv" />
    </LoginScreen>
  );
}
