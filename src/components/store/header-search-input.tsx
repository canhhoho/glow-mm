"use client";

import { useSearchParams } from "next/navigation";

/**
 * Ô nhập tìm kiếm trên header: tự động đồng bộ giá trị `q` từ searchParams khi ở trang tìm kiếm.
 */
export function HeaderSearchInput({
  placeholder,
  ariaLabel,
  className,
}: {
  placeholder: string;
  ariaLabel: string;
  className: string;
}) {
  const searchParams = useSearchParams();
  const q = searchParams.get("q") ?? "";

  return (
    <input
      key={q}
      name="q"
      type="search"
      defaultValue={q}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={className}
    />
  );
}
