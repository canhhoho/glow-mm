/**
 * Proxy (P12): chưa có cookie phiên Better Auth → chuyển ngay về trang đăng nhập (307), tránh trang trắng do
 * chuyển hướng phía client sau khi render dạng stream. KHÔNG phải lớp bảo mật — chỉ xem có cookie hay không;
 * quyền vẫn kiểm ở server (`requireStaff` / `requireAffiliate`). Thuần, không import Next.
 */

/** Tên cookie phiên mặc định của Better Auth (thêm tiền tố `__Secure-` khi chạy https). */
export const SESSION_COOKIES = ["better-auth.session_token", "__Secure-better-auth.session_token"];

/** Trang công khai trong khu vực cần đăng nhập. */
const PUBLIC = ["/admin/login", "/ctv/login", "/ctv/join"];

/** Trang đăng nhập phải chuyển tới khi chưa có phiên, hoặc null nếu đường dẫn không cần (hoặc đã có phiên). */
export function loginRedirectFor(pathname: string, cookieNames: string[]): string | null {
  const area = pathname === "/admin" || pathname.startsWith("/admin/") ? "admin" : pathname === "/ctv" || pathname.startsWith("/ctv/") ? "ctv" : null;
  if (!area) return null;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;
  if (cookieNames.some((n) => SESSION_COOKIES.includes(n))) return null;
  return `/${area}/login`;
}

/** Cookie phiên của instance auth khách (P14, `cookiePrefix: "glow-customer"`). */
export const CUSTOMER_SESSION_COOKIES = ["glow-customer.session_token", "__Secure-glow-customer.session_token"];

/** Trang storefront cần tài khoản khách (có/không tiền tố /en). Checkout thêm ở P14c. */
const CUSTOMER_AREA = /^(\/en)?\/account(\/.*)?$/;

/**
 * Storefront: trang cần đăng nhập mà chưa có cookie phiên khách → `/(en/)login?next=<đường dẫn + query>`, ngược lại null.
 * Như trên: chỉ để tránh trang trắng, quyền kiểm ở `requireCustomer`.
 */
export function customerLoginRedirectFor(pathname: string, search: string, cookieNames: string[]): string | null {
  const m = CUSTOMER_AREA.exec(pathname);
  if (!m) return null;
  if (cookieNames.some((n) => CUSTOMER_SESSION_COOKIES.includes(n))) return null;
  return `${m[1] ?? ""}/login?next=${encodeURIComponent(pathname + search)}`;
}
