import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { BannerForm } from "@/components/admin/banner-form";
import { LinkButton, PageHeader } from "@/components/admin/ui";

export default async function NewBannerPage() {
  await requirePagePermission("content:manage");
  const [t, td] = await Promise.all([getTranslations("Content"), getTranslations("Docs")]);
  return (
    <div>
      <PageHeader title={t("bannerNew")} actions={<LinkButton href="/admin/content/banners">← {td("back")}</LinkButton>} />
      <BannerForm />
    </div>
  );
}
