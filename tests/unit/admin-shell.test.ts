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
      items: g.items.map(i => ({ href: i.href, label: t[i.key], icon: i.icon, section: i.section ? t[i.section] : undefined })),
    })),
    labels: { subtitle: "Quản trị", menu: "Mở menu", close: "Đóng menu", breadcrumb: "Vị trí trang" },
    header: null,
  };
  return renderToStaticMarkup(createElement(AdminShell, props as ComponentProps<typeof AdminShell>, null));
}

describe("admin shell accordion", () => {
  it("shows the dashboard with seven collapsed menu groups", () => {
    const html = renderMenu("/admin");
    expect(html.match(/class="group\/nav"/g)).toHaveLength(7);
    expect(html).not.toContain('<details open=""');
    expect(html).toContain('href="/admin" aria-current="page"');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });

  it("opens both Settings and Homepage content for a nested banner route", () => {
    const html = renderMenu("/admin/content/banners/new");
    expect(html).toContain('<details open="" class="group/nav">');
    expect(html).toContain('<details open="" class="group/section">');
    expect(html.match(/<details open=""/g)).toHaveLength(2);
    expect(html).toContain('href="/admin/content/banners" aria-current="page"');
    expect(html).toMatch(/aria-label="Vị trí trang"[^]*?Cài đặt[^]*?Nội dung trang chủ[^]*?Banner/);
  });

  it("keeps affiliate list, profile and commission pages under the Affiliates group", () => {
    const profile = renderMenu("/admin/affiliates/person-1");
    const profileGroup = profile.match(/<details open="" class="group\/nav">([^]*?)<\/summary>/)?.[1];
    expect(profileGroup).toContain("Cộng tác viên");
    expect(profile).toContain('href="/admin/affiliates" aria-current="page"');
    const commissions = renderMenu("/admin/affiliates/commissions");
    const commissionGroup = commissions.match(/<details open="" class="group\/nav">([^]*?)<\/summary>/)?.[1];
    expect(commissionGroup).toContain("Cộng tác viên");
    expect(commissions).toContain('href="/admin/affiliates/commissions" aria-current="page"');
    expect(commissions.match(/aria-current="page"/g)).toHaveLength(1);
  });

  it("does not render protected account and COD links for order staff", () => {
    const html = renderMenu("/admin/orders", "ORDER_STAFF");
    expect(html.match(/class="group\/nav"/g)).toHaveLength(2);
    for (const href of ["/admin/users", "/admin/customer-accounts", "/admin/orders/cod", "/admin/affiliates"]) {
      expect(html).not.toContain(`href="${href}"`);
    }
  });
});
