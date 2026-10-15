import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function NotFound() {
  const t = await getTranslations("NotFound");
  return (
    <div className="py-16 text-center">
      <h1 className="mb-4 text-lg font-medium">{t("title")}</h1>
      <Link href="/" className="text-brand underline">
        {t("back")}
      </Link>
    </div>
  );
}
