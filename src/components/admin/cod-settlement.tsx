import { getTranslations } from "next-intl/server";
import { remitCodAction, settleCodExceptionAction } from "@/server/orders/actions";
import { ActionForm } from "./action-form";
import { fieldClass } from "./ui";
import { fieldLabelClass } from "@/components/admin/ui";

export async function CodSettlement({ orderId, total, exception = false }: { orderId: string; total: number; exception?: boolean }) {
  const t = await getTranslations("Cod");
  return <ActionForm action={exception ? settleCodExceptionAction : remitCodAction} submitLabel={exception ? t("closeException") : t("confirm")} okText={t("saved")} confirm={exception ? t("exceptionConfirm") : undefined} className="flex flex-wrap items-end gap-3">
    <input type="hidden" name="orderId" value={orderId} />
    <label className={fieldLabelClass}><span>{t("received")}</span><input name="receivedMmk" type="number" min="0" max={total} step="1" required defaultValue={total} className={fieldClass} /></label>
    <label className={fieldLabelClass}><span>{t("fee")}</span><input name="feeMmk" type="number" min="0" max={total} step="1" required defaultValue="0" className={fieldClass} /></label>
    <label className={fieldLabelClass}><span>{t("reference")}</span><input name="reference" required maxLength={150} className={fieldClass} /></label>
    {exception && <>
      <p className="w-full text-sm text-muted-foreground">{t("exceptionFormula")}</p>
      <label className={fieldLabelClass}><span>{t("adjustment")}</span><input name="adjustmentMmk" type="number" min={0} max={total} step={1} required className={fieldClass} /></label>
      <label className={fieldLabelClass}><span>{t("settlementNote")}</span><input name="note" required maxLength={1000} className={fieldClass} /></label>
    </>}
  </ActionForm>;
}
