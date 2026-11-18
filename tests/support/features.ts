/**
 * Bật/tắt cờ tính năng trong một file test (giữ kiểm thử quy tắc của tính năng đang tắt ở production). Dùng ở đầu file:
 *
 *   vi.mock("@/lib/features", async (orig) => (await import("../support/features")).featuresWith(orig, { autoPricing: true }));
 */
type FeaturesModule = typeof import("@/lib/features");
type FeatureKey = import("@/lib/features").FeatureKey;

export async function featuresWith(importOriginal: () => Promise<unknown>, over: Partial<Record<FeatureKey, boolean>>): Promise<FeaturesModule> {
  const real = (await importOriginal()) as FeaturesModule;
  const FEATURES = { ...real.FEATURES, ...over } as unknown as FeaturesModule["FEATURES"];
  return { ...real, FEATURES, featureOn: (key) => FEATURES[key] };
}
