import { getLocale, getTranslations } from "next-intl/server";
import { ADMIN_LOCALES } from "@/i18n/routing";
import { setAdminLocaleAction } from "@/server/auth/actions";
import { LoginForm } from "@/components/admin/login-form";
import { Button } from "@/components/ui/button";

export default async function LoginPage() {
  const [t, tNav, locale] = await Promise.all([getTranslations("Login"), getTranslations("Nav"), getLocale()]);
  return (
    // Dùng tông storefront (nền kem, viền hồng) để trang đăng nhập có nhận diện thương hiệu.
    <div data-theme="store" className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-background px-4">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 -right-24 size-80 rounded-full bg-brand/15 blur-3xl" />
        <div className="absolute -bottom-32 -left-24 size-80 rounded-full bg-brand-2/20 blur-3xl" />
      </div>

      <form action={setAdminLocaleAction} className="flex justify-end gap-1 pt-4" aria-label={tNav("language")}>
        {ADMIN_LOCALES.map((l) => (
          <Button key={l} type="submit" name="locale" value={l} size="sm" variant={l === locale ? "secondary" : "ghost"}>
            {l.toUpperCase()}
          </Button>
        ))}
      </form>

      <main className="flex flex-1 flex-col items-center justify-center py-8">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="grid size-12 place-items-center rounded-2xl bg-brand text-xl font-bold text-brand-foreground shadow-md shadow-brand/30">
            G
          </div>
          <div className="text-xl font-semibold">Glow VN</div>
          <div className="text-sm text-muted-foreground">{tNav("subtitle")}</div>
        </div>

        <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-xl shadow-brand/10">
          <h1 className="text-lg font-semibold">{t("title")}</h1>
          <p className="mt-1 mb-6 text-sm text-muted-foreground">{t("subtitle")}</p>
          <LoginForm />
        </div>
      </main>

      <p className="pb-4 text-center text-xs text-muted-foreground">© Glow VN</p>
    </div>
  );
}
