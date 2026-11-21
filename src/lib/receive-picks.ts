/**
 * Chọn sẵn phân loại cho phiếu nhập từ nơi khác (Cảnh báo › Tồn thấp / Gợi ý đặt hàng — 20/11/2026):
 * `/admin/inventory/documents/new?type=RECEIVE&pick=<variantId>[:<qty>]&pick=…`. `qty` = số lượng gợi ý điền sẵn
 * (thay SL dự kiến nhập); không có → giữ gợi ý mặc định của form. Thuần, dùng ở cả trang gửi lẫn trang nhận.
 */
export type ReceivePick = { id: string; qty?: number };

export const MAX_RECEIVE_PICKS = 200;
const ID = /^[a-z0-9]{1,40}$/i;

export function receivePicksHref(picks: ReceivePick[]): string {
  const qs = new URLSearchParams({ type: "RECEIVE" });
  for (const p of picks.slice(0, MAX_RECEIVE_PICKS)) qs.append("pick", p.qty != null && p.qty > 0 ? `${p.id}:${Math.floor(p.qty)}` : p.id);
  return `/admin/inventory/documents/new?${qs}`;
}

/** Đọc `pick` từ searchParams: bỏ giá trị sai, trùng (giữ lần đầu), quá giới hạn; qty phải là số nguyên > 0. */
export function parseReceivePicks(raw: string | string[] | undefined): ReceivePick[] {
  const list = (Array.isArray(raw) ? raw : raw ? [raw] : []).slice(0, MAX_RECEIVE_PICKS);
  const seen = new Set<string>();
  const out: ReceivePick[] = [];
  for (const item of list) {
    const [id, q] = item.split(":");
    if (!ID.test(id) || seen.has(id)) continue;
    seen.add(id);
    const qty = q !== undefined && /^\d{1,7}$/.test(q) && Number(q) > 0 ? Number(q) : undefined;
    out.push(qty ? { id, qty } : { id });
  }
  return out;
}
