import { getTranslations } from "next-intl/server";
import { remitCodAction } from "@/server/orders/actions";
import { ActionForm } from "./action-form";
import { fieldClass } from "./ui";

export async function CodSettlement({ orderId, total }: { orderId: string; total: number }) {
  const t = await getTranslations("Cod");
  return <ActionForm action={remitCodAction} submitLabel={t("confirm")} okText={t("saved")} className="flex flex-wrap items-end gap-3">
    <input type="hidden" name="orderId" value={orderId} />
    <label className="grid gap-1 text-sm"><span>{t("received")}</span><input name="receivedMmk" type="number" min="0" max={total} step="1" required defaultValue={total} className={fieldClass} /></label>
    <label className="grid gap-1 text-sm"><span>{t("fee")}</span><input name="feeMmk" type="number" min="0" max={total} step="1" required defaultValue="0" className={fieldClass} /></label>
    <label className="grid gap-1 text-sm"><span>{t("reference")}</span><input name="reference" required maxLength={150} className={fieldClass} /></label>
  </ActionForm>;
}
