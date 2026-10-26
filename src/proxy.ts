import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { hasLocale } from "next-intl";
import { PORTAL_HEADER, routing } from "./i18n/routing";
import { normalizeRefCode, REF_COOKIE, REF_MAX_AGE_S, REF_PARAM } from "./server/affiliates/referral";
import { isKnownStorePath, parseStoreSlugPath, storeSlugExists } from "./server/catalog/store-slugs";

const intl = createMiddleware(routing);

/**
 * Proxy: định tuyến locale cho storefront + trả HTTP 404 thật (trang có header/footer, bản dịch) cho:
 * - đường dẫn không khớp route nào (`isKnownStorePath`), vd /en/foo, /en/p/a/b;
 * - slug sản phẩm/danh mục/trang thông tin/bộ sưu tập không tồn tại.
 * Cách làm: rewrite sang /[locale]/404 — trang tĩnh gọi notFound() lúc prerender nên giữ status 404.
 * KHÔNG phải lớp bảo mật — quyền được kiểm tra trong từng Server Action/route.
 */
export default async function proxy(req: NextRequest) {
  // Cổng CTV: không qua next-intl storefront; gắn header để i18n chọn ngôn ngữ của cổng CTV.
  if (req.nextUrl.pathname === "/ctv" || req.nextUrl.pathname.startsWith("/ctv/")) {
    const headers = new Headers(req.headers);
    headers.set(PORTAL_HEADER, "ctv");
    return NextResponse.next({ request: { headers } });
  }

  // Link giới thiệu CTV (P10): ghi cookie rồi chuyển sang URL không còn `ref` (giữ cache/canonical sạch).
  if (req.nextUrl.searchParams.has(REF_PARAM)) {
    const code = normalizeRefCode(req.nextUrl.searchParams.get(REF_PARAM));
    const clean = req.nextUrl.clone();
    clean.searchParams.delete(REF_PARAM);
    const res = NextResponse.redirect(clean);
    if (code) res.cookies.set(REF_COOKIE, code, { httpOnly: true, sameSite: "lax", path: "/", maxAge: REF_MAX_AGE_S });
    return res;
  }

  const res = intl(req);
  if (res.headers.has("location")) return res; // next-intl chuyển hướng

  // next-intl rewrite `/p/x` (locale mặc định) → `/my/p/x`; với `/en/p/x` thì giữ nguyên đường dẫn.
  const rewritten = res.headers.get("x-middleware-rewrite");
  const pathname = rewritten ? new URL(rewritten).pathname : req.nextUrl.pathname;
  if (isKnownStorePath(pathname)) {
    const target = parseStoreSlugPath(pathname);
    if (!target || (await storeSlugExists(target.kind, target.slug))) return res;
  }

  // Giữ header/cookie next-intl đã đặt, đổi đích rewrite.
  const headers = new Headers(res.headers);
  headers.delete("x-middleware-next");
  const first = pathname.split("/")[1];
  const locale = hasLocale(routing.locales, first) ? first : routing.defaultLocale;
  return NextResponse.rewrite(new URL(`/${locale}/404`, req.url), { headers });
}

export const config = {
  // Bỏ qua admin, api, file tĩnh và tài nguyên nội bộ của Next.
  matcher: ["/((?!admin|api|_next|_vercel|.*\\..*).*)"],
};
