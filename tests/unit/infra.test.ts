import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { isAuthorizedCron } from "@/server/cron/auth";
import { LocalDiskStorage } from "@/server/adapters/storage/local";
import { manualShipping } from "@/server/adapters/shipping";

describe("cron auth", () => {
  const secret = "test-cron-secret-123";
  it("chấp nhận đúng Bearer secret", () => {
    expect(isAuthorizedCron(`Bearer ${secret}`, secret)).toBe(true);
  });
  it("từ chối sai/thiếu", () => {
    expect(isAuthorizedCron(`Bearer wrong`, secret)).toBe(false);
    expect(isAuthorizedCron(null, secret)).toBe(false);
    expect(isAuthorizedCron(`Bearer ${secret}`, undefined)).toBe(false);
  });
});

describe("local storage adapter", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "glow-storage-"));
  const s = new LocalDiskStorage(dir);
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it("put → get → delete", async () => {
    const f = await s.put("receipts/a.png", Buffer.from("x"), "image/png");
    expect(f.url).toBe("/api/files/receipts/a.png");
    expect((await s.get("receipts/a.png"))?.mime).toBe("image/png");
    await s.delete("receipts/a.png");
    expect(await s.get("receipts/a.png")).toBeNull();
  });

  it("chặn path traversal", async () => {
    await expect(s.put("../evil", Buffer.from("x"), "text/plain")).rejects.toThrow();
    await expect(s.put("/abs", Buffer.from("x"), "text/plain")).rejects.toThrow();
  });
});

describe("manual shipping", () => {
  const ship = manualShipping(async (zoneId) =>
    zoneId === "z1" ? { feeMmk: 2500, freeFromMmk: 100_000, etaDays: 2 } : null,
  );
  it("tính phí theo vùng và miễn phí theo ngưỡng", async () => {
    expect(await ship.quote({ zoneId: "z1", subtotalMmk: 50_000 })).toEqual({ feeMmk: 2500, etaDays: 2 });
    expect(await ship.quote({ zoneId: "z1", subtotalMmk: 100_000 })).toEqual({ feeMmk: 0, etaDays: 2 });
    expect(await ship.quote({ zoneId: "nope", subtotalMmk: 1 })).toBeNull();
  });
});
