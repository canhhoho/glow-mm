import { getTranslations } from "next-intl/server";
import { LinkButton } from "@/components/admin/ui";
import { NotFoundState } from "@/components/ui/empty-state";

/** 404 trong khung cổng CTV (giữ header, thanh mục, ngôn ngữ CTV). */
export default async function CtvNotFound() {
  const [t, tc] = await Promise.all([getTranslations("Common"), getTranslations("Ctv")]);
  return (
    <NotFoundState
      title={t("notFoundTitle")}
      hint={t("notFoundHint")}
      action={
        <LinkButton href="/ctv" icon="back">
          {tc("nav.home")}
        </LinkButton>
      }
    />
  );
}
