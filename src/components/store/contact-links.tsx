import { getTranslations } from "next-intl/server";
import { env } from "@/lib/env";
import { outlineButton } from "./ui";

/** Nút hỏi qua Viber / Messenger (link lấy từ env; không cấu hình thì ẩn). */
export async function ContactLinks({ locale }: { locale: string }) {
  const { FB_PAGE_USERNAME, VIBER_CHAT_URI } = env();
  if (!FB_PAGE_USERNAME && !VIBER_CHAT_URI) return null;
  const t = await getTranslations({ locale, namespace: "Product" });
  return (
    <div className="flex flex-wrap gap-2">
      {VIBER_CHAT_URI && (
        <a href={VIBER_CHAT_URI} className={outlineButton}>
          {t("askViber")}
        </a>
      )}
      {FB_PAGE_USERNAME && (
        <a href={`https://m.me/${encodeURIComponent(FB_PAGE_USERNAME)}`} target="_blank" rel="noreferrer" className={outlineButton}>
          {t("askMessenger")}
        </a>
      )}
    </div>
  );
}
