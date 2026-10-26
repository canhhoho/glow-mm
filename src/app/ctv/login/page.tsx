import { getLocale, getTranslations } from "next-intl/server";
import { setCtvLocaleAction } from "@/server/auth/actions";
import { LoginScreen } from "@/components/admin/login-screen";

export default async function CtvLoginPage() {
  const [t, tNav, locale] = await Promise.all([getTranslations("Ctv"), getTranslations("Nav"), getLocale()]);
  return (
    <LoginScreen
      portal="ctv"
      title={t("loginTitle")}
      subtitle={t("loginSubtitle")}
      brandSubtitle={t("portal")}
      languageLabel={tNav("language")}
      locale={locale}
      localeAction={setCtvLocaleAction}
    />
  );
}
