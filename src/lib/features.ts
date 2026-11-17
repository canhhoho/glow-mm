/**
 * Cờ tính năng (16/11/2026). `false` = TẮT: ẩn khỏi menu / nút / trang và chặn server action, nhưng KHÔNG xoá code,
 * bảng hay cột dữ liệu — sẽ phát triển tiếp sau, bật lại bằng cách đổi giá trị ở đây.
 * Chỉ gắn cờ ở lớp giao diện / trang / action; hàm domain (`previewRun`, `allocateShipment`…) không kiểm cờ để test gọi thẳng được.
 *
 * - `autoPricing`: module giá tự động (bảng tính giá `previewRun`/`applyRun`, "Tính tự động"). Giá bán chỉ đặt thủ công.
 * - `shipments`: chuyến hàng (phân bổ chi phí về kho, cước tạm tính, giá vốn tạm). Giá vốn lô = giá mua × tỷ giá.
 * - `expiry`: quản lý hạn sử dụng (chặn bán theo ngưỡng, phân loại cận date/hết hạn, bắt buộc nhập hạn). Tắt = full hạn sử dụng, không chặn bán.
 *
 * Thuần (không import Next/Prisma) → dùng được ở component client và Vitest.
 */
export const FEATURES = {
  autoPricing: false,
  shipments: false,
  expiry: false,
} as const;

export type FeatureKey = keyof typeof FEATURES;

export const featureOn = (key: FeatureKey): boolean => FEATURES[key];
