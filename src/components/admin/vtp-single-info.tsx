"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fieldClass, fieldLabelClass } from "@/components/admin/ui";
import type { VtpPreview } from "@/server/orders/vtp-data";

export function VtpSingleInfo({ order }: { order: VtpPreview }) {
  const t = useTranslations("VtpExport");
  const [status, setStatus] = useState("");
  const fields = [
    ["order", order.code], ["phone", order.phone], ["phone2", order.phone2], ["recipient", order.recipientName],
    ["address", order.addressText], ["state", order.address?.state ?? ""], ["district", order.address?.district ?? ""], ["township", order.address?.township ?? ""],
    ["goods", order.goods], ["weight", order.weightGrams?.toString() ?? ""], ["value", order.valueMmk.toString()], ["cod", order.codMmk.toString()], ["note", order.note],
    ["chargePayer", order.chargePayer === "Sender" ? t("senderPays") : t("receiverPays")],
  ];
  const text = fields.map(([key, value]) => `${t(key)}: ${value}`).join("\n");
  const copy = async (value: string) => { try { await navigator.clipboard.writeText(value); setStatus(t("copied")); } catch { setStatus(t("copyFallback")); } };
  return <details className="rounded-xl border bg-card p-4" data-testid="vtp-single-info">
    <summary className="cursor-pointer font-medium">{t("singleTitle")}</summary>
    <div className="mt-3 space-y-3">
      <p className="text-sm text-muted-foreground">{t("singleHint")}</p>
      {!order.address && <p className="text-sm text-warning">{t("addressMissing")} {order.zoneName}</p>}
      {order.weightGrams === null && <p className="text-sm text-warning">{t("weightMissing")}: {order.missingWeights.join(", ")}</p>}
      <div className="flex flex-wrap gap-2"><Button type="button" size="lg" variant="outline" onClick={() => copy(text)}><Copy aria-hidden />{t("copyAll")}</Button><Button type="button" size="lg" variant="outline" onClick={() => { const url = URL.createObjectURL(new Blob(["\uFEFF" + text], { type: "text/plain;charset=utf-8" })); const a = document.createElement("a"); a.href = url; a.download = `${order.code}-VTP.txt`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}><Download aria-hidden />{t("downloadInfo")}</Button></div>
      <div className="grid gap-3 lg:grid-cols-2">{fields.map(([key, value]) => <label key={key} className={fieldLabelClass}><span className="text-muted-foreground">{t(key)}</span><div className="flex gap-2"><input className={fieldClass} readOnly value={value} placeholder="—" aria-label={t(key)} /><Button type="button" size="lg" variant="outline" disabled={!value} aria-label={`${t("copy")} ${t(key)}`} onClick={() => copy(value)}>{t("copy")}</Button></div></label>)}</div>
      <p role="status" className="text-xs text-muted-foreground">{status}</p>
    </div>
  </details>;
}
