import { getTranslations } from "next-intl/server";
import { LinkButton } from "@/components/admin/ui";
import { NotFoundState } from "@/components/ui/empty-state";

/** 404 trong khung admin (giữ menu + ngôn ngữ admin) thay cho trang trắng tiếng Anh mặc định của Next. */
export default async function AdminNotFound() {
  const t = await getTranslations("Common");
  return (
    <NotFoundState
      title={t("notFoundTitle")}
      hint={t("notFoundHint")}
      action={
        <LinkButton href="/admin" icon="back">
          {t("backToDashboard")}
        </LinkButton>
      }
    />
  );
}
