"use client";

import { useState } from "react";
import type { AddressCatalog } from "@/server/locations/locations";

export type AddressPickerLabels = {
  state: string;
  district: string;
  township: string;
  chooseState: string;
  chooseDistrict: string;
  chooseTownship: string;
};

/** Tìm vùng + huyện chứa thị trấn (điền sẵn địa chỉ đã lưu). Thị trấn đã ngừng giao → không có. */
function locate(catalog: AddressCatalog, townshipId?: string | null) {
  if (!townshipId) return { stateId: "", districtId: "" };
  for (const s of catalog) {
    for (const d of s.districts) if (d.townships.some((t) => t.id === townshipId)) return { stateId: s.id, districtId: d.id };
  }
  return { stateId: "", districtId: "" };
}

/**
 * Chọn địa chỉ theo danh mục VTP Myanmar (P15): Vùng → Huyện → Thị trấn, mỗi ô phụ thuộc ô trước.
 * Chỉ ô Thị trấn được gửi (`name`); server tra lại cả 3 cấp. Dùng chung storefront / sổ địa chỉ / admin / cổng CTV.
 */
export function AddressPicker({
  catalog,
  labels,
  defaultTownshipId,
  name = "townshipId",
  fieldClass,
  labelClass = "block space-y-1 text-sm",
  textClass,
  onTownshipChange,
  error,
  errorId,
}: {
  catalog: AddressCatalog;
  labels: AddressPickerLabels;
  defaultTownshipId?: string | null;
  name?: string;
  fieldClass: string;
  labelClass?: string;
  /** Lớp cho chữ nhãn (admin dùng màu chữ phụ). */
  textClass?: string;
  onTownshipChange?: (townshipId: string) => void;
  error?: string;
  errorId?: string;
}) {
  const initial = locate(catalog, defaultTownshipId);
  const [stateId, setStateId] = useState(initial.stateId);
  const [districtId, setDistrictId] = useState(initial.districtId);
  const [townshipId, setTownshipId] = useState(initial.districtId ? (defaultTownshipId ?? "") : "");
  const state = catalog.find((s) => s.id === stateId);
  const district = state?.districts.find((d) => d.id === districtId);
  const setTownship = (id: string) => {
    setTownshipId(id);
    onTownshipChange?.(id);
  };

  return (
    <>
      <label className={labelClass}>
        <span className={textClass}>{labels.state}</span>
        <select
          required
          value={stateId}
          onChange={(e) => {
            setStateId(e.target.value);
            setDistrictId("");
            setTownship("");
          }}
          className={fieldClass}
        >
          <option value="" disabled>
            {labels.chooseState}
          </option>
          {catalog.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        <span className={textClass}>{labels.district}</span>
        <select
          required
          value={districtId}
          disabled={!state}
          onChange={(e) => {
            setDistrictId(e.target.value);
            setTownship("");
          }}
          className={fieldClass}
        >
          <option value="" disabled>
            {labels.chooseDistrict}
          </option>
          {state?.districts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        <span className={textClass}>{labels.township}</span>
        <select
          name={name}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          required
          value={townshipId}
          disabled={!district}
          onChange={(e) => setTownship(e.target.value)}
          className={fieldClass}
        >
          <option value="" disabled>
            {labels.chooseTownship}
          </option>
          {district?.townships.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      {error && <p id={errorId} className="text-sm text-destructive">{error}</p>}
    </>
  );
}
