import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { fmtDateTime } from "@/lib/format";
import { requirePagePermission } from "@/server/auth/session";
import { isRole, ROLES } from "@/server/auth/roles";
import { listStaff } from "@/server/users/users";
import { Badge, DataTable, fieldClass, LinkButton, PageHeader, Td } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim() : "");

export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  const me = await requirePagePermission("users:manage");
  const sp = await searchParams;
  const q = str(sp.q);
  const rawRole = str(sp.role);
  const role = isRole(rawRole) ? rawRole : undefined;
  const status = str(sp.status);
  const active = status === "active" ? true : status === "locked" ? false : undefined;
  const [t, tr, users] = await Promise.all([
    getTranslations("Users"),
    getTranslations("Role"),
    listStaff({ q: q || undefined, role, active }),
  ]);

  return (
    <div className="max-w-5xl space-y-4">
      <PageHeader
        title={t("title")}
        actions={
          <LinkButton href="/admin/users/new" variant="primary">
            {t("new")}
          </LinkButton>
        }
      />
      {sp.saved && <p className="text-sm text-emerald-700 dark:text-emerald-400">{t("created")}</p>}
      <form className="flex flex-wrap items-end gap-2" role="search">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">{t("search")}</span>
          <input name="q" defaultValue={q} className={fieldClass} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">{t("role")}</span>
          <select name="role" defaultValue={role ?? ""} className={fieldClass}>
            <option value="">{t("all")}</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {tr(r)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">{t("status")}</span>
          <select name="status" defaultValue={status} className={fieldClass}>
            <option value="">{t("all")}</option>
            <option value="active">{t("active")}</option>
            <option value="locked">{t("locked")}</option>
          </select>
        </label>
        <Button type="submit" variant="outline">
          {t("filter")}
        </Button>
      </form>
      <DataTable empty={t("empty")} head={[t("name"), t("email"), t("role"), t("status"), t("createdAt"), ""]}>
        {users.map((u) => (
          <tr key={u.id} data-testid="user-row">
            <Td>
              {u.name}
              {u.id === me.id && <span className="ml-1 text-xs text-muted-foreground">({t("you")})</span>}
            </Td>
            <Td className="font-mono text-xs">{u.email}</Td>
            <Td>
              <Badge tone={u.role === "ADMIN" ? "brand" : "neutral"}>{tr(u.role)}</Badge>
            </Td>
            <Td>
              <Badge tone={u.active ? "success" : "danger"}>{u.active ? t("active") : t("locked")}</Badge>
            </Td>
            <Td className="text-xs whitespace-nowrap">{fmtDateTime(u.createdAt)}</Td>
            <Td>
              <Link href={`/admin/users/${u.id}`} className="text-sm text-primary underline">
                {t("edit")}
              </Link>
            </Td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
}
