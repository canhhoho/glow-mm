import { Eye, EyeOff } from "lucide-react";

/**
 * Nút hiện/ẩn mật khẩu đặt trong ô nhập (cha `relative`, ô nhập chừa `pr-11`). Không tự giữ state —
 * form cha (client component) truyền `shown` + `onToggle` và nhãn đã dịch.
 */
export function PasswordToggle({ shown, onToggle, showLabel, hideLabel }: { shown: boolean; onToggle: () => void; showLabel: string; hideLabel: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={shown ? hideLabel : showLabel}
      aria-pressed={shown}
      className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-lg text-muted-foreground hover:text-foreground"
    >
      {shown ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
    </button>
  );
}
