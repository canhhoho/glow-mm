"use client";

import { Plus } from "lucide-react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/admin/ui";
import { addShipmentCostAction, allocateShipmentAction, attachBatchAction, createShipmentAction } from "@/server/inventory/actions";

function ErrorText({ error }: { error?: string }) {
  const t = useTranslations("Docs");
  return error ? (
    <p role="alert" className="text-sm text-destructive">
      {t("error")}: {error}
    </p>
  ) : null;
}

export function ShipmentCreateForm() {
  const t = useTranslations("Ship");
  const [state, action, pending] = useActionState(createShipmentAction, undefined);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <label className="grid content-start gap-1 text-sm">
        <span className="text-muted-foreground">{t("code")}</span>
        <input name="code" required placeholder="SH-2026-002" className={fieldClass} />
      </label>
      <label className="grid content-start gap-1 text-sm">
        <span className="text-muted-foreground">{t("method")}</span>
        <select name="allocationMethod" className={fieldClass} defaultValue="BY_VALUE">
          <option value="BY_VALUE">{t("BY_VALUE")}</option>
          <option value="BY_QTY">{t("BY_QTY")}</option>
          <option value="BY_WEIGHT">{t("BY_WEIGHT")}</option>
        </select>
      </label>
      <label className="grid content-start gap-1 text-sm">
        <span className="text-muted-foreground">{t("departedAt")}</span>
        <input name="departedAt" type="date" className={fieldClass} />
      </label>
      <label className="grid content-start gap-1 text-sm">
        <span className="text-muted-foreground">{t("note")}</span>
        <input name="note" className={fieldClass} />
      </label>
      <div className="sm:col-span-2">
        <ErrorText error={state?.error} />
        <Button size="lg" type="submit" disabled={pending}><Plus aria-hidden className="size-4 shrink-0" /> {t("create")}</Button>
      </div>
    </form>
  );
}

export function ShipmentCostForm({ shipmentId }: { shipmentId: string }) {
  const t = useTranslations("Ship");
  const [state, action, pending] = useActionState(addShipmentCostAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="shipmentId" value={shipmentId} />
      <label className="grid content-start gap-1 text-sm">
        <span className="text-muted-foreground">{t("costs")}</span>
        <select name="type" className={fieldClass} defaultValue="SHIPPING">
          <option value="SHIPPING">{t("SHIPPING")}</option>
          <option value="TAX">{t("TAX")}</option>
          <option value="FEE">{t("FEE")}</option>
        </select>
      </label>
      <label className="grid content-start gap-1 text-sm">
        <span className="text-muted-foreground">{t("amount")}</span>
        <input name="amountVnd" type="number" min={1} step={1} inputMode="numeric" required className={fieldClass} />
      </label>
      <label className="grid content-start gap-1 text-sm">
        <span className="text-muted-foreground">{t("note")}</span>
        <input name="note" className={fieldClass} />
      </label>
      <Button size="lg" type="submit" disabled={pending}><Plus aria-hidden className="size-4 shrink-0" /> {t("addCost")}</Button>
      <div className="w-full">
        <ErrorText error={state?.error} />
      </div>
    </form>
  );
}

export function AllocateForm({ shipmentId, method }: { shipmentId: string; method: "BY_VALUE" | "BY_QTY" | "BY_WEIGHT" }) {
  const t = useTranslations("Ship");
  const [state, action, pending] = useActionState(allocateShipmentAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="shipmentId" value={shipmentId} />
      <label className="grid content-start gap-1 text-sm">
        <span className="text-muted-foreground">{t("method")}</span>
        <select name="allocationMethod" className={fieldClass} defaultValue={method}>
          <option value="BY_VALUE">{t("BY_VALUE")}</option>
          <option value="BY_QTY">{t("BY_QTY")}</option>
          <option value="BY_WEIGHT">{t("BY_WEIGHT")}</option>
        </select>
      </label>
      <Button size="lg" type="submit" disabled={pending}>
        {t("allocate")}
      </Button>
      <div className="w-full">
        <ErrorText error={state?.error} />
        {state?.ok && <p className="text-sm text-emerald-700">{t("allocated")}</p>}
      </div>
    </form>
  );
}

export function AttachBatchForm({ shipmentId, batches }: { shipmentId: string; batches: { id: string; sku: string; lotNo: string }[] }) {
  const t = useTranslations("Ship");
  const [state, action, pending] = useActionState(attachBatchAction, undefined);
  return <form action={action} className="flex flex-wrap items-end gap-2"><input type="hidden" name="shipmentId" value={shipmentId} /><label className="grid gap-1 text-sm"><span>{t("unlinkedBatch")}</span><select name="batchId" required className={fieldClass} defaultValue=""><option value="" disabled>—</option>{batches.map(b => <option key={b.id} value={b.id}>{b.sku} · {b.lotNo}</option>)}</select></label><Button size="lg" type="submit" disabled={pending || !batches.length}><Plus aria-hidden className="size-4 shrink-0" /> {t("attachBatch")}</Button><ErrorText error={state?.error} />{state?.ok && <p role="status">{t("attached")}</p>}</form>;
}
