import { getTranslations } from "next-intl/server";

export async function StoreFooter() {
  const t = await getTranslations("Footer");
  return (
    <footer className="border-t border-border px-4 py-6 text-sm text-muted-foreground">
      © Glow VN · {t("rights")}
    </footer>
  );
}
