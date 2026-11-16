import { describe, expect, it, vi } from "vitest";
import { FEATURES, featureOn } from "@/lib/features";

const nav = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
}));
vi.mock("next/navigation", () => nav);
import { assertFeature, FEATURE_OFF_MESSAGE, requireFeature } from "@/server/feature-guard";

describe("Cờ tính năng (16/11/2026)", () => {
  it("giá tự động và chuyến hàng đang tắt", () => {
    expect(FEATURES).toEqual({ autoPricing: false, shipments: false });
    expect(featureOn("autoPricing")).toBe(false);
    expect(featureOn("shipments")).toBe(false);
  });

  it("action của tính năng tắt bị chặn ở phía server", () => {
    expect(() => assertFeature("autoPricing")).toThrow(FEATURE_OFF_MESSAGE);
    expect(() => assertFeature("shipments")).toThrow(FEATURE_OFF_MESSAGE);
  });

  it("trang của tính năng tắt: 404 hoặc chuyển sang trang thay thế", () => {
    expect(() => requireFeature("shipments")).toThrow("NEXT_NOT_FOUND");
    expect(() => requireFeature("shipments", { redirectTo: "/admin/inventory" })).toThrow("NEXT_REDIRECT:/admin/inventory");
  });
});
