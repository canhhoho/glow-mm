import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AdminShell } from "@/components/admin/admin-shell";
import { visibleNav } from "@/server/admin/nav";
import labels from "../../messages/admin.vi.json";

const router = vi.hoisted(() => ({ pathname: "/admin" }));
vi.mock("next/navigation", () => ({ usePathname: () => router.pathname }));
vi.mock("next/link", () => ({ default: (props: ComponentProps<"a">) => createElement("a", props) }));

function renderMenu(pathname: string, role: "ADMIN" | "ORDER_STAFF" = "ADMIN") {
  router.pathname = pathname;
  const t = labels.Nav as Record<string, string>;
  const props: Omit<ComponentProps<typeof AdminShell>, "children"> = {
    groups: visibleNav(role).map(g => ({
      label: g.key ? t[g.key] : null, icon: g.icon,
      items: g.items.map(i => ({ href: i.href, label: t[i.key], icon: i.icon, match: i.match })),
    })),
    labels: { subtitle: "Quản trị", menu: "Mở menu", close: "Đóng menu", breadcrumb: "Vị trí trang" },
    header: null,
  };
  return renderToStaticMarkup(createElement(AdminShell, props as ComponentProps<typeof AdminShell>, null));
}

describe("admin shell accordion", () => {
  it("shows the dashboard with five collapsed menu groups", () => {
    const html = renderMenu("/admin");
    expect(html.match(/class="group\/nav"/g)).toHaveLength(5); // Đơn hàng, Sản phẩm, Kho hàng, Báo cáo, Cài đặt
    expect(html).not.toContain('<details open=""');
    expect(html).toContain('href="/admin" aria-current="page"');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });

  it("opens Settings and marks website content for any content route", () => {
    for (const path of ["/admin/content/banners/new", "/admin/content/collections"]) {
      const html = renderMenu(path);
      expect(html.match(/<details open=""/g)).toHaveLength(1);
      expect(html).toContain('href="/admin/content/banners" aria-current="page"');
      expect(html).toMatch(/aria-label="Vị trí trang"[^]*?Cài đặt[^]*?Nội dung website/);
    }
  });

  it("keeps staff and customer accounts under one Settings item", () => {
    for (const path of ["/admin/users/abc", "/admin/customer-accounts", "/admin/customer-accounts/c1"]) {
      const html = renderMenu(path);
      expect(html).toContain('href="/admin/users" aria-current="page"');
      expect(html.match(/aria-current="page"/g)).toHaveLength(1);
      expect(html).toMatch(/aria-label="Vị trí trang"[^]*?Cài đặt[^]*?Tài khoản/);
    }
  });

  it("keeps affiliate pages under Orders › CTV & hoa hồng", () => {
    for (const path of ["/admin/affiliates", "/admin/affiliates/person-1", "/admin/affiliates/applications", "/admin/affiliates/commissions"]) {
      const html = renderMenu(path);
      const group = html.match(/<details open="" class="group\/nav">([^]*?)<\/summary>/)?.[1];
      expect(group, path).toContain("Đơn hàng");
      expect(html).toContain('href="/admin/affiliates" aria-current="page"');
      expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    }
  });

  it("keeps old shortcut pages lit under their new parent item", () => {
    const cases: [string, string][] = [
      ["/admin/orders/preorders", "/admin/orders"],
      ["/admin/alerts", "/admin/inventory"],
      ["/admin/inventory/quarantine", "/admin/inventory"],
      ["/admin/pricing/runs/r1", "/admin/selling-prices"],
    ];
    for (const [path, active] of cases) {
      const html = renderMenu(path);
      expect(html, path).toContain(`href="${active}" aria-current="page"`);
      expect(html.match(/aria-current="page"/g), path).toHaveLength(1);
    }
  });

  it("does not render protected account and COD links for order staff", () => {
    const html = renderMenu("/admin/orders", "ORDER_STAFF");
    expect(html.match(/class="group\/nav"/g)).toHaveLength(2);
    for (const href of ["/admin/users", "/admin/customer-accounts", "/admin/orders/cod", "/admin/affiliates"]) {
      expect(html).not.toContain(`href="${href}"`);
    }
  });
});
