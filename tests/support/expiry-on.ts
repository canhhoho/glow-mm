/**
 * Bật cờ hạn dùng trong một file test (`FEATURES.expiry` đang tắt ở production — 17/11/2026) để giữ kiểm thử quy tắc
 * hạn dùng cho lúc bật lại. Dùng ở đầu file test:
 *
 *   vi.mock("@/lib/features", async (orig) => (await import("../support/expiry-on")).expiryOn(orig));
 */
type FeaturesModule = typeof import("@/lib/features");

export async function expiryOn(importOriginal: () => Promise<unknown>): Promise<FeaturesModule> {
  const real = (await importOriginal()) as FeaturesModule;
  const FEATURES = { ...real.FEATURES, expiry: true } as unknown as FeaturesModule["FEATURES"];
  return { ...real, FEATURES, featureOn: (key) => FEATURES[key] };
}
