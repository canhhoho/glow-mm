/**
 * G1 (audit storefront 18, 25/11/2026): trang chủ bớt lặp khi shop còn ít SP. Dải danh mục bị ẩn khi trống, hoặc khi
 * danh mục có ÍT hơn một dải (`rail.length < railSize` — không còn SP nào khác để "Xem thêm") và mọi SP của dải đã nằm
 * trong dải "Sản phẩm mới" phía trên. Catalog lớn (dải đầy) giữ nguyên cấu trúc. Ô "Nhóm hàng" vẫn đủ link tới từng
 * danh mục. Hàm thuần (unit test).
 */
export function railsToShow<T extends { slug: string }>(shown: T[], rails: T[][], railSize: number): boolean[] {
  const seen = new Set(shown.map((p) => p.slug));
  return rails.map((r) => r.length > 0 && (r.length >= railSize || r.some((p) => !seen.has(p.slug))));
}
