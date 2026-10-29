import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertSafeKey, type StorageAdapter, type StoredFile } from "./types";

/** Lưu file trên ổ đĩa (server Myanmar / Docker volume). Phục vụ qua /api/files/<key>. */
export class LocalDiskStorage implements StorageAdapter {
  constructor(private readonly root: string) {}

  private resolve(key: string) {
    assertSafeKey(key);
    const root = path.resolve(this.root);
    const file = path.resolve(root, key);
    if (!file.startsWith(root + path.sep)) throw new Error(`Storage key không hợp lệ: ${key}`);
    return file;
  }

  async put(key: string, data: Buffer, mime: string): Promise<StoredFile> {
    const file = this.resolve(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
    await writeFile(`${file}.meta`, JSON.stringify({ mime }));
    return { driver: "LOCAL", key, url: `/api/files/${key}`, mime, size: data.length };
  }

  async get(key: string) {
    const file = this.resolve(key);
    try {
      const [data, meta] = await Promise.all([readFile(file), readFile(`${file}.meta`, "utf8")]);
      return { data, mime: (JSON.parse(meta) as { mime: string }).mime };
    } catch {
      return null;
    }
  }

  async delete(key: string) {
    const file = this.resolve(key);
    await rm(file, { force: true });
    await rm(`${file}.meta`, { force: true });
  }
}
