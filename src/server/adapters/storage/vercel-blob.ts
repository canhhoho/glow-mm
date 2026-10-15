import { del, head, put } from "@vercel/blob";
import { assertSafeKey, type StorageAdapter, type StoredFile } from "./types";

/** Vercel Blob (môi trường testing). */
export class VercelBlobStorage implements StorageAdapter {
  constructor(private readonly token: string) {}

  async put(key: string, data: Buffer, mime: string): Promise<StoredFile> {
    assertSafeKey(key);
    const blob = await put(key, data, {
      access: "public",
      contentType: mime,
      token: this.token,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return { driver: "VERCEL_BLOB", key, url: blob.url, mime, size: data.length };
  }

  async get(key: string) {
    assertSafeKey(key);
    try {
      const meta = await head(key, { token: this.token });
      const res = await fetch(meta.url);
      if (!res.ok) return null;
      return { data: Buffer.from(await res.arrayBuffer()), mime: meta.contentType };
    } catch {
      return null;
    }
  }

  async delete(key: string) {
    assertSafeKey(key);
    await del(key, { token: this.token });
  }
}
