import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { LocalDiskStorage } from "@/server/adapters/storage/local";
import { migrateBlobToLocal } from "../../scripts/migrate-blob-to-local.mjs";

const tag = Date.now().toString(36);
const OK_KEY = `products/it-${tag}/a.webp`;
const BAD_KEY = `proofs/it-${tag}/missing.png`;
const BLOB = "https://example.public.blob.vercel-storage.com";
let root = "";

const query = async (sql: string, params: unknown[] = []) => ({ rows: await prisma.$queryRawUnsafe<unknown[]>(sql, ...params) });
const fakeFetch = (async (url: string) =>
  url === `${BLOB}/${OK_KEY}` ? new Response(new Uint8Array([1, 2, 3, 4])) : new Response("no", { status: 404 })) as typeof fetch;

afterAll(async () => {
  await prisma.fileObject.deleteMany({ where: { key: { in: [OK_KEY, BAD_KEY] } } });
  if (root) await rm(root, { recursive: true, force: true });
});

describe("Script chuyển file Vercel Blob → ổ đĩa", () => {
  it("dry-run không ghi; chạy thật ghi file đúng định dạng LocalDiskStorage + cập nhật DB; chạy lại chỉ xử lý dòng lỗi", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "glow-blob-"));
    await prisma.fileObject.createMany({
      data: [
        { driver: "VERCEL_BLOB", key: OK_KEY, url: `${BLOB}/${OK_KEY}`, mime: "image/webp", size: 4 },
        { driver: "VERCEL_BLOB", key: BAD_KEY, url: `${BLOB}/${BAD_KEY}`, mime: "image/png", size: 9, visibility: "PRIVATE" },
      ],
    });
    const log = () => {};

    const dry = await migrateBlobToLocal({ query, rootDir: root, fetchFn: fakeFetch, dryRun: true, log });
    expect(dry.migrated).toBe(0);
    expect(await new LocalDiskStorage(root).get(OK_KEY)).toBeNull();

    const r1 = await migrateBlobToLocal({ query, rootDir: root, fetchFn: fakeFetch, log });
    expect(r1.migrated).toBe(1);
    expect(r1.failed).toEqual([{ key: BAD_KEY, reason: "HTTP 404" }]);

    const file = await new LocalDiskStorage(root).get(OK_KEY);
    expect(file).toEqual({ data: Buffer.from([1, 2, 3, 4]), mime: "image/webp" });
    expect(await prisma.fileObject.findUniqueOrThrow({ where: { key: OK_KEY } })).toMatchObject({
      driver: "LOCAL",
      url: `/api/files/${OK_KEY}`,
      size: 4,
    });
    expect((await prisma.fileObject.findUniqueOrThrow({ where: { key: BAD_KEY } })).driver).toBe("VERCEL_BLOB");

    const r2 = await migrateBlobToLocal({ query, rootDir: root, fetchFn: fakeFetch, log });
    expect(r2.failed.map((f) => f.key)).toEqual([BAD_KEY]);
    expect(r2.migrated).toBe(0);
  });
});
