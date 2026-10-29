import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";
import { BRAND_NAME } from "@/lib/brand";

// P18: tên hiển thị "T&C Cosmetics" — không còn sót tên cũ trong manifest / chuỗi giao diện.
describe("thương hiệu", () => {
  it("manifest PWA dùng BRAND_NAME", () => {
    const m = manifest();
    expect(m.short_name).toBe(BRAND_NAME);
    expect(m.name).toMatch(new RegExp(`^${BRAND_NAME} — `));
  });

  it("messages/*.json không còn tên cũ Glow VN", async () => {
    const dir = path.join(process.cwd(), "messages");
    for (const f of (await readdir(dir)).filter((f) => f.endsWith(".json"))) {
      expect(await readFile(path.join(dir, f), "utf8"), f).not.toMatch(/Glow VN/);
    }
  });
});
