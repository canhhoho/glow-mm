import { expect, test } from "@playwright/test";

// P10: link giới thiệu CTV → cookie 30 ngày, URL bỏ `ref`.

test("link ?ref= ghi cookie CTV rồi chuyển về URL sạch (giữ query khác)", async ({ page, context }) => {
  await page.goto("/en/c/skincare?ref=maung01&sort=new");
  await expect(page).toHaveURL(/\/en\/c\/skincare\?sort=new$/);
  const ref = (await context.cookies()).find((c) => c.name === "glow_ref");
  expect(ref).toMatchObject({ value: "MAUNG01", httpOnly: true });
  expect(ref!.expires - Date.now() / 1000).toBeGreaterThan(29 * 24 * 60 * 60);
});

test("mã sai định dạng: không ghi cookie, vẫn bỏ ref khỏi URL", async ({ page, context }) => {
  await page.goto("/en?ref=bad!");
  await expect(page).toHaveURL(/\/en$/);
  expect((await context.cookies()).find((c) => c.name === "glow_ref")).toBeUndefined();
});
