"use client";

import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/admin/ui";
import { createOrderAction } from "@/server/orders/actions";
import type { OrderFormOptions } from "@/server/orders/admin-queries";

type Line = { key: number; variantId: string; qty: string };
export type OrderFormInitial = { phone: string; name: string; zoneId: string; addressLine: string };

let seq = 0;
const blank = (): Line => ({ key: ++seq, variantId: "", qty: "1" });
const fmt = (n: number) => new Intl.NumberFormat("en-US").format(n);

/** Form tạo đơn tay (đơn từ FB/Viber/điện thoại). Gửi JSON; giá, phí ship, tồn được kiểm lại ở server. */
export function OrderForm({ options, initial }: { options: OrderFormOptions; initial: OrderFormInitial }) {
  const t = useTranslations("Orders");
  const [state, action, pending] = useActionState(createOrderAction, undefined);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [channel, setChannel] = useState("FACEBOOK");
  const [paymentMethod, setPaymentMethod] = useState("COD");
  const [name, setName] = useState(initial.name);
  const [phone, setPhone] = useState(initial.phone);
  const [zoneId, setZoneId] = useState(initial.zoneId);
  const [addressLine, setAddressLine] = useState(initial.addressLine);
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([blank()]);

  const variant = (id: string) => options.variants.find((v) => v.id === id);
  const update = (key: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const subtotal = lines.reduce((s, l) => s + (variant(l.variantId)?.priceMmk ?? 0) * (Number(l.qty) || 0), 0);
  const zone = options.zones.find((z) => z.id === zoneId);
  const fee = zone?.feeMmk == null ? null : zone.freeFromMmk != null && subtotal >= zone.freeFromMmk ? 0 : zone.feeMmk;

  const payload = useMemo(
    () =>
      JSON.stringify({
        channel,
        paymentMethod,
        name,
        phone,
        zoneId,
        addressLine,
        note: note || undefined,
        locale: "my",
        idempotencyKey,
        items: lines.filter((l) => l.variantId).map((l) => ({ variantId: l.variantId, qty: l.qty })),
      }),
    [channel, paymentMethod, name, phone, zoneId, addressLine, note, idempotencyKey, lines],
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="payload" value={payload} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">{t("channelLabel")}</span>
          <select name="channel" value={channel} onChange={(e) => setChannel(e.target.value)} className={fieldClass}>
            {(["FACEBOOK", "VIBER", "PHONE", "WEB"] as const).map((c) => (
              <option key={c} value={c}>
                {t(`channel.${c}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">{t("paymentMethod")}</span>
          <select
            name="paymentMethod"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            className={fieldClass}
          >
            <option value="COD">{t("method.COD")}</option>
            <option value="BANK_TRANSFER">{t("method.BANK_TRANSFER")}</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">{t("name")}</span>
          <input name="name" required value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">{t("phone")}</span>
          <input
            name="phone"
            required
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">{t("zone")}</span>
          <select name="zoneId" required value={zoneId} onChange={(e) => setZoneId(e.target.value)} className={fieldClass}>
            <option value="">{t("chooseZone")}</option>
            {options.zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">{t("address")}</span>
          <input
            name="addressLine"
            required
            value={addressLine}
            onChange={(e) => setAddressLine(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="space-y-1 text-sm sm:col-span-2">
          <span className="text-muted-foreground">{t("note")}</span>
          <input name="note" value={note} onChange={(e) => setNote(e.target.value)} className={fieldClass} />
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
              <label className="space-y-1 text-xs">
                <span className="text-muted-foreground">{t("variant")}</span>
                <select
                  name={`variant-${i}`}
                  required
                  value={l.variantId}
                  onChange={(e) => update(l.key, { variantId: e.target.value })}
                  className={fieldClass}
                >
                  <option value="">—</option>
                  {options.variants.map((o) => (
                    <option key={o.id} value={o.id} disabled={o.available <= 0}>
                      {o.label} · {fmt(o.priceMmk)} MMK · {t("available")}: {o.available}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs">
                <span className="text-muted-foreground">{t("qty")}</span>
                <input
                  name={`qty-${i}`}
                  required
                  type="number"
                  min={1}
                  max={v?.available ?? 99}
                  step={1}
                  inputMode="numeric"
                  value={l.qty}
                  onChange={(e) => update(l.key, { qty: e.target.value })}
                  className={fieldClass}
                />
              </label>
              <Button
                type="button"
                variant="outline"
                disabled={lines.length === 1}
                onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
              >
                {t("remove")}
              </Button>
            </fieldset>
          );
        })}
        <Button type="button" variant="outline" onClick={() => setLines((ls) => [...ls, blank()])}>
          {t("addLine")}
        </Button>
      </div>

      <dl className="grid max-w-xs grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm" aria-label={t("estimate")}>
        <dt className="col-span-2 text-xs text-muted-foreground">{t("estimate")}</dt>
        <dt>{t("subtotal")}</dt>
        <dd className="text-right tabular-nums">{fmt(subtotal)} MMK</dd>
        <dt>{t("shipping")}</dt>
        <dd className="text-right tabular-nums">{fee == null ? "—" : fee === 0 ? t("freeShip") : `${fmt(fee)} MMK`}</dd>
        <dt className="font-medium">{t("total")}</dt>
        <dd className="text-right font-medium tabular-nums">{fmt(subtotal + (fee ?? 0))} MMK</dd>
      </dl>

      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {t("error")}: {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {t("create")}
      </Button>
    </form>
  );
}
