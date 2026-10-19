import { describe, expect, it } from "vitest";
import { activeHref, blockedBefore, NAV, neededCounts, visibleNav } from "@/server/admin/nav";
import { classifyExpiry } from "@/server/alerts/compute";

const hrefs = NAV.flatMap((g) => g.items.map((i) => i.href));

describe("menu admin", () => {
  it("admin thấy mọi nhóm; mỗi href chỉ xuất hiện một lần", () => {
    const groups = visibleNav("ADMIN");
    expect(groups.map((g) => g.key)).toEqual([null, "groupSales", "groupStock", "groupCatalog", "groupContent", "groupSystem"]);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("lọc theo quyền, nhóm rỗng bị ẩn", () => {
    const staff = visibleNav("ORDER_STAFF");
    expect(staff.map((g) => g.key)).toEqual([null, "groupSales", "groupStock"]);
    const stock = staff.find((g) => g.key === "groupStock")!.items.map((i) => i.key);
    expect(stock).toEqual(["inventory", "documents", "quarantine", "alerts"]); // không có Chuyến hàng
    const wh = visibleNav("WAREHOUSE_MANAGER").flatMap((g) => g.items.map((i) => i.key));
    expect(wh).toContain("shipments");
    expect(wh).not.toContain("reviews");
    expect(wh).not.toContain("users");
  });

  it("chỉ tính badge của mục được thấy", () => {
    expect([...neededCounts(visibleNav("ADMIN"))].sort()).toEqual(["blockedLots", "pendingOrders", "quarantineLots"]);
    const onlyOrders = visibleNav("ORDER_STAFF").filter((g) => g.key !== "groupStock");
    expect([...neededCounts(onlyOrders)]).toEqual(["pendingOrders"]);
  });

  it("mục đang mở = tiền tố dài nhất theo đoạn; /admin chỉ khớp chính nó", () => {
    expect(activeHref("/admin", hrefs)).toBe("/admin");
    expect(activeHref("/admin/", hrefs)).toBe("/admin");
    expect(activeHref("/admin/inventory", hrefs)).toBe("/admin/inventory");
    expect(activeHref("/admin/inventory/batches/abc", hrefs)).toBe("/admin/inventory");
    expect(activeHref("/admin/inventory/documents/new", hrefs)).toBe("/admin/inventory/documents");
    expect(activeHref("/admin/inventory/quarantine", hrefs)).toBe("/admin/inventory/quarantine");
    expect(activeHref("/admin/orders/x1", hrefs)).toBe("/admin/orders");
    expect(activeHref("/admin/ordersx", hrefs)).toBeNull();
    expect(activeHref("/admin/account", hrefs)).toBeNull();
  });

  it("mốc ngừng bán khớp classifyExpiry", () => {
    const now = new Date("2026-10-19T20:30:00Z");
    const t = { blockDays: 90, warnDays: 180 };
    const cut = blockedBefore(now, t.blockDays);
    const dayBefore = new Date(cut.getTime() - 86_400_000);
    expect(classifyExpiry(dayBefore, now, t)).toBe("blocked");
    expect(classifyExpiry(cut, now, t)).toBe("near");
    expect(classifyExpiry(new Date("2026-10-18T00:00:00Z"), now, t)).toBe("expired");
  });
});
