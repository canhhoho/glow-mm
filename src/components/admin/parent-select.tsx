"use client";

import { useState } from "react";
import { fieldClass } from "@/components/admin/ui";

/**
 * Ô chọn danh mục cha. Mỗi hàng của trang danh mục có một ô → nếu render đủ lựa chọn ngay thì trang là O(n²).
 * Ban đầu chỉ render lựa chọn đang chọn; danh sách đầy đủ hiện khi người dùng bấm/focus vào ô.
 * `roots` là cùng một mảng cho mọi hàng (RSC chỉ gửi một lần).
 */
export function ParentSelect({
  roots,
  value,
  excludeId,
  noParentLabel,
}: {
  roots: { id: string; name: string }[];
  value: string | null;
  excludeId: string;
  noParentLabel: string;
}) {
  const [full, setFull] = useState(false);
  const options = full ? roots.filter((r) => r.id !== excludeId) : roots.filter((r) => r.id === value);
  return (
    <select
      name="parentId"
      defaultValue={value ?? ""}
      onFocus={() => setFull(true)}
      onPointerDown={() => setFull(true)}
      className={fieldClass}
    >
      <option value="">{noParentLabel}</option>
      {options.map((r) => (
        <option key={r.id} value={r.id}>
          {r.name}
        </option>
      ))}
    </select>
  );
}
