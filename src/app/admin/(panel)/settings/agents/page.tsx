import Link from "next/link";
import { Ban, KeyRound } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { agentTokenUsers, listAgentTokens } from "@/server/agent/tokens";
import { AGENT_SCOPES, DEFAULT_AGENT_SCOPES, agentConfig, scopeAllowedFor, type AgentScope } from "@/server/agent/config";
import { createAgentTokenAction, revokeAgentTokenAction } from "@/server/agent/actions";
import { ActionForm } from "@/components/admin/action-form";
import { ActionButton } from "@/components/admin/action-button";
import { Badge, DataTable, Page, PageHeader, Section, Td, checkboxClass, fieldClass, fieldLabelClass } from "@/components/admin/ui";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Khoá dịch của scope (next-intl không nhận dấu ":" trong khoá lồng nhau một cách an toàn). */
const scopeKey = (s: AgentScope) => `scope.${s.replace(":", "_")}`;

/**
 * P25 gói A (A1) — Cài đặt › Trợ lý AI: tạo token cho từng agent (token hiện MỘT lần), thu hồi, xem lần dùng cuối.
 * Quyền thực tế = quyền chọn ở đây giao với quyền theo vai trò của tài khoản gắn token (docs/ket-noi-tro-ly-ai.md §5).
 */
export default async function AgentsPage() {
  await requirePagePermission("settings:manage");
  const [t, tr, tokens, users] = await Promise.all([getTranslations("Agents"), getTranslations("Role"), listAgentTokens(), agentTokenUsers()]);
  const legacyEnv = agentConfig() !== null;

  return (
    <Page>
      <PageHeader title={(await getTranslations("Nav"))("aiAgents")} description={t("description")} />
      {legacyEnv && <p role="note" data-testid="agent-legacy-env" className="rounded-md bg-warning-muted px-3 py-2 text-sm text-warning">{t("legacyEnv")}</p>}

      <Section title={t("create")}>
        {/* Token 64 ký tự liền → cho xuống dòng, không đẩy form tràn ngang trên điện thoại. */}
        <div className="min-w-0 [&_[role=status]]:min-w-0 [&_[role=status]]:font-mono [&_[role=status]]:break-all">
        <ActionForm action={createAgentTokenAction} submitLabel={t("createSubmit")} className="grid gap-3 md:grid-cols-2" icon={<KeyRound aria-hidden className="size-4 shrink-0" />}>
          <label className={fieldLabelClass}>
            <span>{t("name")}</span>
            <input name="name" required minLength={2} maxLength={60} placeholder={t("namePlaceholder")} className={fieldClass} />
          </label>
          <label className={fieldLabelClass}>
            <span>{t("user")}</span>
            <select name="userId" required defaultValue="" className={fieldClass}>
              <option value="" disabled>{t("userPick")}</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} · {tr(u.role)}{u.active ? "" : ` · ${t("locked")}`}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="col-span-full space-y-2">
            <legend className="text-sm text-muted-foreground">{t("scopes")}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {AGENT_SCOPES.map((s) => (
                <label key={s} className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="scopes" value={s} defaultChecked={DEFAULT_AGENT_SCOPES.includes(s)} className={cn(checkboxClass, "mt-0.5")} />
                  <span>
                    <span className="font-medium">{t(`${scopeKey(s)}.label`)}</span> <code className="text-xs text-muted-foreground">{s}</code>
                    <span className="block text-xs text-muted-foreground">{t(`${scopeKey(s)}.hint`)}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{t("scopesHint")}</p>
          </fieldset>
        </ActionForm>
        </div>
        <p className="text-xs text-muted-foreground">{t("createHint")}</p>
      </Section>

      <div className="[&_td]:align-middle">
        <DataTable stack empty={t("empty")} head={[t("name"), t("user"), t("scopes"), t("lastUsed"), t("status"), t("actions")]}>
          {tokens.map((k) => (
            <tr key={k.id} data-testid="agent-token-row" className={cn(!k.active && "opacity-60")}>
              <Td>
                <div className="font-medium break-words">{k.name}</div>
                <div className="font-mono text-xs text-muted-foreground">{k.tokenPrefix}…</div>
                <div className="text-xs text-muted-foreground">{t("createdAt")}: {fmtDateTime(k.createdAt)}</div>
              </Td>
              <Td label={t("user")}>
                <Link href={`/admin/settings/audit?user=${k.user.id}`} className="text-primary underline">{k.user.name}</Link>
                <div className="text-xs text-muted-foreground">{tr(k.user.role)}</div>
              </Td>
              <Td label={t("scopes")}>
                <div className="flex flex-wrap gap-1">
                  {k.scopes.map((s) => {
                    const known = (AGENT_SCOPES as readonly string[]).includes(s);
                    // Scope vai trò hiện tại không còn được giữ → vẫn lưu nhưng không có hiệu lực (A4).
                    const ok = known && scopeAllowedFor(s as AgentScope, k.user.role);
                    return <span key={s} title={ok ? undefined : t("scopeInactive")}><Badge tone={ok ? "neutral" : "warning"}>{s}</Badge></span>;
                  })}
                </div>
              </Td>
              <Td label={t("lastUsed")} className="text-xs whitespace-nowrap">{k.lastUsedAt ? fmtDateTime(k.lastUsedAt) : t("never")}</Td>
              <Td label={t("status")}>
                <Badge tone={k.active ? "success" : "neutral"}>{k.active ? t("active") : t("revoked")}</Badge>
                {k.revokedAt && <div className="text-xs text-muted-foreground">{fmtDateTime(k.revokedAt)}</div>}
              </Td>
              <Td label={t("actions")}>
                {k.active && (
                  <ActionButton
                    action={revokeAgentTokenAction}
                    fields={{ id: k.id }}
                    label={t("revoke")}
                    variant="destructive"
                    icon={<Ban aria-hidden className="size-4 shrink-0" />}
                    iconOnly={false}
                    confirm={t("revokeConfirm", { name: k.name })}
                  />
                )}
              </Td>
            </tr>
          ))}
        </DataTable>
      </div>
    </Page>
  );
}
