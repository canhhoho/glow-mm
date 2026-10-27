"use client";

import { useTranslations } from "next-intl";
import type { AddressPickerLabels } from "../address-picker";

/** Nhãn ô chọn địa chỉ VTP (Vùng → Huyện → Thị trấn) của storefront, namespace `Address`. */
export function useAddressLabels(): AddressPickerLabels {
  const t = useTranslations("Address");
  return {
    state: t("state"),
    district: t("district"),
    township: t("township"),
    chooseState: t("chooseState"),
    chooseDistrict: t("chooseDistrict"),
    chooseTownship: t("chooseTownship"),
  };
}
