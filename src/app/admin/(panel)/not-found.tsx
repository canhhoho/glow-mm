import { getTranslations } from "next-intl/server";
import { LinkButton } from "@/components/admin/ui";

/** 404 trong khung admin (giữ menu + ngôn ngữ admin) thay cho trang trắng tiếng Anh mặc định của Next. */
export default async function AdminNotFound() {
  const t = await getTranslations("Common");
  return (
    <div className="py-16 text-center">
      <p className="text-4xl font-semibold text-muted-foreground tabular-nums">404</p>
      <h1 className="mt-2 text-lg font-medium">{t("notFoundTitle")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("notFoundHint")}</p>
      <div className="mt-6">
        <LinkButton href="/admin">← {t("backToDashboard")}</LinkButton>
      </div>
    </div>
  );
}
