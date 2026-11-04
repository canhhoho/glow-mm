"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { openingImportAction } from "@/server/catalog/actions";
import { Button } from "@/components/ui/button";
import { FileField } from "@/components/admin/file-field";
import { fieldClass } from "@/components/admin/ui";
import { fmtInt } from "@/lib/format";

export function OpeningImport({ locations, defaultLocation }: { locations: { code: string; name: string; sellable: boolean }[]; defaultLocation?: string }) {
  const t = useTranslations("Opening");
  const ti = useTranslations("Inventory");
  const [state, action, pending] = useActionState(openingImportAction, undefined);
  const preview = state?.preview;
  return <section className="space-y-4 rounded-xl border p-4 sm:p-6">
    <div><h2 className="text-lg font-semibold">{t("title")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("help")}</p></div>
    <ol className="grid gap-2 text-sm sm:grid-cols-4">
      {["setup", "prepare", "review", "launch"].map((step, i) => <li key={step} className="rounded-lg bg-muted p-3"><span className="font-medium">{i + 1}. {t(step)}</span></li>)}
    </ol>
    <div className="flex flex-wrap gap-4 text-sm text-primary underline">
      <Link href="/admin/settings">{t("setupLink")}</Link>
      <Link href="/admin/categories">{t("categories")}</Link>
      <Link href="/admin/pricing">{t("rates")}</Link>
      <a href="/api/templates/opening.xlsx">{t("template")}</a>
    </div>
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="step" value="preview" />
      <label className="grid gap-1 text-sm"><span>{t("warehouse")}</span>
        <select name="locationCode" required defaultValue={locations.some((l) => l.code === defaultLocation) ? defaultLocation : locations.find((l) => l.code === "MM-STOCK" && l.sellable)?.code ?? locations.find((l) => l.sellable)?.code ?? ""} className={fieldClass}>
          <option value="">—</option>{locations.map((l) => <option key={l.code} value={l.code}>{l.code} · {l.name}</option>)}
        </select>
      </label>
      <FileField name="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required aria-label={t("file")} className="max-w-72" />
      <Button type="submit" size="lg" disabled={pending}>{t("preview")}</Button>
    </form>
    {state?.error && <p role="alert" className="whitespace-pre-line text-sm text-destructive">{state.error}</p>}
    {preview && <div className="space-y-3">
      <p className="text-sm">{t("summary", { products: preview.products, lines: preview.rows.length })}</p>
      <p className="text-sm text-muted-foreground">{t("costHelp")}</p>
      {preview.rate && <p className="text-sm text-muted-foreground">{t("rateQuote", { rate: preview.rate })}</p>}
      {preview.errors.length > 0 && <ul role="alert" className="list-disc space-y-1 rounded-lg bg-destructive/10 p-4 pl-8 text-sm text-destructive">{preview.errors.map((error, i) => <li key={i}>{error}</li>)}</ul>}
      <div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <thead><tr>{["sku", "lot", "qty", "colWarehouse", "expiry", "price", "cost", "fee", "profit"].map((k) => <th key={k} className="whitespace-nowrap border-b p-2">{t(k)}</th>)}</tr></thead>
        <tbody>{preview.rows.map((r, i) => <tr key={i} className="border-b"><td className="p-2"><span className="font-mono">{r.sku}</span><div className="text-xs text-muted-foreground">{r.name}</div></td><td className="p-2">{r.lotNo}<div className="text-xs text-muted-foreground">{ti(r.stockType)}</div></td><td className="p-2">{r.qty}</td><td className="p-2">{r.location}</td><td className="p-2">{r.expiryDate ?? ti(r.expiryStatus === "NONE" ? "expiryNone" : "expiryUnknown")}</td>{[r.price, r.cost, r.fee, r.profit].map((n, j) => <td key={j} className={`p-2 tabular-nums ${j === 3 && n != null && n <= 0 ? "text-destructive" : ""}`}>{fmtInt(n)}</td>)}</tr>)}</tbody>
      </table></div>
      <p className="text-sm text-muted-foreground">{t("confirmHelp")}</p>
      {preview.errors.length === 0 && <form action={action}>
        <input type="hidden" name="step" value="confirm" /><input type="hidden" name="payload" value={JSON.stringify(preview.input)} />
        <Button type="submit" disabled={pending}>{t("confirm")}</Button>
      </form>}
    </div>}
    {state?.result && <div role="status" className="space-y-2 rounded-lg bg-muted p-4 text-sm">
      <p>{t("success", { count: state.result.ok })}</p>
      <ul className="space-y-1">{state.result.documents?.map((d) => <li key={d.id}><Link className="text-primary underline" href={`/admin/inventory/documents/${d.id}`}>{d.code} · {t("reviewDraft")}</Link></li>)}</ul>
      <p>{t("testHelp")}</p>
      <Link href="/admin/products" className="text-primary underline">{t("finishProducts")}</Link>
    </div>}
  </section>;
}
