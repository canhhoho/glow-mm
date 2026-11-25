import { expect, test } from "@playwright/test";
import { login } from "./helpers";

// P25 gói A: Cài đặt › Trợ lý AI (tạo token hiện một lần → gọi được cổng MCP → thu hồi → bị từ chối) và Nhật ký thao tác.

test("tạo token agent, gọi cổng MCP, thu hồi; nhật ký ghi lại", async ({ page, request }) => {
  test.setTimeout(120_000);
  await login(page, "admin@glow.local");
  await page.goto("/admin/settings/agents");
  await expect(page.getByRole("heading", { name: "Trợ lý AI" })).toBeVisible();

  const name = `e2e-agent-${Date.now()}`;
  await page.getByLabel("Tên agent").fill(name);
  const kho = page.getByLabel("Tài khoản thao tác").locator("option", { hasText: "Quản lý kho" }).first();
  await page.getByLabel("Tài khoản thao tác").selectOption(await kho.getAttribute("value"));
  await page.getByRole("button", { name: "Tạo token" }).click();
  const shown = page.getByTestId("action-secret");
  await expect(shown).toBeVisible();
  const token = await shown.inputValue();
  expect(token).toMatch(/^[0-9a-f]{64}$/);
  // Ô một dòng: không xuống dòng (chép đủ 64 ký tự), không tràn ngang trang.
  const box = (await shown.boundingBox())!;
  expect(box.height).toBeLessThan(60);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole("button", { name: "Sao chép token" })).toBeVisible();
  const row = page.getByTestId("agent-token-row").filter({ hasText: name });
  await expect(row).toContainText(token!.slice(0, 6));
  await page.screenshot({ path: "test-results/agents-page.png", fullPage: true });

  const call = () =>
    request.post("/api/agent/mcp", { headers: { authorization: `Bearer ${token}` }, data: { jsonrpc: "2.0", id: 1, method: "tools/list" } });
  const ok = await call();
  expect(ok.status()).toBe(200);
  const names = (await ok.json()).result.tools.map((t: { name: string }) => t.name);
  expect(names).toHaveLength(9); // quyền mặc định: 7 công cụ đọc + data_health (B1) + price_suggest (B3)
  expect(names).toContain("data_health");

  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: "Thu hồi" }).click();
  await expect(row).toContainText("Đã thu hồi");
  expect([401, 404]).toContain((await call()).status());

  await page.goto("/admin/settings/audit?action=agent");
  await expect(page.getByTestId("audit-row").filter({ hasText: "agent.token.revoke" }).first()).toBeVisible();
  await expect(page.getByTestId("audit-row").filter({ hasText: "agent.token.create" }).first()).toBeVisible();
  await page.screenshot({ path: "test-results/audit-page.png", fullPage: true });
});
