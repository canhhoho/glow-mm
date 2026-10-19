"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Dòng bảng có nút mở rộng: bấm → hiện dòng chi tiết ngay bên dưới (P9c, danh sách lô của biến thể). */
export function ExpandableRow({
  cells,
  detail,
  colSpan,
  label,
  testId,
}: {
  cells: React.ReactNode;
  detail: React.ReactNode | null;
  colSpan: number;
  label: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr data-testid={testId} className={cn(open && "bg-muted/40")}>
        <td className="w-8 px-3 py-2 align-top">
          {detail && (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-label={label}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted"
            >
              <ChevronRight className={cn("size-4 transition-transform", open && "rotate-90")} aria-hidden />
            </button>
          )}
        </td>
        {cells}
      </tr>
      {open && detail && (
        <tr className="bg-muted/40">
          <td />
          <td colSpan={colSpan - 1} className="px-3 pt-0 pb-3">
            {detail}
          </td>
        </tr>
      )}
    </>
  );
}
