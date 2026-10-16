import { expect, test } from "@playwright/test";
import zlib from "node:zlib";
import { login } from "./helpers";

const SLUG = "sen-viet-sunscreen-spf50";
/** PNG đặc một màu size×size (đủ lớn để bộ tối ưu ảnh/next/image và trình duyệt giải mã bình thường). */
function solidPng(size: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => [232, 101, 122]).flat())]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const PNG = solidPng(64);

test("admin tải ảnh sản phẩm → hiện trên trang sản phẩm → xoá ảnh", async ({ page }) => {
  test.setTimeout(90_000);
  const alt = `E2E ảnh ${Date.now()}`;
  await login(page, "admin@glow.local");
  await page.goto(`/admin/products?q=${SLUG}`);
  await page.getByRole("row", { name: new RegExp(SLUG) }).getByRole("link").click();
  await expect(page).toHaveURL(/\/admin\/products\/[^/?]+$/);
  const adminUrl = page.url();

  const section = page.getByRole("region", { name: "Ảnh", exact: true });
  const rows = section.getByTestId("product-image");
  const before = await rows.count();
  await section.getByLabel("Chọn ảnh sản phẩm").setInputFiles({ name: "e2e.png", mimeType: "image/png", buffer: PNG });
  await section.getByRole("button", { name: "Tải lên" }).click();
  await expect(section.getByRole("status").filter({ hasText: "Đã tải ảnh lên" })).toBeVisible();
  await expect(rows).toHaveCount(before + 1);

  const mine = rows.last();
  await mine.getByLabel("Mô tả ảnh (alt)").fill(alt);
  await mine.getByRole("button", { name: "Lưu mô tả" }).click();
  // Lần đầu tối ưu ảnh (sharp) trên server lạnh có thể chậm vài giây.
  await expect(mine.getByRole("status").filter({ hasText: "Đã lưu" })).toBeVisible({ timeout: 20_000 });
  await expect(mine.getByRole("img", { name: alt })).toBeVisible();
  await page.screenshot({ path: "test-results/screens/product-images-admin.png", fullPage: true });

  try {
    await page.goto(`/en/p/${SLUG}`);
    const img = page.getByRole("img", { name: alt });
    await expect(img).toBeVisible();
    // Ảnh thật sự tải được (qua /api/files + bộ tối ưu next/image).
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
    await page.screenshot({ path: "test-results/screens/product-images-store.png", fullPage: true });
  } finally {
    // Dọn: xoá ảnh vừa thêm để không ảnh hưởng test khác.
    await page.goto(adminUrl);
    const row = page.getByRole("region", { name: "Ảnh", exact: true }).getByTestId("product-image").filter({ has: page.getByRole("img", { name: alt }) });
    page.once("dialog", (d) => d.accept());
    await row.getByRole("button", { name: "Xoá ảnh" }).click();
    await expect(row).toHaveCount(0);
  }

  await page.goto(`/en/p/${SLUG}`);
  await expect(page.getByRole("img", { name: alt })).toHaveCount(0);
});
