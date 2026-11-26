import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { NotFoundState } from "@/components/ui/empty-state";
import { outlineButton, primaryButton } from "@/components/store/ui";

export default async function NotFound() {
  const t = await getTranslations("NotFound");
  return (
    <NotFoundState
      title={t("title")}
      hint={t("hint")}
      action={
        <>
          <Link href="/" className={primaryButton}>
            {t("back")}
          </Link>
          <Link href="/search" className={outlineButton}>
            {t("search")}
          </Link>
        </>
      }
    />
  );
}
