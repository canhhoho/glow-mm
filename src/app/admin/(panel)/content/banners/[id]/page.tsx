import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { utcToYangonLocal } from "@/lib/time";
import { requirePagePermission } from "@/server/auth/session";
import { getBannerAdmin } from "@/server/content/banners";
import { BannerForm } from "@/components/admin/banner-form";
import { Page, PageHeader } from "@/components/admin/ui";

export default async function EditBannerPage({ params }: PageProps<"/admin/content/banners/[id]">) {
  await requirePagePermission("content:manage");
  const { id } = await params;
  const [t, td, banner] = await Promise.all([getTranslations("Content"), getTranslations("Docs"), getBannerAdmin(id)]);
  if (!banner) notFound();
  return (
    <Page width="narrow">
      <PageHeader title={t("bannerEdit")} back={{ href: "/admin/content/banners", label: td("back") }} />
      <BannerForm
        key={banner.updatedAt.toISOString()}
        banner={{
          id: banner.id,
          alt: banner.alt,
          locale: banner.locale,
          href: banner.href,
          active: banner.active,
          startAt: banner.startAt ? utcToYangonLocal(banner.startAt) : "",
          endAt: banner.endAt ? utcToYangonLocal(banner.endAt) : "",
          desktopUrl: banner.desktopFile.url,
          mobileUrl: banner.mobileFile?.url ?? null,
        }}
      />
    </Page>
  );
}
