import { Plus, LockKeyhole, LockKeyholeOpen } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { listWarehouses } from "@/server/inventory/warehouses";
import { createWarehouseAction, setWarehouseActiveAction, updateWarehouseAction } from "@/server/inventory/actions";
import { ActionForm } from "@/components/admin/action-form";
import { ActionButton } from "@/components/admin/action-button";
import { Badge, DataTable, Page, PageHeader, Section, Td, fieldClass, fieldLabelClass } from "@/components/admin/ui";
import { fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";

const MODES = ["VN_IMPORT", "LOCAL_MMK"] as const;

/** Quản lý kho (P24): kho bán (mỗi SP thuộc một kho, mỗi kho một cách tính giá) + khu chờ kiểm tra hàng trả. */
export default async function WarehousesPage({ searchParams }: PageProps<"/admin/settings/warehouses">) {
  await requirePagePermission("settings:manage");
  const showAll = (await searchParams).all === "1";
  const [t, { rows, inactiveCount }] = await Promise.all([getTranslations("Warehouses"), listWarehouses({ includeInactive: showAll })]);

  const kindLabel = (r: (typeof rows)[number]) =>
    r.sellable ? t("kindSell") : r.type === "QUARANTINE" ? t("kindQuarantine") : t(`legacy.${r.type}`);

  return (
    <Page>
      <PageHeader title={(await getTranslations("Nav"))("warehouseManagement")} description={t("description")} />

      <Section title={t("create")}>
        <ActionForm action={createWarehouseAction} submitLabel={t("createSubmit")} okText={t("created")} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" icon={<Plus aria-hidden className="size-4 shrink-0" />}>
          <label className={fieldLabelClass}>
            <span className="text-muted-foreground">{t("kind")}</span>
            <select name="kind" defaultValue="sell" className={fieldClass}>
              <option value="sell">{t("kindSell")}</option>
              <option value="quarantine">{t("kindQuarantine")}</option>
            </select>
          </label>
          <label className={fieldLabelClass}>
            <span className="text-muted-foreground">{t("code")}</span>
            <input name="code" required maxLength={20} pattern="[A-Za-z0-9\-]{2,20}" placeholder="CHI" className={cn(fieldClass, "uppercase")} />
          </label>
          <label className={fieldLabelClass}>
            <span className="text-muted-foreground">{t("name")}</span>
            <input name="name" required maxLength={60} placeholder={t("namePlaceholder")} className={fieldClass} />
          </label>
          <label className={fieldLabelClass}>
            <span className="text-muted-foreground">{t("pricingMode")}</span>
            <select name="pricingMode" defaultValue="VN_IMPORT" className={fieldClass}>
              {MODES.map((m) => (
                <option key={m} value={m}>
                  {t(`mode.${m}`)}
                </option>
              ))}
            </select>
          </label>
        </ActionForm>
        <p className="text-xs text-muted-foreground">{t("createHint")}</p>
      </Section>

      {/* Ô có ô nhập cao 36px → căn giữa dọc cả hàng để mã kho, số liệu, nút thẳng với ô nhập. */}
      <div className="[&_td]:align-middle">
      <DataTable stack empty={t("empty")} head={[t("code"), t("name"), t("kind"), t("products"), t("stock"), t("status"), t("actions")]} numeric={[3, 4]}>
        {rows.map((r) => (
          <tr key={r.id} className={cn(!r.active && "opacity-60")} data-testid={`warehouse-${r.code}`}>
            <Td className="font-mono text-xs">{r.code}</Td>
            <Td>
              <ActionForm action={updateWarehouseAction} submitLabel={t("save")} okText={t("saved")} variant="outline" className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={r.id} />
                <input name="name" required maxLength={60} defaultValue={r.name} aria-label={`${t("name")} ${r.code}`} className={cn(fieldClass, "w-40")} />
                {r.sellable && (
                  // 20/11/2026 (audit): kho đã có SP / hàng → khoá ô (ô khoá không gửi đi → server giữ cách tính giá cũ).
                  <select
                    name="pricingMode"
                    defaultValue={r.pricingMode ?? "VN_IMPORT"}
                    disabled={r.modeLocked}
                    title={r.modeLocked ? t("modeLocked") : undefined}
                    aria-label={`${t("pricingMode")} ${r.code}`}
                    className={cn(fieldClass, "w-auto")}
                  >
                    {MODES.map((m) => (
                      <option key={m} value={m}>
                        {t(`mode.${m}`)}
                      </option>
                    ))}
                  </select>
                )}
              </ActionForm>
            </Td>
            <Td label={t("kind")}>
              <div>{kindLabel(r)}</div>
              {r.sellable && r.pricingMode && <div className="text-xs text-muted-foreground">{t(`modeHint.${r.pricingMode}`)}</div>}
            </Td>
            <Td label={t("products")} className="text-right tabular-nums">{r.sellable ? fmtInt(r.products) : "—"}</Td>
            <Td label={t("stock")} className="text-right tabular-nums">{fmtInt(r.stock)}</Td>
            <Td label={t("status")}>
              <Badge tone={r.active ? "success" : "neutral"}>{r.active ? t("active") : t("inactive")}</Badge>
            </Td>
            <Td label={t("actions")}>
              <ActionButton
                action={setWarehouseActiveAction}
                fields={{ id: r.id, active: r.active ? "0" : "1" }}
                label={r.active ? t("deactivate") : t("activate")}
                variant="outline"
                confirm={r.active ? t("deactivateConfirm", { name: r.name }) : undefined} iconOnly={true} icon={r.active ? <LockKeyhole aria-hidden className="size-4 shrink-0" /> : <LockKeyholeOpen aria-hidden className="size-4 shrink-0" />}
              />
            </Td>
          </tr>
        ))}
      </DataTable>
      </div>
      {inactiveCount > 0 && (
        <Link href={showAll ? "/admin/settings/warehouses" : "/admin/settings/warehouses?all=1"} className="text-sm text-primary underline">
          {showAll ? t("hideInactive") : t("showInactive", { count: inactiveCount })}
        </Link>
      )}
    </Page>
  );
}
