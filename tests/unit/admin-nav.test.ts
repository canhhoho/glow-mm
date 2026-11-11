import { describe, expect, it } from "vitest";
import { activeHref, NAV, neededCounts, visibleNav } from "@/server/admin/nav";
import { classifyExpiry } from "@/server/alerts/compute";
import { sellableCutoff } from "@/server/inventory/fefo";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { can, ROLES } from "@/server/auth/roles";

const hrefs = NAV.flatMap((g) => g.items.map((i) => i.href));

describe("menu admin", () => {
  it("admin thấy mọi nhóm; mỗi href chỉ xuất hiện một lần", () => {
    const groups = visibleNav("ADMIN");
    expect(groups.map((g) => g.key)).toEqual([null, "orders", "products", "groupStock", "groupPublishing", "groupAccounts", "affiliates", "reports", "settings"]);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("lọc theo quyền, nhóm rỗng bị ẩn", () => {
    const staff = visibleNav("ORDER_STAFF");
    expect(staff.map((g) => g.key)).toEqual([null, "orders", "groupStock"]);
    const stock = staff.find((g) => g.key === "groupStock")!.items.map((i) => i.key);
    expect(stock).toEqual(["inventory", "documents", "quarantine", "alerts"]); // không có Chuyến hàng
    const wh = visibleNav("WAREHOUSE_MANAGER").flatMap((g) => g.items.map((i) => i.key));
    expect(wh).toContain("shipments");
    expect(wh).not.toContain("reviews");
    expect(wh).not.toContain("users");
  });

  it("mọi mục chỉ hiển thị với đúng quyền, kể cả mục lồng trong Cài đặt", () => {
    for (const role of ROLES) {
      const shown = visibleNav(role).flatMap(g => g.items).map(i => i.href);
      expect(shown.sort()).toEqual(NAV.flatMap(g => g.items).filter(i => can(role, i.permission)).map(i => i.href).sort());
    }
    expect(visibleNav("ADMIN").find(g => g.key === "groupAccounts")?.items.map(i => i.href)).toEqual([
      "/admin/users", "/admin/customer-accounts",
    ]);
    // Danh sách CTV chỉ nằm ở nhóm Cộng tác viên (không lặp ở Tài khoản).
    expect(visibleNav("ADMIN").find(g => g.key === "affiliates")?.items.map(i => i.href)).toEqual([
      "/admin/affiliates", "/admin/affiliates/applications", "/admin/affiliates/commissions",
    ]);
    expect(visibleNav("ADMIN").find(g => g.key === "settings")?.items.filter(i => i.section).map(i => i.href)).toEqual([
      "/admin/content/banners", "/admin/content/collections",
    ]);
  });

  it("mọi đường dẫn menu có trang thật và nhãn đủ ba ngôn ngữ", () => {
    const root = path.resolve(import.meta.dirname, "../..");
    for (const href of hrefs) {
      const route = href.replace(/\?.*$/, "").replace(/^\/admin\/?/, ""); // mục lọc sẵn (?status=…) dùng trang gốc
      expect(existsSync(path.join(root, "src/app/admin/(panel)", route, "page.tsx")), href).toBe(true);
    }
    for (const locale of ["vi", "en", "my"]) {
      const labels = JSON.parse(readFileSync(path.join(root, `messages/admin.${locale}.json`), "utf8")).Nav;
      for (const group of NAV) {
        if (group.key) expect(labels[group.key], `${locale}:${group.key}`).toBeTruthy();
        for (const item of group.items) {
          expect(labels[item.key], `${locale}:${item.key}`).toBeTruthy();
          if (item.section) expect(labels[item.section], `${locale}:${item.section}`).toBeTruthy();
        }
      }
    }
  });

  it("chỉ tính badge của mục được thấy", () => {
    expect([...neededCounts(visibleNav("ADMIN"))].sort()).toEqual(["awaitingStock", "blockedLots", "catalogIncomplete", "catalogPublished", "catalogReview", "pendingApplications", "pendingOrders", "quarantineLots"]);
    const onlyOrders = visibleNav("ORDER_STAFF").filter((g) => g.key !== "groupStock");
    expect([...neededCounts(onlyOrders)].sort()).toEqual(["awaitingStock", "pendingOrders"]);
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
    expect(activeHref("/admin/orders/cod", hrefs)).toBe("/admin/orders/cod");
    expect(activeHref("/admin/affiliates/abc", hrefs)).toBe("/admin/affiliates");
    expect(activeHref("/admin/affiliates/applications", hrefs)).toBe("/admin/affiliates/applications");
    expect(activeHref("/admin/affiliates/commissions", hrefs)).toBe("/admin/affiliates/commissions");
    expect(activeHref("/admin/reports/data-health", hrefs)).toBe("/admin/reports/data-health");
    expect(activeHref("/admin/content/banners/new", hrefs)).toBe("/admin/content/banners");
  });

  it("mốc ngừng bán (badge Cảnh báo) khớp classifyExpiry", () => {
    const now = new Date("2026-10-19T20:30:00Z");
    const t = { blockDays: 90, warnDays: 180 };
    const cut = sellableCutoff(now, t.blockDays);
    const dayBefore = new Date(cut.getTime() - 86_400_000);
    expect(classifyExpiry(dayBefore, now, t)).toBe("blocked");
    expect(classifyExpiry(cut, now, t)).toBe("near");
    expect(classifyExpiry(new Date("2026-10-18T00:00:00Z"), now, t)).toBe("expired");
  });
});
