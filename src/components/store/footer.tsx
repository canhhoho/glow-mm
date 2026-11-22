import { Suspense } from "react";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { BRAND_NAME } from "@/lib/brand";
import { env } from "@/lib/env";
import { INFO_PAGES } from "@/lib/info-pages";
import { ContactLinks } from "./contact-links";

/** Liên hệ đọc env lúc request (image Docker có thể build khi chưa có env) — như ChatFab. */
async function FooterContact({ locale }: { locale: string }) {
  await connection();
  const { FB_PAGE_USERNAME, VIBER_CHAT_URI } = env();
  if (!FB_PAGE_USERNAME && !VIBER_CHAT_URI) return null;
  const t = await getTranslations({ locale, namespace: "Footer" });
  return (
    <section aria-labelledby="footer-contact" className="space-y-2">
      <h2 id="footer-contact" className="font-medium text-foreground">
        {t("contact")}
      </h2>
      <ContactLinks locale={locale} />
    </section>
  );
}

export async function StoreFooter({ locale }: { locale: string }) {
  const [t, tn, ti] = await Promise.all([
    getTranslations({ locale, namespace: "Footer" }),
    getTranslations({ locale, namespace: "Nav" }),
    getTranslations({ locale, namespace: "Info" }),
  ]);
  const link = "inline-flex min-h-11 items-center underline lg:min-h-9 lg:no-underline lg:hover:text-brand-dark";
  return (
    <footer className="mt-4 border-t border-border bg-card text-sm text-muted-foreground">
      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-6 lg:auto-cols-fr lg:grid-flow-col lg:gap-8 lg:py-10">
        <Suspense>
          <FooterContact locale={locale} />
        </Suspense>
        <nav aria-label={t("info")}>
          <h2 className="font-medium text-foreground lg:mb-2">{t("info")}</h2>
          <ul className="grid grid-cols-2 gap-x-4 lg:grid-cols-1">
            {INFO_PAGES.map((slug) => (
              <li key={slug}>
                <Link href={`/info/${slug}`} className={link}>
                  {ti(`${slug}.title`)}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/track" className={link}>
                {tn("orderLookup")}
              </Link>
            </li>
          </ul>
        </nav>
        <p className="lg:text-right">© {BRAND_NAME} · {t("rights")}</p>
      </div>
    </footer>
  );
}
