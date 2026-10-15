import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

/**
 * Proxy chỉ xử lý định tuyến locale cho storefront.
 * KHÔNG phải lớp bảo mật — quyền được kiểm tra trong từng Server Action/route.
 */
export default createMiddleware(routing);

export const config = {
  // Bỏ qua admin, api, file tĩnh và tài nguyên nội bộ của Next.
  matcher: ["/((?!admin|api|_next|_vercel|.*\\..*).*)"],
};
