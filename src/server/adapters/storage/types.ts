export type StoredFile = {
  /** Cột DB (enum `StorageDriver`) còn giá trị VERCEL_BLOB cho dữ liệu cũ — chỉ script migrate-blob-to-local đọc. */
  driver: "LOCAL";
  key: string;
  /** Đường dẫn /api/files/<key> (local). */
  url: string;
  mime: string;
  size: number;
};

export interface StorageAdapter {
  put(key: string, data: Buffer, mime: string): Promise<StoredFile>;
  get(key: string): Promise<{ data: Buffer; mime: string } | null>;
  delete(key: string): Promise<void>;
}

/**
 * Key an toàn và ở dạng chuẩn: chỉ [a-zA-Z0-9/_.-], không có "..", không có segment rỗng hoặc "." — để
 * `./proofs/x` hay `proofs//x` không thể lách kiểm tra quyền theo key rồi vẫn trỏ tới cùng file trên đĩa.
 */
export function assertSafeKey(key: string): void {
  if (!/^[a-zA-Z0-9/_.-]+$/.test(key) || key.includes("..") || key.split("/").some((seg) => seg === "" || seg === ".")) {
    throw new Error(`Storage key không hợp lệ: ${key}`);
  }
}
