import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";

export default async function DashboardPage({ searchParams }: PageProps<"/admin">) {
  const user = await requirePagePermission("dashboard:view");
  const { denied } = await searchParams;
  const t = await getTranslations("Dashboard");
  const tr = await getTranslations("Role");

  return (
    <div className="space-y-2">
      {denied && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t("denied")}
        </p>
      )}
      <h1 className="text-xl font-medium">{t("welcome", { name: user.name })}</h1>
      <p className="text-sm text-muted-foreground" data-testid="role">
        {t("role", { role: tr(user.role) })}
      </p>
      <p className="text-sm">{t("placeholder")}</p>
    </div>
  );
}
