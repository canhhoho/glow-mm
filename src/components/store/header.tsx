import { Search, ShoppingBag } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing, type StoreLocale } from "@/i18n/routing";

export async function StoreHeader({ locale }: { locale: StoreLocale }) {
  const t = await getTranslations("Nav");
  const other = routing.locales.find((l) => l !== locale) ?? routing.defaultLocale;

  return (
    <header className="sticky top-0 z-10 flex h-12 items-center justify-between bg-brand px-4 text-brand-foreground">
      <Link href="/" className="text-base font-medium">
        Glow VN
      </Link>
      <nav className="flex items-center gap-1">
        <Link
          href="/"
          locale={other}
          className="rounded px-2 py-1 text-xs uppercase ring-1 ring-white/50"
          aria-label={t("language")}
        >
          {other === "my" ? "မြန်မာ" : "EN"}
        </Link>
        <Link href="/search" aria-label={t("search")} className="grid size-11 place-items-center">
          <Search className="size-5" aria-hidden />
        </Link>
        <Link href="/cart" aria-label={t("cart")} className="grid size-11 place-items-center">
          <ShoppingBag className="size-5" aria-hidden />
        </Link>
      </nav>
    </header>
  );
}
