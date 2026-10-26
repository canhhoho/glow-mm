import { getLocale, getTranslations } from "next-intl/server";
import { ADMIN_LOCALES } from "@/i18n/routing";
import { ctvSignOutAction, setCtvLocaleAction } from "@/server/auth/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Nút chọn ngôn ngữ cổng CTV (header desktop + trang Tài khoản). */
export async function CtvLocaleSwitch({ className }: { className?: string }) {
  const [tNav, locale] = await Promise.all([getTranslations("Nav"), getLocale()]);
  return (
    <form action={setCtvLocaleAction} className={cn("flex gap-0.5", className)} aria-label={tNav("language")}>
      {ADMIN_LOCALES.map((l) => (
        <Button key={l} type="submit" name="locale" value={l} size="sm" variant={l === locale ? "secondary" : "ghost"}>
          {l.toUpperCase()}
        </Button>
      ))}
    </form>
  );
}

export async function CtvSignOut({ className, buttonClassName }: { className?: string; buttonClassName?: string }) {
  const t = await getTranslations("Ctv");
  return (
    <form action={ctvSignOutAction} className={className}>
      <Button type="submit" size="sm" variant="outline" className={buttonClassName}>
        {t("logout")}
      </Button>
    </form>
  );
}
