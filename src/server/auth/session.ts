import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { can, isRole, type Permission, type Role } from "./roles";

export type StaffUser = { id: string; name: string; email: string; role: Role; locale: string };

/** Người dùng hiện tại (nhân viên đang hoạt động) hoặc null. */
export async function getStaffUser(): Promise<StaffUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  const u = session?.user as (Record<string, unknown> & { id: string; name: string; email: string }) | undefined;
  if (!u || u.active === false || !isRole(u.role)) return null;
  return { id: u.id, name: u.name, email: u.email, role: u.role, locale: String(u.locale ?? "vi") };
}

/** Dùng trong page/layout admin: chưa đăng nhập → /admin/login. */
export async function requireStaff(): Promise<StaffUser> {
  const user = await getStaffUser();
  if (!user) redirect("/admin/login");
  return user;
}

export class ForbiddenError extends Error {
  constructor(public readonly permission: Permission) {
    super(`Không có quyền: ${permission}`);
    this.name = "ForbiddenError";
  }
}

/** Dùng trong MỌI Server Action / route handler cần quyền. Thiếu quyền → ForbiddenError. */
export async function requirePermission(permission: Permission): Promise<StaffUser> {
  const user = await requireStaff();
  if (!can(user.role, permission)) throw new ForbiddenError(permission);
  return user;
}

/** Dùng trong page admin: thiếu quyền → về trang tổng quan. */
export async function requirePagePermission(permission: Permission): Promise<StaffUser> {
  const user = await requireStaff();
  if (!can(user.role, permission)) redirect("/admin?denied=1");
  return user;
}
