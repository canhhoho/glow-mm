import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { BannerForm } from "@/components/admin/banner-form";
import { Page, PageHeader } from "@/components/admin/ui";

export default async function NewBannerPage() {
  await requirePagePermission("content:manage");
  const [t, td] = await Promise.all([getTranslations("Content"), getTranslations("Docs")]);
  return (
    <Page>
      <PageHeader title={t("bannerNew")} back={{ href: "/admin/content/banners", label: td("back") }} />
      <BannerForm />
    </Page>
  );
}
