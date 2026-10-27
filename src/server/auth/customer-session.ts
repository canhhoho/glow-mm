import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { customerAuth } from "./customer-auth";
import { CUSTOMER_ROLE, safeNextPath } from "./customer-policy";

export type CustomerUser = { id: string; name: string; email: string; locale: string; hasPassword: boolean };

/** Khách đang đăng nhập (role CUSTOMER, đang hoạt động) hoặc null. Mọi truy vấn khu tài khoản lấy `id` từ đây. */
export async function getCustomerUser(): Promise<CustomerUser | null> {
  const session = await customerAuth.api.getSession({ headers: await headers() });
  const u = session?.user as (Record<string, unknown> & { id: string; name: string; email: string }) | undefined;
  if (!u || u.active === false || u.role !== CUSTOMER_ROLE) return null;
  const credential = await prisma.account.count({ where: { userId: u.id, providerId: "credential" } });
  return { id: u.id, name: u.name, email: u.email, locale: String(u.locale ?? "my"), hasPassword: credential > 0 };
}

/** Trang storefront cần đăng nhập: chưa đăng nhập → /(en/)login?next=<trang hiện tại>. */
export async function requireCustomer(locale: string, next: string): Promise<CustomerUser> {
  const user = await getCustomerUser();
  if (!user) {
    const prefix = locale === "en" ? "/en" : "";
    redirect(`${prefix}/login?next=${encodeURIComponent(safeNextPath(next))}`);
  }
  return user;
}
