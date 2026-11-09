"use client";

import { confirmOrPrevent } from "@/lib/confirm";

/** Nút gửi form có hỏi xác nhận (đảo nhỏ phía client, phần form còn lại vẫn là server component). */
export function ConfirmSubmitButton({ confirm, ...props }: { confirm: string } & Omit<React.ComponentProps<"button">, "type" | "onClick">) {
  return <button type="submit" {...props} onClick={confirmOrPrevent(confirm)} />;
}
