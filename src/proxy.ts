import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { parseStoreSlugPath, storeSlugExists } from "./server/catalog/store-slugs";

const intl = createMiddleware(routing);

/**
 * Proxy: định tuyến locale cho storefront + trả HTTP 404 thật cho slug sản phẩm/danh mục/trang thông tin không tồn tại
 * (rewrite sang /[locale]/404 — trang tĩnh gọi notFound() lúc prerender nên giữ status 404).
 * KHÔNG phải lớp bảo mật — quyền được kiểm tra trong từng Server Action/route.
 */
export default async function proxy(req: NextRequest) {
  const res = intl(req);
  if (res.headers.has("location")) return res; // next-intl chuyển hướng

  // next-intl rewrite `/p/x` (locale mặc định) → `/my/p/x`; với `/en/p/x` thì giữ nguyên đường dẫn.
  const rewritten = res.headers.get("x-middleware-rewrite");
  const pathname = rewritten ? new URL(rewritten).pathname : req.nextUrl.pathname;
  const target = parseStoreSlugPath(pathname);
  if (!target || (await storeSlugExists(target.kind, target.slug))) return res;

  // Giữ header/cookie next-intl đã đặt, đổi đích rewrite.
  const headers = new Headers(res.headers);
  headers.delete("x-middleware-next");
  const locale = pathname.split("/")[1];
  return NextResponse.rewrite(new URL(`/${locale}/404`, req.url), { headers });
}

export const config = {
  // Bỏ qua admin, api, file tĩnh và tài nguyên nội bộ của Next.
  matcher: ["/((?!admin|api|_next|_vercel|.*\\..*).*)"],
};
