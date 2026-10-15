import { Suspense } from "react";
import { connection } from "next/server";
import { MessageCircle } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { env } from "@/lib/env";

/**
 * Nút chat nổi (Viber / Messenger) trên mọi trang storefront. Server component, không JS:
 * <details> mở danh sách kênh. Không cấu hình env nào thì không hiện.
 * Đọc env lúc request (không đóng băng lúc build — image Docker có thể build khi chưa có env).
 */
export function ChatFab({ locale }: { locale: string }) {
  return (
    <Suspense>
      <ChatFabInner locale={locale} />
    </Suspense>
  );
}

async function ChatFabInner({ locale }: { locale: string }) {
  await connection();
  const { FB_PAGE_USERNAME, VIBER_CHAT_URI } = env();
  if (!FB_PAGE_USERNAME && !VIBER_CHAT_URI) return null;
  const [t, tp] = await Promise.all([
    getTranslations({ locale, namespace: "Chat" }),
    getTranslations({ locale, namespace: "Product" }),
  ]);
  const link = "flex min-h-11 items-center rounded-full bg-card px-4 text-sm shadow-md ring-1 ring-border";
  return (
    <details className="fixed right-4 bottom-4 z-20 flex flex-col items-end" data-testid="chat-fab">
      <summary
        aria-label={t("label")}
        className="grid size-12 cursor-pointer list-none place-items-center rounded-full bg-brand text-brand-foreground shadow-lg [&::-webkit-details-marker]:hidden"
      >
        <MessageCircle className="size-6" aria-hidden />
      </summary>
      <div className="absolute right-0 bottom-14 flex flex-col items-end gap-2">
        {VIBER_CHAT_URI && (
          <a href={VIBER_CHAT_URI} className={link}>
            {tp("askViber")}
          </a>
        )}
        {FB_PAGE_USERNAME && (
          <a href={`https://m.me/${encodeURIComponent(FB_PAGE_USERNAME)}`} target="_blank" rel="noreferrer" className={link}>
            {tp("askMessenger")}
          </a>
        )}
      </div>
    </details>
  );
}
