import { describe, expect, it } from "vitest";
import { buildCsp, newNonce } from "@/lib/csp";

const directive = (csp: string, name: string) => csp.split("; ").find((d) => d === name || d.startsWith(`${name} `));

describe("Content-Security-Policy (P21)", () => {
  it("storefront: script 'unsafe-inline', không nonce, không eval; chặn plugin/khung/form lạ", () => {
    const csp = buildCsp({ dev: false, https: false });
    expect(directive(csp, "script-src")).toBe("script-src 'self' 'unsafe-inline'");
    expect(directive(csp, "object-src")).toBe("object-src 'none'");
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(csp, "form-action")).toBe("form-action 'self'");
    expect(directive(csp, "connect-src")).toBe("connect-src 'self'");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("admin/CTV: nonce + 'strict-dynamic', không 'unsafe-inline' trong script-src", () => {
    const csp = buildCsp({ nonce: "abc123", dev: false, https: false });
    expect(directive(csp, "script-src")).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(directive(csp, "style-src")).toBe("style-src 'self' 'unsafe-inline'");
  });

  it("upgrade-insecure-requests chỉ khi https; dev thêm unsafe-eval + ws:", () => {
    expect(directive(buildCsp({ dev: false, https: true }), "upgrade-insecure-requests")).toBe("upgrade-insecure-requests");
    expect(directive(buildCsp({ dev: false, https: false }), "upgrade-insecure-requests")).toBeUndefined();
    const dev = buildCsp({ nonce: "n", dev: true, https: false });
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
    expect(directive(dev, "connect-src")).toBe("connect-src 'self' ws:");
  });

  it("nonce mỗi lần một khác, dạng base64", () => {
    const a = newNonce();
    expect(a).not.toBe(newNonce());
    expect(a).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
});
