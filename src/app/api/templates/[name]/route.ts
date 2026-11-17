import { getLocale } from "next-intl/server";
import { ADMIN_LOCALES, type AdminLocale } from "@/i18n/routing";
import { getStaffUser } from "@/server/auth/session";
import { can } from "@/server/auth/roles";
import { catalogTemplateFile } from "@/server/catalog/catalog-template";

/**
 * File Excel nhập/cập nhật sản phẩm (một sheet), sinh lúc tải để danh sách thả xuống theo dữ liệu thật:
 * `catalog.xlsx` = mẫu trống, `catalog-current.xlsx` = mọi SKU đang có (sửa rồi tải lên lại).
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/templates/[name]">) {
  const user = await getStaffUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { name } = await ctx.params;
  if (name !== "catalog.xlsx" && name !== "catalog-current.xlsx") return new Response("Not found", { status: 404 });
  if (!can(user.role, "catalog:manage")) return new Response("Forbidden", { status: 403 });
  const current = name === "catalog-current.xlsx";
  // Tiêu đề cột theo ngôn ngữ admin (cookie); không còn cột giá — giá đặt ở trang Giá bán (16/11/2026).
  const locale = await getLocale();
  const bytes = await catalogTemplateFile(current, { locale: (ADMIN_LOCALES as readonly string[]).includes(locale) ? (locale as AdminLocale) : "vi" });
  const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${current ? `san-pham-hien-co-${day}` : "mau-nhap-san-pham"}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
