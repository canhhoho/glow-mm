"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { fieldClass, fieldLabelClass } from "@/components/admin/ui";
import { rateDisplay } from "@/server/pricing/formula";

/** Bỏ dấu phẩy/khoảng trắng phân cách nghìn (giống server). */
const clean = (v: string) => v.replace(/[,\s]/g, "");

function previewOf(mmk: string, vnd: string) {
  if (!mmk || !vnd) return null;
  try {
    return rateDisplay({ mmkPerVnd: 0, mmkPerUsd: clean(mmk), vndPerUsd: clean(vnd) });
  } catch {
    return null;
  }
}

/** Hai ô 1 USD = ? MMK / 1 USD = ? VND + dòng tỷ giá MMK ↔ VND tính ngay khi gõ (server tính lại khi lưu). */
export function RateInputs() {
  const t = useTranslations("Pricing");
  const [mmk, setMmk] = useState("");
  const [vnd, setVnd] = useState("");
  const preview = previewOf(mmk, vnd);
  return (
    <>
      <label className={fieldLabelClass}>
        <span className="text-muted-foreground">{t("mmkPerUsd")}</span>
        <input
          name="mmkPerUsd"
          required
          inputMode="decimal"
          placeholder="4420"
          value={mmk}
          onChange={(e) => setMmk(e.target.value)}
          className={fieldClass}
        />
      </label>
      <label className={fieldLabelClass}>
        <span className="text-muted-foreground">{t("vndPerUsd")}</span>
        <input
          name="vndPerUsd"
          required
          inputMode="decimal"
          placeholder="26000"
          value={vnd}
          onChange={(e) => setVnd(e.target.value)}
          className={fieldClass}
        />
      </label>
      <p className="col-span-full text-sm tabular-nums" role="status" data-testid="rate-preview">
        {preview ? t("ratePreview", { vnd: preview.vndPerMmk, mmk: preview.mmkPerVnd }) : t("rateHint")}
      </p>
    </>
  );
}
