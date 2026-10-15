import "server-only";
import { env } from "@/lib/env";
import type { StorageAdapter } from "./types";

export type { StorageAdapter, StoredFile } from "./types";

let adapter: StorageAdapter | undefined;

/** Chọn adapter theo STORAGE_DRIVER (vercel-blob | local). */
export async function storage(): Promise<StorageAdapter> {
  if (adapter) return adapter;
  const e = env();
  if (e.STORAGE_DRIVER === "vercel-blob") {
    const { VercelBlobStorage } = await import("./vercel-blob");
    adapter = new VercelBlobStorage(e.BLOB_READ_WRITE_TOKEN!);
  } else {
    const { LocalDiskStorage } = await import("./local");
    adapter = new LocalDiskStorage(e.LOCAL_STORAGE_DIR);
  }
  return adapter;
}
