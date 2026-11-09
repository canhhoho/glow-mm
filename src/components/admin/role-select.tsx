import { getTranslations } from "next-intl/server";
import { ROLES, type Role } from "@/server/auth/roles";
import { fieldClass, fieldLabelClass } from "@/components/admin/ui";

/** Ô chọn vai trò nhân viên (server component, dùng trong form tạo/sửa). */
export async function RoleSelect({ defaultValue = "ORDER_STAFF", disabled }: { defaultValue?: Role; disabled?: boolean }) {
  const [t, tr] = await Promise.all([getTranslations("Users"), getTranslations("Role")]);
  return (
    <label className={fieldLabelClass}>
      <span>{t("role")}</span>
      <select name="role" defaultValue={defaultValue} disabled={disabled} className={fieldClass}>
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {tr(r)}
          </option>
        ))}
      </select>
      {disabled && <input type="hidden" name="role" value={defaultValue} />}
    </label>
  );
}
