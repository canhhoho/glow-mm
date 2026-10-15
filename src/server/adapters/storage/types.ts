export type StoredFile = {
  driver: "VERCEL_BLOB" | "LOCAL";
  key: string;
  /** URL công khai (blob) hoặc đường dẫn /api/files/<key> (local). */
  url: string;
  mime: string;
  size: number;
};

export interface StorageAdapter {
  put(key: string, data: Buffer, mime: string): Promise<StoredFile>;
  get(key: string): Promise<{ data: Buffer; mime: string } | null>;
  delete(key: string): Promise<void>;
}

/** Key an toàn: chỉ [a-z0-9/_.-], không có "..". */
export function assertSafeKey(key: string): void {
  if (!/^[a-zA-Z0-9/_.-]+$/.test(key) || key.includes("..") || key.startsWith("/")) {
    throw new Error(`Storage key không hợp lệ: ${key}`);
  }
}
