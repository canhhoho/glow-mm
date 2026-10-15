import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export async function StoreFooter() {
  const t = await getTranslations("Footer");
  const tn = await getTranslations("Nav");
  return (
    <footer className="space-y-2 border-t border-border px-4 py-6 text-sm text-muted-foreground">
      <Link href="/track" className="inline-flex min-h-11 items-center underline">
        {tn("orderLookup")}
      </Link>
      <p>© Glow VN · {t("rights")}</p>
    </footer>
  );
}
