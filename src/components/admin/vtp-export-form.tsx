"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { checkboxClass, DataTable, fieldClass, fieldLabelClass, Notice, Td } from "@/components/admin/ui";
import { fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { VtpAddress, VtpPreview } from "@/server/orders/vtp-data";

export function VtpExportForm({ orders, addresses, services, pickupTimes }: { orders: VtpPreview[]; addresses: VtpAddress[]; services: string[]; pickupTimes: string[] }) {
  const t = useTranslations("VtpExport");
  const [selected, setSelected] = useState(new Set(orders.map((o) => o.id)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form className="space-y-4" onSubmit={async (event) => {
      event.preventDefault();
      const fd = new FormData(event.currentTarget);
      setBusy(true); setError("");
      try {
        const response = await fetch("/api/admin/orders/vtp-export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          service: fd.get("service"), chargePayer: fd.get("chargePayer"), pickupTime: fd.get("pickupTime"),
          orders: orders.filter((o) => selected.has(o.id)).map((o) => ({ id: o.id, weightGrams: Number(fd.get(`weight:${o.id}`)), addressKey: fd.get(`address:${o.id}`), recipientName: fd.get(`name:${o.id}`), note: fd.get(`note:${o.id}`) ?? "" })),
        }) });
        if (!response.ok) throw new Error((await response.json()).error || t("failed"));
        const url = URL.createObjectURL(await response.blob());
        const a = document.createElement("a"); a.href = url;
        a.download = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? "VTP-orders.xlsx";
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (e) { setError(e instanceof Error ? e.message : t("failed")); }
      finally { setBusy(false); }
    }}>
      <div className="grid gap-4 rounded-xl border bg-card p-4 md:grid-cols-3">
        <label className={fieldLabelClass}><span className="text-muted-foreground">{t("service")}</span><select name="service" required className={fieldClass} defaultValue=""><option value="" disabled>{t("chooseService")}</option>{services.map((s) => <option key={s}>{s}</option>)}</select></label>
        <label className={fieldLabelClass}><span className="text-muted-foreground">{t("chargePayer")}</span><select name="chargePayer" className={fieldClass} defaultValue="Order"><option value="Order">{t("payerFromOrder")}</option><option value="Receiver">{t("receiverPays")}</option><option value="Sender">{t("senderPays")}</option></select></label>
        <label className={fieldLabelClass}><span className="text-muted-foreground">{t("pickup")}</span><select name="pickupTime" className={fieldClass} defaultValue=""><option value="">{t("noPickup")}</option>{pickupTimes.map((p) => <option key={p}>{p}</option>)}</select></label>
      </div>
      <p className="text-sm text-muted-foreground">{t("reviewHint")}</p>
      <DataTable
        tableClassName="min-w-[1050px]"
        numeric={[4]}
        head={[
          <input key="all" aria-label={t("selectAll")} type="checkbox" className={checkboxClass} checked={selected.size === orders.length} onChange={(e) => setSelected(e.target.checked ? new Set(orders.map((o) => o.id)) : new Set())} />,
          ...["order", "destination", "weight", "cod", "note"].map((key) => t(key)),
        ]}
      >
          {orders.map((order) => {
            const enabled = selected.has(order.id);
            return <tr key={order.id}>
              <Td><input aria-label={`${t("select")} ${order.code}`} type="checkbox" className={checkboxClass} checked={enabled} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(order.id)) next.delete(order.id); else next.add(order.id); return next; })} /></Td>
              <Td className="w-60"><div className="space-y-1"><Link className="font-mono text-primary underline" href={`/admin/orders/${order.id}`}>{order.code}</Link><input name={`name:${order.id}`} aria-label={`${t("recipient")} ${order.code}`} defaultValue={order.recipientName} required={enabled} disabled={!enabled || busy} className={fieldClass} /><p className="font-mono text-xs">{order.phone}</p><p className="max-w-60 text-xs text-muted-foreground">{order.goods}</p></div></Td>
              <Td className="max-w-sm"><div className="space-y-2"><p>{order.addressText}</p>{order.address ? <><p className="text-xs text-muted-foreground">{order.address.label}</p><input type="hidden" name={`address:${order.id}`} value={order.address.key} /></> : <><p className="text-xs text-warning">{t("addressMissing")} {order.zoneName}</p><select className={fieldClass} name={`address:${order.id}`} required={enabled} disabled={!enabled || busy} defaultValue=""><option value="" disabled>{t("chooseAddress")}</option>{addresses.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}</select></>}</div></Td>
              <Td className="w-40"><input className={fieldClass} name={`weight:${order.id}`} aria-label={`${t("weight")} ${order.code}`} type="number" min={1} max={2147483647} step={1} defaultValue={order.weightGrams ?? ""} required={enabled} disabled={!enabled || busy} />{order.missingWeights.length > 0 && <p className="mt-1 text-xs text-warning">{t("weightMissing")}: {order.missingWeights.join(", ")}</p>}</Td>
              <Td numeric className="whitespace-nowrap">{fmtInt(order.codMmk)}<p className="text-xs text-muted-foreground">{order.chargePayer === "Sender" ? t("senderPays") : t("receiverPays")}</p></Td>
              <Td className="w-64"><textarea className={cn(fieldClass, "h-auto py-2")} rows={3} name={`note:${order.id}`} aria-label={`${t("note")} ${order.code}`} defaultValue={order.note} maxLength={150} disabled={!enabled || busy} /><p className="text-xs text-muted-foreground">{t("noteLimit")}</p></Td>
            </tr>;
          })}
      </DataTable>
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex flex-wrap items-center gap-3"><Button type="submit" size="lg" disabled={busy || selected.size === 0}><Download aria-hidden />{busy ? t("exporting") : t("download", { count: selected.size })}</Button><span className="text-xs text-muted-foreground">{t("noTransition")}</span></div>
    </form>
  );
}
