/**
 * Adapter vận chuyển. Hiện tại thủ công: nhân viên nhập đơn vị vận chuyển + mã vận đơn khi giao.
 * Phí ship do đơn vị vận chuyển (VTP Myanmar) thu trực tiếp khi giao (P15) → web không tính phí.
 * Đẩy đơn qua API VTP sau này [CẦN XÁC MINH]: thêm ShippingProvider dùng mã VTP 3 cấp chốt trên đơn.
 */
export interface ShippingProvider {
  code: string;
  createShipment?(input: { orderCode: string }): Promise<{ trackingNo: string }>;
}
