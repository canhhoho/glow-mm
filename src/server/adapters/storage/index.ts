import "server-only";
import { env } from "@/lib/env";
import type { StorageAdapter } from "./types";

export type { StorageAdapter, StoredFile } from "./types";

let adapter: StorageAdapter | undefined;

/** Chọn adapter theo STORAGE_DRIVER (hiện chỉ `local`; thêm adapter mới = thêm nhánh ở đây + giá trị trong `env.ts`). */
export async function storage(): Promise<StorageAdapter> {
  if (adapter) return adapter;
  const e = env();
  const { LocalDiskStorage } = await import("./local");
  adapter = new LocalDiskStorage(e.LOCAL_STORAGE_DIR);
  return adapter;
}
