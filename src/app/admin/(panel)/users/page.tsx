import { getTranslations } from "next-intl/server";
import { fmtDateTime } from "@/lib/format";
import { requirePagePermission } from "@/server/auth/session";
import { isRole, ROLES } from "@/server/auth/roles";
import { listStaff } from "@/server/users/users";
import { deleteStaffAction, setStaffActiveAction } from "@/server/users/actions";
import { AccountRowActions } from "@/components/admin/account-row-actions";
import { Badge, DataTable, fieldClass, FilterBar, FilterButton, LinkButton, Notice, Page, PageHeader, SearchInput, Td } from "@/components/admin/ui";
import { AccountTabs } from "@/components/admin/section-tabs";

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
    <Page>
      <PageHeader
        title={(await getTranslations("Nav"))("accounts")}
        actions={
          <LinkButton href="/admin/users/new" variant="primary" icon="new" iconOnly={false}>
            {t("new")}
          </LinkButton>
        }
      />
      <AccountTabs active="staff" />
      {sp.saved && <Notice tone="success">{t("created")}</Notice>}
      <FilterBar>
        <SearchInput label={t("search")} defaultValue={q} />
        <select name="role" defaultValue={role ?? ""} aria-label={t("role")} className={fieldClass}>
          <option value="">
            {t("role")}: {t("all")}
          </option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {tr(r)}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={status} aria-label={t("status")} className={fieldClass}>
          <option value="">
            {t("status")}: {t("all")}
          </option>
          <option value="active">{t("active")}</option>
          <option value="locked">{t("locked")}</option>
        </select>
        <FilterButton>{(await getTranslations("Common"))("filter")}</FilterButton>
      </FilterBar>
      <DataTable stack middle empty={t("empty")} head={[t("name"), t("email"), t("role"), t("status"), t("createdAt"), (await getTranslations("Customers"))("actions")]}>
        {users.map((u) => (
          <tr key={u.id} data-testid="user-row">
            <Td>
              {u.name}
              {u.id === me.id && <span className="ml-1 text-xs text-muted-foreground">({t("you")})</span>}
            </Td>
            <Td label={t("email")} className="font-mono text-xs">{u.email}</Td>
            <Td label={t("role")}>
              <Badge tone={u.role === "ADMIN" ? "brand" : "neutral"}>{tr(u.role)}</Badge>
            </Td>
            <Td label={t("status")}>
              <Badge tone={u.active ? "success" : "danger"}>{u.active ? t("active") : t("locked")}</Badge>
            </Td>
            <Td label={t("createdAt")} className="text-xs whitespace-nowrap">{fmtDateTime(u.createdAt)}</Td>
            <Td className="md:w-px md:whitespace-nowrap">
              {/* Dòng của chính mình chỉ có Sửa: không tự khoá / tự xoá. */}
              <AccountRowActions
                editHref={`/admin/users/${u.id}`}
                editLabel={t("edit")}
                lock={
                  u.id === me.id
                    ? undefined
                    : {
                        action: setStaffActiveAction,
                        fields: { id: u.id, active: String(!u.active) },
                        active: u.active,
                        lockLabel: t("lock"),
                        unlockLabel: t("unlock"),
                        confirm: t("lockConfirm", { name: u.name }),
                      }
                }
                remove={u.id === me.id ? undefined : { action: deleteStaffAction, fields: { id: u.id }, label: t("delete"), confirm: t("deleteConfirm", { name: u.name }) }}
              />
            </Td>
          </tr>
        ))}
      </DataTable>
    </Page>
  );
}
