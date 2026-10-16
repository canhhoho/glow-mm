// Chuyển file từ Vercel Blob → ổ đĩa (STORAGE_DRIVER=local) khi lên server Myanmar (DEPLOY.md §2.4).
// Chỉ dùng `pg` + fetch + fs (không cần build/tsx) → chạy được trong image `migrator`.
//
//   DATABASE_URL=... LOCAL_STORAGE_DIR=/app/storage node scripts/migrate-blob-to-local.mjs [--dry-run]
//
// - Chỉ xử lý dòng FileObject có driver = VERCEL_BLOB → chạy lại an toàn, tiếp tục được nếu lần trước lỗi giữa chừng.
// - Ghi đúng định dạng của LocalDiskStorage (src/server/adapters/storage/local.ts): <key> + <key>.meta {"mime"}.
// - Cập nhật driver=LOCAL, url=/api/files/<key> SAU khi ghi file xong → không có dòng trỏ tới file chưa tồn tại.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Giống assertSafeKey trong storage/types.ts. */
function safePath(root, key) {
  if (!/^[a-zA-Z0-9/_.-]+$/.test(key) || key.includes("..") || key.startsWith("/")) {
    throw new Error(`Storage key không hợp lệ: ${key}`);
  }
  return path.join(path.resolve(root), key);
}

/**
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>, rootDir: string,
 *           fetchFn?: typeof fetch, dryRun?: boolean, log?: (msg: string) => void }} opts
 */
export async function migrateBlobToLocal({ query, rootDir, fetchFn = fetch, dryRun = false, log = console.log }) {
  const { rows } = await query(
    `SELECT id, key, url, mime, size FROM "FileObject" WHERE driver = 'VERCEL_BLOB' ORDER BY "createdAt", id`,
  );
  const result = { total: rows.length, migrated: 0, failed: /** @type {{ key: string, reason: string }[]} */ ([]) };
  log(`${rows.length} file trên Vercel Blob${dryRun ? " (dry-run, không ghi gì)" : ""}`);

  for (const f of rows) {
    try {
      const file = safePath(rootDir, f.key);
      if (dryRun) {
        log(`  [dry-run] ${f.key} (${f.size} B) ← ${f.url}`);
        continue;
      }
      const res = await fetchFn(f.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = Buffer.from(await res.arrayBuffer());
      if (f.size && data.length !== f.size) log(`  ! ${f.key}: kích thước ${data.length} B khác DB ${f.size} B`);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, data);
      await writeFile(`${file}.meta`, JSON.stringify({ mime: f.mime }));
      await query(`UPDATE "FileObject" SET driver = 'LOCAL', url = $2, size = $3 WHERE id = $1 AND driver = 'VERCEL_BLOB'`, [
        f.id,
        `/api/files/${f.key}`,
        data.length,
      ]);
      result.migrated++;
      log(`  ✓ ${f.key}`);
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      result.failed.push({ key: f.key, reason });
      log(`  ✗ ${f.key}: ${reason}`);
    }
  }
  log(`Xong: ${result.migrated}/${result.total} đã chuyển, ${result.failed.length} lỗi${result.failed.length ? " → chạy lại script" : ""}`);
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const { default: pg } = await import("pg");
  const dryRun = process.argv.includes("--dry-run");
  const rootDir = process.env.LOCAL_STORAGE_DIR || "./storage";
  if (!process.env.DATABASE_URL) {
    console.error("Thiếu DATABASE_URL");
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const r = await migrateBlobToLocal({ query: (sql, params) => client.query(sql, params), rootDir, dryRun });
    process.exitCode = r.failed.length ? 1 : 0;
  } finally {
    await client.end();
  }
}
