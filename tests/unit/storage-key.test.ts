import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { LocalDiskStorage } from "@/server/adapters/storage/local";
import { assertSafeKey } from "@/server/adapters/storage/types";

describe("assertSafeKey (P19)", () => {
  it("nhận key chuẩn", () => {
    for (const k of ["proofs/abc.png", "products/x-1/a.webp", "a.b_c-d"]) expect(() => assertSafeKey(k)).not.toThrow();
  });

  it("từ chối key không chuẩn có thể lách kiểm tra theo tiền tố", () => {
    for (const k of ["./proofs/a.png", "proofs/./a.png", "proofs//a.png", "/proofs/a.png", "proofs/", "../x", "a/../b", "a b", ""]) {
      expect(() => assertSafeKey(k), k).toThrow();
    }
  });
});

describe("LocalDiskStorage", () => {
  let root = "";
  afterAll(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("ghi/đọc trong thư mục gốc, key lạ bị chặn", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "glow-store-"));
    const s = new LocalDiskStorage(root);
    await s.put("proofs/a.png", Buffer.from([1, 2]), "image/png");
    expect(await s.get("proofs/a.png")).toEqual({ data: Buffer.from([1, 2]), mime: "image/png" });
    await expect(s.get("./proofs/a.png")).rejects.toThrow();
  });
});
