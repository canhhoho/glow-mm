import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { can } from "@/server/auth/roles";
import { listLocations, stockOverview } from "@/server/inventory/queries";
import { getNumberSetting } from "@/server/settings";
import { Badge, DataTable, fieldClass, LinkButton, PageHeader, Td } from "@/components/admin/ui";
import { daysUntil, fmtDay, fmtInt } from "@/lib/format";

export default async function InventoryPage({ searchParams }: PageProps<"/admin/inventory">) {
  const user = await requirePagePermission("stock:view");
  const sp = await searchParams;
  const locationId = typeof sp.location === "string" ? sp.location : undefined;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const [t, td, locations, rows, blockDays, warnDays] = await Promise.all([
    getTranslations("Inventory"),
    getTranslations("Docs"),
    listLocations(),
    stockOverview({ locationId, q }),
    getNumberSetting("expiry.blockDays"),
    getNumberSetting("expiry.warnDays"),
  ]);

  const newDoc = (type: string, perm: Parameters<typeof can>[1]) =>
    can(user.role, perm) ? (
      <LinkButton key={type} href={`/admin/inventory/documents/new?type=${type}`}>
        + {td(type)}
      </LinkButton>
    ) : null;

  return (
    <div>
      <PageHeader
        title={t("title")}
        actions={[
          newDoc("RECEIVE", "stock:receive"),
          newDoc("TRANSFER", "stock:transfer"),
          newDoc("ISSUE", "stock:issue"),
          newDoc("ADJUST", "stock:adjust"),
          <LinkButton key="quarantine" href="/admin/inventory/quarantine">
            {t("quarantine")}
          </LinkButton>,
          <LinkButton key="docs" href="/admin/inventory/documents">
            {t("documents")}
          </LinkButton>,
        ]}
      />
      <form className="mb-3 flex flex-wrap gap-2" role="search">
        <input name="q" defaultValue={q} placeholder={t("search")} className={`${fieldClass} max-w-xs`} />
        <select name="location" defaultValue={locationId ?? ""} className={`${fieldClass} max-w-xs`}>
          <option value="">{t("allLocations")}</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.code} — {l.name}
            </option>
          ))}
        </select>
        <button className="h-9 rounded-lg border px-3 text-sm hover:bg-muted">{t("filter")}</button>
      </form>
      <DataTable
        empty={t("empty")}
        head={[t("colSku"), t("colProduct"), t("colLot"), t("colExpiry"), t("colLocation"), t("colType"), t("colQty"), t("colCost")]}
      >
        {rows.map((r) => {
          const left = daysUntil(r.expiryDate);
          const tone = left < 0 ? "danger" : left < blockDays ? "danger" : left < warnDays ? "warning" : null;
          const label = left < 0 ? t("expired") : left < blockDays ? t("blocked") : left < warnDays ? t("nearExpiry") : null;
          return (
            <tr key={r.key}>
              <Td className="font-mono text-xs">{r.sku}</Td>
              <Td>
                {r.name} <span className="text-muted-foreground">({r.variantLabel})</span>
              </Td>
              <Td className="font-mono text-xs">{r.lotNo}</Td>
              <Td className="whitespace-nowrap">
                {fmtDay(r.expiryDate)} {tone && label && <Badge tone={tone}>{label}</Badge>}
              </Td>
              <Td className="font-mono text-xs">{r.location}</Td>
              <Td>
                <Badge tone={r.stockType === "TESTER" ? "brand" : "neutral"}>{t(r.stockType)}</Badge>
              </Td>
              <Td className="text-right tabular-nums">{fmtInt(r.qty)}</Td>
              <Td className="text-right tabular-nums">{fmtInt(r.landedCostMmk)}</Td>
            </tr>
          );
        })}
      </DataTable>
    </div>
  );
}
