/**
 * Giỏ hàng lưu trong cookie (không cần đăng nhập, trang giỏ/checkout render phía server).
 * Định dạng: `variantId:qty,variantId:qty`. Thuần, không phụ thuộc Next/DB.
 * Giá và tồn KHÔNG nằm trong cookie — luôn đọc lại từ DB.
 */
export type CartLine = { variantId: string; qty: number };

export const CART_COOKIE = "cart";
export const CART_MAX_LINES = 20;
export const CART_MAX_QTY = 99;

const ID = /^[a-z0-9]{8,40}$/i;

export function parseCart(raw: string | undefined | null): CartLine[] {
  if (!raw) return [];
  const lines: CartLine[] = [];
  for (const part of raw.split(",")) {
    const [variantId, q] = part.split(":");
    const qty = Number(q);
    if (!variantId || !ID.test(variantId) || !Number.isInteger(qty) || qty <= 0) continue;
    if (lines.some((l) => l.variantId === variantId)) continue;
    lines.push({ variantId, qty: Math.min(qty, CART_MAX_QTY) });
    if (lines.length >= CART_MAX_LINES) break;
  }
  return lines;
}

export function serializeCart(lines: CartLine[]): string {
  return lines.map((l) => `${l.variantId}:${l.qty}`).join(",");
}

/** Đặt số lượng cho một biến thể (0 = xoá). Dòng mới thêm vào cuối. */
export function setLine(lines: CartLine[], variantId: string, qty: number): CartLine[] {
  if (!ID.test(variantId)) return lines;
  const q = Math.max(0, Math.min(CART_MAX_QTY, Math.floor(qty) || 0));
  const exists = lines.some((l) => l.variantId === variantId);
  if (q === 0) return lines.filter((l) => l.variantId !== variantId);
  if (exists) return lines.map((l) => (l.variantId === variantId ? { ...l, qty: q } : l));
  if (lines.length >= CART_MAX_LINES) return lines;
  return [...lines, { variantId, qty: q }];
}

export function addLine(lines: CartLine[], variantId: string, qty: number): CartLine[] {
  const cur = lines.find((l) => l.variantId === variantId)?.qty ?? 0;
  return setLine(lines, variantId, cur + Math.max(1, Math.floor(qty) || 1));
}

export function cartCount(lines: CartLine[]): number {
  return lines.reduce((s, l) => s + l.qty, 0);
}

/** Đơn khách đã đặt/tra cứu trên trình duyệt này: cho phép xem đơn + gửi biên lai mà không phải nhập lại SĐT. */
export const ORDERS_COOKIE = "my_orders";
export type OrderAccess = { c: string; p: string };

export function parseOrderAccess(raw: string | undefined | null): OrderAccess[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v)
      ? v.filter((x): x is OrderAccess => typeof x?.c === "string" && typeof x?.p === "string").slice(0, 10)
      : [];
  } catch {
    return [];
  }
}

export function addOrderAccess(list: OrderAccess[], entry: OrderAccess): OrderAccess[] {
  return [entry, ...list.filter((x) => x.c !== entry.c)].slice(0, 10);
}
