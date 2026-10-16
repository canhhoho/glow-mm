import "server-only";
import { randomBytes } from "node:crypto";
import type { Tx } from "@/server/inventory/ledger";
import { storage, type StoredFile } from "@/server/adapters/storage";

/**
 * Ảnh công khai (ảnh SP, banner, icon danh mục): kiểm tra theo magic bytes, lưu qua storage adapter,
 * dọn file mồ côi. Chỉ JPG/PNG/WebP — không nhận SVG (có thể chứa script).
 */

export const IMAGE_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export type ImageUpload = { data: Buffer; mime: string };
type ErrorClass = new (message: string) => Error;

/** Nhận dạng định dạng theo magic bytes — không tin mime trình duyệt gửi lên. */
export function sniffImageMime(data: Buffer): string | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (data.length >= 12 && data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

/** Trả về mime thật của ảnh; ảnh sai định dạng/quá lớn → ném lỗi nghiệp vụ của nơi gọi. */
export function checkImage(file: ImageUpload, Err: ErrorClass): string {
  const mime = sniffImageMime(file.data);
  if (!mime || !IMAGE_MIME[file.mime] || file.data.length === 0 || file.data.length > IMAGE_MAX_BYTES) {
    throw new Err("File ảnh không hợp lệ (JPG/PNG/WebP, tối đa 5MB)");
  }
  return mime;
}

/**
 * Kiểm tra rồi lưu các ảnh dưới `prefix/<ngẫu nhiên>.<ext>`. Lỗi giữa chừng → xoá những file đã lưu.
 * Nơi gọi tạo FileObject trong transaction; DB lỗi thì gọi `discardStored`.
 */
export async function putPublicImages(prefix: string, files: ImageUpload[], Err: ErrorClass): Promise<StoredFile[]> {
  const mimes = files.map((f) => checkImage(f, Err));
  const s = await storage();
  const stored: StoredFile[] = [];
  try {
    for (const [i, file] of files.entries()) {
      stored.push(await s.put(`${prefix}/${randomBytes(12).toString("hex")}.${IMAGE_MIME[mimes[i]]}`, file.data, mimes[i]));
    }
    return stored;
  } catch (e) {
    await discardStored(stored);
    throw e;
  }
}

/** Không để file mồ côi trên storage khi ghi DB lỗi. */
export async function discardStored(stored: StoredFile[]) {
  if (stored.length === 0) return;
  const s = await storage();
  await Promise.allSettled(stored.map((f) => s.delete(f.key)));
}

/** Xoá FileObject nếu không còn nơi nào dùng; trả key để xoá file trên storage SAU khi transaction commit. */
export async function deleteFileIfUnused(tx: Tx, fileId: string): Promise<string | null> {
  const file = await tx.fileObject.findUnique({
    where: { id: fileId },
    include: {
      _count: { select: { productImages: true, paymentProofs: true, categoryIcons: true, bannersDesktop: true, bannersMobile: true } },
    },
  });
  if (!file) return null;
  if (Object.values(file._count).some((n) => n > 0)) return null;
  await tx.fileObject.delete({ where: { id: file.id } });
  return file.key;
}

/** Xoá file trên storage sau khi DB đã commit (lỗi storage không làm hỏng dữ liệu, chỉ để lại file thừa). */
export async function deleteStoredKeys(keys: (string | null)[]) {
  const list = keys.filter((k): k is string => !!k);
  if (list.length === 0) return;
  const s = await storage();
  await Promise.allSettled(list.map((k) => s.delete(k)));
}
