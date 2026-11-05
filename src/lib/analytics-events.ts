export const CLIENT_EVENTS = ["view_item_list", "select_item", "view_item", "add_to_cart", "view_cart", "begin_checkout", "login_required", "login_success", "web_vital"] as const;
export type ClientEventName = typeof CLIENT_EVENTS[number];
export const PAGE_TYPES = ["home", "product", "category", "collection", "search", "cart", "checkout", "auth", "order", "account", "info", "other"] as const;
export const ANALYTICS_PATHS = ["/", "/p/:product", "/c/:category", "/collection/:collection", "/search", "/cart", "/checkout", "/login", "/register", "/order/:order", "/account", "/info/:page", "/other"] as const;

/** Chỉ ghi loại đường dẫn; bỏ query, mã đơn, SKU và thông tin khách. */
export function analyticsPath(raw: string): typeof ANALYTICS_PATHS[number] {
  const path = raw.split(/[?#]/, 1)[0].replace(/^\/(en|vi|my)(?=\/|$)/, "") || "/";
  if (/^\/p\/[^/]+\/?$/.test(path)) return "/p/:product";
  if (/^\/c\/[^/]+\/?$/.test(path)) return "/c/:category";
  if (/^\/collection\/[^/]+\/?$/.test(path)) return "/collection/:collection";
  if (/^\/order\/[^/]+\/?$/.test(path)) return "/order/:order";
  if (/^\/account(?:\/|$)/.test(path)) return "/account";
  if (/^\/info\/[^/]+\/?$/.test(path)) return "/info/:page";
  const exact = path.replace(/\/$/, "") || "/";
  return (ANALYTICS_PATHS as readonly string[]).includes(exact) ? exact as typeof ANALYTICS_PATHS[number] : "/other";
}

export function analyticsPageType(path: string): typeof PAGE_TYPES[number] {
  const p = analyticsPath(path);
  if (p === "/") return "home";
  if (p.startsWith("/p/")) return "product";
  if (p.startsWith("/c/")) return "category";
  if (p.startsWith("/collection/")) return "collection";
  if (p === "/login" || p === "/register") return "auth";
  if (p.startsWith("/order/")) return "order";
  if (p.startsWith("/info/")) return "info";
  return p.slice(1) as typeof PAGE_TYPES[number];
}
