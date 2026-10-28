import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { customerAuth } from "./customer-auth";
import { AFFILIATE_ROLE } from "./roles";
import { STOREFRONT_ROLES, safeNextPath } from "./customer-policy";

export type CustomerUser = {
  id: string;
  name: string;
  email: string;
  locale: string;
  hasPassword: boolean;
  /** Đăng nhập bằng tài khoản CTV đang hoạt động → đơn đặt trên web tính cho CTV này. */
  affiliate: { id: string; code: string } | null;
};

/**
 * Người mua đang đăng nhập storefront (khách, hoặc CTV có hồ sơ đang hoạt động) hoặc null.
 * Mọi truy vấn khu tài khoản lấy `id` từ đây.
 */
export async function getCustomerUser(): Promise<CustomerUser | null> {
  const session = await customerAuth.api.getSession({ headers: await headers() });
  const u = session?.user as (Record<string, unknown> & { id: string; name: string; email: string }) | undefined;
  if (!u || u.active === false || !STOREFRONT_ROLES.includes(String(u.role))) return null;
  const [credential, affiliate] = await Promise.all([
    prisma.account.count({ where: { userId: u.id, providerId: "credential" } }),
    u.role === AFFILIATE_ROLE
      ? prisma.affiliate.findFirst({ where: { userId: u.id, active: true }, select: { id: true, code: true } })
      : null,
  ]);
  if (u.role === AFFILIATE_ROLE && !affiliate) return null; // hồ sơ CTV bị khoá → không mua thay mặt CTV
  return { id: u.id, name: u.name, email: u.email, locale: String(u.locale ?? "my"), hasPassword: credential > 0, affiliate };
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
