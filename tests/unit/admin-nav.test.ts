import { describe, expect, it } from "vitest";
import { activeHref, NAV, neededCounts, visibleNav } from "@/server/admin/nav";
import { classifyExpiry } from "@/server/alerts/compute";
import { sellableCutoff } from "@/server/inventory/fefo";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { can, ROLES } from "@/server/auth/roles";
import { FEATURES } from "@/lib/features";

const hrefs = NAV.flatMap((g) => g.items.map((i) => i.href));
const entries = NAV.flatMap((g) => g.items.map((i) => ({ href: i.href, match: i.match })));

describe("menu admin", () => {
  it("admin thấy mọi nhóm; mỗi href chỉ xuất hiện một lần", () => {
    const groups = visibleNav("ADMIN");
    expect(groups.map((g) => g.key)).toEqual([null, "orders", "products", "groupStock", "reports", "settings"]);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("lọc theo quyền, nhóm rỗng bị ẩn", () => {
    const staff = visibleNav("ORDER_STAFF");
    expect(staff.map((g) => g.key)).toEqual([null, "orders", "groupStock"]);
    const stock = staff.find((g) => g.key === "groupStock")!.items.map((i) => i.key);
    expect(stock).toEqual(["inventory", "documents"]); // không có Chuyến hàng; Chờ kiểm tra/Cảnh báo là lối tắt trong Tồn kho
    const wh = visibleNav("WAREHOUSE_MANAGER").flatMap((g) => g.items.map((i) => i.key));
    // Chuyến hàng đang tắt (`lib/features.ts`) → không có trong menu dù có quyền; bật cờ thì mục hiện lại.
    expect(FEATURES.shipments).toBe(false);
    expect(wh).not.toContain("shipments");
    expect(visibleNav("WAREHOUSE_MANAGER", NAV.map((g) => ({ ...g, items: g.items.map((i) => ({ ...i, feature: undefined })) }))).flatMap((g) => g.items.map((i) => i.key))).toContain("shipments");
    expect(wh).not.toContain("reviews");
    expect(wh).not.toContain("users");
  });

  it("mọi mục chỉ hiển thị với đúng quyền, kể cả mục lồng trong Cài đặt", () => {
    for (const role of ROLES) {
      const shown = visibleNav(role).flatMap(g => g.items).map(i => i.href);
      expect(shown.sort()).toEqual(NAV.flatMap(g => g.items).filter(i => can(role, i.permission) && (!i.feature || FEATURES[i.feature])).map(i => i.href).sort());
    }
    // Hồ sơ/đăng ký/hoa hồng CTV, nhân viên/khách, banner/bộ sưu tập là tab của một mục, không phải mục menu riêng.
    const all = visibleNav("ADMIN").flatMap(g => g.items).map(i => i.href);
    for (const gone of ["/admin/affiliates/applications", "/admin/affiliates/commissions", "/admin/customer-accounts", "/admin/content/collections", "/admin/alerts", "/admin/inventory/quarantine", "/admin/orders/preorders"]) {
      expect(all).not.toContain(gone);
    }
    expect(visibleNav("ADMIN").find(g => g.key === "reports")?.items.map(i => i.href)).toEqual([
      "/admin/reports", "/admin/reports/inventory", "/admin/reports/analytics", "/admin/reports/data-health",
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
        }
      }
    }
  });

  it("chỉ tính badge của mục được thấy", () => {
    expect([...neededCounts(visibleNav("ADMIN"))].sort()).toEqual(["agentDrafts", "lowStock", "passwordResets", "pendingApplications", "pendingOrders", "pendingReviews", "quarantineLots"]);
    const onlyOrders = visibleNav("ORDER_STAFF").filter((g) => g.key !== "groupStock");
    expect([...neededCounts(onlyOrders)].sort()).toEqual(["pendingOrders", "pendingReviews"]);
  });

  it("mục đang mở = tiền tố dài nhất theo đoạn; /admin chỉ khớp chính nó", () => {
    expect(activeHref("/admin", entries)).toBe("/admin");
    expect(activeHref("/admin/", entries)).toBe("/admin");
    expect(activeHref("/admin/inventory", entries)).toBe("/admin/inventory");
    expect(activeHref("/admin/inventory/batches/abc", entries)).toBe("/admin/inventory");
    expect(activeHref("/admin/inventory/documents/new", entries)).toBe("/admin/inventory/documents");
    expect(activeHref("/admin/inventory/quarantine", entries)).toBe("/admin/inventory");
    expect(activeHref("/admin/orders/x1", entries)).toBe("/admin/orders");
    expect(activeHref("/admin/ordersx", entries)).toBeNull();
    expect(activeHref("/admin/account", entries)).toBeNull();
    expect(activeHref("/admin/orders/cod", entries)).toBe("/admin/orders/cod");
    expect(activeHref("/admin/affiliates/abc", entries)).toBe("/admin/affiliates");
    expect(activeHref("/admin/affiliates/applications", entries)).toBe("/admin/affiliates");
    expect(activeHref("/admin/affiliates/commissions", entries)).toBe("/admin/affiliates");
    expect(activeHref("/admin/reports/data-health", entries)).toBe("/admin/reports/data-health");
    expect(activeHref("/admin/content/banners/new", entries)).toBe("/admin/content/banners");
    expect(activeHref("/admin/content/collections/c1", entries)).toBe("/admin/content/banners");
    expect(activeHref("/admin/customer-accounts/c1", entries)).toBe("/admin/users");
    expect(activeHref("/admin/alerts", entries)).toBe("/admin/inventory");
    expect(activeHref("/admin/orders/preorders", entries)).toBe("/admin/orders");
    expect(activeHref("/admin/pricing/runs/r1", entries)).toBe("/admin/selling-prices");
    expect(activeHref("/admin/reports/inventory", entries)).toBe("/admin/reports/inventory");
    expect(activeHref("/admin/settings/warehouses", entries)).toBe("/admin/settings/warehouses");
    expect(activeHref("/admin/settings", entries)).toBe("/admin/settings");
    expect(activeHref("/admin/account", entries)).toBeNull();
  });

  it("mốc ngừng bán (badge Cảnh báo) khớp classifyExpiry khi tắt hạn dùng", () => {
    const now = new Date("2026-10-19T20:30:00Z");
    const t = { blockDays: 90, warnDays: 180 };
    const cut = sellableCutoff(now, t.blockDays);
    const dayBefore = new Date(cut.getTime() - 86_400_000);
    expect(classifyExpiry(dayBefore, now, t)).toBeNull();
    expect(classifyExpiry(cut, now, t)).toBeNull();
    expect(classifyExpiry(new Date("2026-10-18T00:00:00Z"), now, t)).toBeNull();
  });
});
