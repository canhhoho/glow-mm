/**
 * Content-Security-Policy (P21). Hai mức:
 * - Storefront + file công khai (đặt trong next.config.ts): `script-src 'unsafe-inline'` vì Next 16 không gắn nonce
 *   được vào static shell (cacheComponents) — vẫn chặn script/khung/form/plugin từ domain lạ.
 * - Admin + cổng CTV (proxy.ts, luôn render theo request): nonce mỗi request + 'strict-dynamic' → script chèn vào
 *   trang không chạy được.
 * Thêm nguồn ngoài (CDN, analytics, …) thì sửa ở đây.
 */
export type CspOptions = {
  /** Có nonce → CSP chặt (admin/CTV). */
  nonce?: string;
  /** `next dev` cần 'unsafe-eval' (stack lỗi React) và WebSocket HMR. */
  dev: boolean;
  /** APP_URL là https → nâng request http lên https (giống HSTS; bỏ khi chạy http như Playwright/Docker local). */
  https: boolean;
};

export function buildCsp({ nonce, dev, https }: CspOptions): string {
  const script = nonce ? ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"] : ["'self'", "'unsafe-inline'"];
  if (dev) script.push("'unsafe-eval'");
  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    ["script-src", script],
    // Style thuộc tính (next/image, style={{}}) và <style> của trang in nhãn → giữ 'unsafe-inline' cho style.
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:"]],
    ["font-src", ["'self'"]],
    ["connect-src", dev ? ["'self'", "ws:"] : ["'self'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
    ["worker-src", ["'self'"]],
    ["manifest-src", ["'self'"]],
  ];
  if (https) directives.push(["upgrade-insecure-requests", []]);
  return directives.map(([name, values]) => [name, ...values].join(" ")).join("; ");
}

/** Nonce ngẫu nhiên base64 cho mỗi request (chạy được ở runtime của proxy). */
export function newNonce(): string {
  return btoa(crypto.randomUUID());
}
