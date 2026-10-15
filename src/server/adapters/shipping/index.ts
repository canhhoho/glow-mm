/**
 * Adapter vận chuyển. Phase 1: thủ công (phí theo bảng ShippingRate, nhập mã vận đơn tay).
 * Hãng có API sau này [CẦN XÁC MINH]: thêm ShippingProvider mới.
 */
export type ShippingQuote = { feeMmk: number; etaDays?: number | null };

export interface ShippingProvider {
  code: string;
  quote(input: { zoneId: string; subtotalMmk: number }): Promise<ShippingQuote | null>;
  createShipment?(input: { orderCode: string }): Promise<{ trackingNo: string }>;
}

type RateLookup = (zoneId: string) => Promise<{ feeMmk: number; freeFromMmk: number | null; etaDays: number | null } | null>;

export function manualShipping(findRate: RateLookup): ShippingProvider {
  return {
    code: "manual",
    async quote({ zoneId, subtotalMmk }) {
      const rate = await findRate(zoneId);
      if (!rate) return null;
      const free = rate.freeFromMmk != null && subtotalMmk >= rate.freeFromMmk;
      return { feeMmk: free ? 0 : rate.feeMmk, etaDays: rate.etaDays };
    },
  };
}
