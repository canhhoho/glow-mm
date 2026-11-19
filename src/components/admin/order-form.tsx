"use client";

import { Trash2, Plus } from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { AddressPicker } from "@/components/address-picker";
import { Button } from "@/components/ui/button";
import { fieldLabelClass, fieldLabelSmClass } from "@/components/admin/ui";
import { FIELD, type Density } from "@/components/ui/field";
import { fmtInt } from "@/lib/format";
import { createOrderAction } from "@/server/orders/actions";
import type { OrderFormOptions } from "@/server/orders/admin-queries";
import type { ActionState } from "@/server/inventory/actions";
import { cn } from "@/lib/utils";

type Line = { key: number; variantId: string; qty: string };
export type OrderFormInitial = { phone: string; phone2: string; name: string; townshipId: string; addressLine: string };

let seq = 0;
const blank = (): Line => ({ key: ++seq, variantId: "", qty: "1" });

/**
 * Form tạo đơn tay (đơn từ FB/Viber/điện thoại). Gửi JSON; giá, tồn được kiểm lại ở server.
 * Địa chỉ theo danh mục VTP (P15); phí ship do đơn vị vận chuyển thu khi giao → tổng = tiền hàng.
 * `affiliates`: danh sách CTV để nhân viên gán (P10) — không truyền thì không hiện ô chọn.
 * `action`: mặc định tạo đơn admin; cổng CTV truyền action riêng (đơn gắn CTV đang đăng nhập).
 */
export function OrderForm({
  options,
  initial,
  affiliates,
  action: submit = createOrderAction,
  density = "compact",
}: {
  options: OrderFormOptions;
  initial: OrderFormInitial;
  affiliates?: { id: string; label: string }[];
  action?: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  /** `touch`: ô nhập + nút cao h-11 cho cổng CTV trên điện thoại; admin giữ `compact` (h-9). */
  density?: Density;
}) {
  const field = FIELD[density];
  const btn = density === "touch" ? "touch" : "lg";
  const t = useTranslations("Orders");
  const ta = useTranslations("Affiliates");
  const [state, action, pending] = useActionState(submit, undefined);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [channel, setChannel] = useState("FACEBOOK");
  const [paymentMethod, setPaymentMethod] = useState("COD");
  const [shippingPayer, setShippingPayer] = useState("RECEIVER");
  const [name, setName] = useState(initial.name);
  const [phone, setPhone] = useState(initial.phone);
  const [phone2, setPhone2] = useState(initial.phone2);
  const [townshipId, setTownshipId] = useState(initial.townshipId);
  const [addressLine, setAddressLine] = useState(initial.addressLine);
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([blank()]);

  const variant = (id: string) => options.variants.find((v) => v.id === id);
  const update = (key: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const subtotal = lines.reduce((s, l) => s + (variant(l.variantId)?.priceMmk ?? 0) * (Number(l.qty) || 0), 0);
  // Cổng CTV: hoa hồng dự kiến = Σ mức ở Giá bán × SL (server chốt lại khi tạo đơn).
  const showCommission = options.variants.some((o) => "commissionMmk" in o);
  const commission = lines.reduce((s, l) => { const o = variant(l.variantId); return s + (o && "commissionMmk" in o ? (o.commissionMmk ?? 0) : 0) * (Number(l.qty) || 0); }, 0);

  const payload = useMemo(
    () =>
      JSON.stringify({
        channel,
        paymentMethod,
        shippingPayer,
        name,
        phone,
        phone2: phone2 || undefined,
        townshipId,
        addressLine,
        note: note || undefined,
        locale: "my",
        idempotencyKey,
        items: lines.filter((l) => l.variantId).map((l) => ({ variantId: l.variantId, qty: l.qty })),
      }),
    [channel, paymentMethod, shippingPayer, name, phone, phone2, townshipId, addressLine, note, idempotencyKey, lines],
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="payload" value={payload} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={fieldLabelClass}>
          <span className="text-muted-foreground">{t("channelLabel")}</span>
          <select name="channel" value={channel} onChange={(e) => setChannel(e.target.value)} className={field}>
            {(["FACEBOOK", "VIBER", "PHONE", "WEB"] as const).map((c) => (
              <option key={c} value={c}>
                {t(`channel.${c}`)}
              </option>
            ))}
          </select>
        </label>
        <label className={fieldLabelClass}>
          <span className="text-muted-foreground">{t("paymentMethod")}</span>
          <select
            name="paymentMethod"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            className={field}
          >
            <option value="COD">{t("method.COD")}</option>
            <option value="BANK_TRANSFER">{t("method.BANK_TRANSFER")}</option>
          </select>
        </label>
        {affiliates && affiliates.length > 0 && (
          <label className={fieldLabelClass}>
            <span className="text-muted-foreground">{ta("pickLabel")}</span>
            <select name="affiliateId" defaultValue="" className={field}>
              <option value="">{ta("assignNone")}</option>
              {affiliates.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className={fieldLabelClass}>
          <span className="text-muted-foreground">{t("shippingPayer")}</span>
          <select value={shippingPayer} onChange={(e) => setShippingPayer(e.target.value)} className={field}>
            <option value="RECEIVER">{t("receiverPays")}</option>
            <option value="SENDER">{t("senderPays")}</option>
          </select>
        </label>
        <label className={fieldLabelClass}>
          <span className="text-muted-foreground">{t("name")}</span>
          <input name="name" required value={name} onChange={(e) => setName(e.target.value)} className={field} />
        </label>
        <label className={fieldLabelClass}>
          <span className="text-muted-foreground">{t("phone")}</span>
          <input
            name="phone"
            required
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={field}
          />
        </label>
        <label className={fieldLabelClass}>
          <span className="text-muted-foreground">{t("phone2")}</span>
          <input
            name="phone2"
            type="tel"
            inputMode="tel"
            value={phone2}
            onChange={(e) => setPhone2(e.target.value)}
            className={field}
          />
        </label>
        <AddressPicker
          catalog={options.catalog}
          labels={{
            state: t("state"),
            district: t("district"),
            township: t("township"),
            chooseState: t("chooseState"),
            chooseDistrict: t("chooseDistrict"),
            chooseTownship: t("chooseTownship"),
          }}
          defaultTownshipId={initial.townshipId}
          name="townshipIdSelect"
          fieldClass={field}
          labelClass={fieldLabelClass}
          textClass="text-muted-foreground"
          onTownshipChange={setTownshipId}
        />
        <label className={fieldLabelClass}>
          <span className="text-muted-foreground">{t("address")}</span>
          <input
            name="addressLine"
            required
            value={addressLine}
            onChange={(e) => setAddressLine(e.target.value)}
            className={field}
          />
        </label>
        <label className={cn(fieldLabelClass, "sm:col-span-2")}>
          <span className="text-muted-foreground">{t("note")}</span>
          <input name="note" value={note} onChange={(e) => setNote(e.target.value)} className={field} />
        </label>
      </div>

      <div className="space-y-2">
        {lines.map((l, i) => {
          const v = variant(l.variantId);
          return (
            <fieldset
              key={l.key}
              aria-label={`${t("line")} ${i + 1}`}
              className="grid items-end gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_6rem_auto]"
            >
              <label className={fieldLabelSmClass}>
                <span className="text-muted-foreground">{t("variant")}</span>
                <select
                  name={`variant-${i}`}
                  required
                  value={l.variantId}
                  onChange={(e) => update(l.key, { variantId: e.target.value })}
                  className={field}
                >
                  <option value="">—</option>
                  {options.variants.map((o) => (
                    <option key={o.id} value={o.id} disabled={o.available <= 0 && o.preorder <= 0}>
                      {o.label} · {fmtInt(o.priceMmk)} MMK · {o.available <= 0 && o.preorder > 0 ? t("preorderOpen", { n: fmtInt(o.preorder) }) : `${t("available")}: ${o.available}`}
                      {"commissionMmk" in o && ` · ${ta("colCommission")}: ${o.commissionMmk ? fmtInt(o.commissionMmk) : "0"}`}
                    </option>
                  ))}
                </select>
                {/* Hàng chưa có nhưng còn nhận đặt trước → đơn tạo ra là đơn đặt trước (Chờ hàng, không giữ hàng). */}
                {v && v.available <= 0 && v.preorder > 0 && (
                  <span className="block text-xs text-warning-foreground" data-testid="line-preorder">
                    {t("preorderLine")}
                  </span>
                )}
                {/* Cổng CTV: ô chọn bị cắt chữ trên điện thoại → nhắc lại hoa hồng/cái của SP đang chọn. */}
                {v && "commissionMmk" in v && (
                  <span className="block text-xs text-muted-foreground" data-testid="line-commission">
                    {ta("commissionPerUnit", { amount: fmtInt(v.commissionMmk ?? 0) })}
                  </span>
                )}
              </label>
              <label className={fieldLabelSmClass}>
                <span className="text-muted-foreground">{t("qty")}</span>
                <input
                  name={`qty-${i}`}
                  required
                  type="number"
                  min={1}
                  max={v ? (v.available > 0 ? v.available : v.preorder) : 99}
                  step={1}
                  inputMode="numeric"
                  value={l.qty}
                  onChange={(e) => update(l.key, { qty: e.target.value })}
                  className={field}
                />
              </label>
              <Button size={density === "touch" ? "icon-touch" : "icon-lg"}
                type="button"
                variant="outline"
                disabled={lines.length === 1}
                onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} title={t("remove")} aria-label={t("remove")}
              ><Trash2 aria-hidden className="size-4 shrink-0" /></Button>
            </fieldset>
          );
        })}
        <Button size={btn} type="button" variant="outline" onClick={() => setLines((ls) => [...ls, blank()])}><Plus aria-hidden className="size-4 shrink-0" /> {t("addLine")}</Button>
      </div>

      <dl className="grid max-w-xs grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm" aria-label={t("estimate")}>
        <dt className="col-span-2 text-xs text-muted-foreground">{t("estimate")}</dt>
        <dt>{t("subtotal")}</dt>
        <dd className="text-right tabular-nums">{fmtInt(subtotal)} MMK</dd>
        <dt className="font-medium">{t("total")}</dt>
        <dd className="text-right font-medium tabular-nums">{fmtInt(subtotal)} MMK</dd>
        <dd className="col-span-2 text-xs text-muted-foreground">{t("shippingNote")}</dd>
        {showCommission && (
          <>
            <dt>{ta("commissionEstimate")}</dt>
            <dd className="text-right tabular-nums" data-testid="order-commission-estimate">{fmtInt(commission)} MMK</dd>
          </>
        )}
      </dl>

      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {t("error")}: {state.error}
        </p>
      )}
      <Button size={btn} type="submit" disabled={pending}><Plus aria-hidden className="size-4 shrink-0" /> {t("create")}</Button>
    </form>
  );
}
