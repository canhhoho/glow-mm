import { getImageProps } from "next/image";
import { cacheLife, cacheTag } from "next/cache";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { bannersForLocale, type StoreBanner } from "@/server/content/banners";
import { HOME_TAG, isInSchedule } from "@/server/content/common";
import { BannerCarousel } from "./banner-carousel";
import { primaryButton } from "./ui";

/** Khung banner: mobile 3:2, desktop 3:1 — banner CSS, khung chờ và carousel cùng tỉ lệ → không nhảy layout. */
const FRAME = "relative aspect-[3/2] w-full lg:aspect-[3/1]";

/** Banner thuần CSS (không ảnh): dùng khi chưa có banner nào, và làm khung chờ trong static shell (LCP sớm trên 3G). */
export async function HeroBanner({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "Home" });
  return (
    <section
      className={`${FRAME} isolate flex flex-col justify-center overflow-hidden rounded-xl bg-linear-to-r from-accent via-card to-secondary px-5 lg:px-12`}
    >
      <span aria-hidden className="absolute -top-10 -right-10 -z-10 size-48 rounded-full bg-brand/15 lg:size-96" />
      <span aria-hidden className="absolute right-24 -bottom-16 -z-10 size-32 rounded-full bg-brand-2/20 lg:right-72 lg:size-56" />
      <p className="text-sm text-accent-foreground lg:text-base">{t("heroKicker")}</p>
      <h1 className="text-xl font-medium lg:max-w-xl lg:text-4xl lg:leading-tight">{t("heroTitle")}</h1>
      <Link href="/search" className={`${primaryButton} mt-4 self-start`}>
        {t("bannerCta")}
      </Link>
    </section>
  );
}

/** Banner đang bật theo ngôn ngữ — cache theo tag (admin đổi → updateTag), lịch lọc lúc request. */
async function cachedBanners(locale: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag(HOME_TAG);
  return bannersForLocale(locale);
}

function Slide({ banner, first }: { banner: StoreBanner; first: boolean }) {
  const desktopSizes = "(min-width: 1152px) 1120px, 100vw";
  const {
    props: { srcSet: desktop },
  } = getImageProps({ alt: banner.alt, src: banner.desktopUrl, width: 1500, height: 500, sizes: desktopSizes });
  const {
    props: { srcSet: mobile, ...img },
  } = getImageProps({
    alt: banner.alt,
    src: banner.mobileUrl ?? banner.desktopUrl,
    width: 750,
    height: 500,
    sizes: "100vw",
    // Ảnh đầu là phần tử LCP: tải ngay, ưu tiên cao. <picture> chỉ tải một nguồn theo media.
    ...(first ? { loading: "eager" as const, fetchPriority: "high" as const } : {}),
  });
  const picture = (
    <picture>
      <source media="(min-width: 1024px)" srcSet={desktop} sizes={desktopSizes} />
      <source srcSet={mobile} sizes="100vw" />
      {/* props từ getImageProps (art direction desktop/mobile) */}
      <img {...img} alt={banner.alt} className="absolute inset-0 size-full object-cover" />
    </picture>
  );
  const href = banner.href;
  return (
    <li className={`${FRAME} shrink-0 snap-start`} data-testid="banner-slide">
      {!href ? (
        picture
      ) : href.startsWith("/") ? (
        <Link href={href} className="block size-full">
          {picture}
        </Link>
      ) : (
        <a href={href} target="_blank" rel="noreferrer" className="block size-full">
          {picture}
        </a>
      )}
    </li>
  );
}

/** Carousel banner trang chủ; chưa có banner (hoặc ngoài lịch) thì dùng banner CSS. */
export async function HomeBanner({ locale }: { locale: string }) {
  await connection();
  const now = new Date();
  const banners = (await cachedBanners(locale)).filter((b) => isInSchedule(b, now));
  if (banners.length === 0) return <HeroBanner locale={locale} />;

  const t = await getTranslations({ locale, namespace: "Home" });
  return (
    <>
      <h1 className="sr-only">{t("heroTitle")}</h1>
      <BannerCarousel
        count={banners.length}
        labels={{
          region: t("bannerRegion"),
          prev: t("bannerPrev"),
          next: t("bannerNext"),
          goTo: banners.map((_, i) => t("bannerGoTo", { n: i + 1 })),
        }}
      >
        {banners.map((b, i) => (
          <Slide key={b.id} banner={b} first={i === 0} />
        ))}
      </BannerCarousel>
    </>
  );
}
