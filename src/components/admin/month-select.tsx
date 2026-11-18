import { getLocale } from "next-intl/server";
import { cn } from "@/lib/utils";
import { fieldClass } from "@/components/admin/ui";

/** Tháng "YYYY-MM" (UTC) của `months` tháng gần nhất, mới nhất trước. */
export function recentMonths(months: number, now = new Date()): string[] {
  return Array.from({ length: months }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

/**
 * Ô chọn tháng cho bộ lọc GET (`name` = "YYYY-MM"). Thay `<input type="month">`: ô của trình duyệt hiển thị theo
 * ngôn ngữ máy, không theo ngôn ngữ giao diện (18/11/2026: Chrome tiếng Việt hiện "tháng mười 11 2026"). Nhãn theo
 * locale đang dùng, chữ số Latin. `allLabel` → thêm lựa chọn "tất cả" (giá trị rỗng). Giá trị cũ ngoài danh sách vẫn giữ.
 */
export async function MonthSelect({
  name,
  value,
  allLabel,
  months = 24,
  className,
  ariaLabel,
}: {
  name: string;
  value: string;
  allLabel?: string;
  months?: number;
  className?: string;
  ariaLabel?: string;
}) {
  const locale = await getLocale();
  const fmt = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC", numberingSystem: "latn" });
  const label = (ym: string) => {
    const [y, m] = ym.split("-").map(Number);
    return fmt.format(new Date(Date.UTC(y, m - 1, 1)));
  };
  const list = recentMonths(months);
  if (/^\d{4}-\d{2}$/.test(value) && !list.includes(value)) list.push(value);
  return (
    <select name={name} defaultValue={value} aria-label={ariaLabel} className={cn(fieldClass, className)}>
      {allLabel && <option value="">{allLabel}</option>}
      {list.map((ym) => (
        <option key={ym} value={ym}>
          {label(ym)}
        </option>
      ))}
    </select>
  );
}
