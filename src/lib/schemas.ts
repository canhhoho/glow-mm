import { z } from "zod";
import { toUnicode } from "@/lib/myanmar";

/**
 * Khối Zod dùng chung cho các schema trong src/server/<domain>/ (P21). Giữ đúng hành vi cũ — một số action đọc
 * `issues[0].path` / `message` / `code` hoặc hiện thẳng câu báo lỗi của Zod cho người dùng, nên đổi giới hạn hay câu
 * báo lỗi ở đây là đổi giao diện. Không client component nào import file này (Zod chỉ chạy phía server).
 */

/** Id bản ghi trong JSON/form nội bộ (không trim, không giới hạn độ dài). */
export const rawId = z.string().min(1);

/** Id lấy từ FormData: trim + giới hạn độ dài. Chuỗi rỗng → lỗi `too_small` (action users/affiliates dựa vào mã này). */
export const formId = (max: number) => z.string().trim().min(1).max(max);

/** Chữ (có thể là Myanmar Zawgyi) → Unicode; độ dài tối thiểu (nếu cần) kiểm SAU khi chuyển bằng `.pipe(...)`. */
export const mmText = (max: number) => z.string().trim().max(max).transform(toUnicode);

/** Chữ bắt buộc → Unicode; độ dài tối thiểu kiểm TRƯỚC khi chuyển. */
export const mmTextReq = (max: number, min = 1) => z.string().trim().min(min).max(max).transform(toUnicode);

/** SĐT nhập tay (chuẩn hoá + kiểm tra số Myanmar làm sau bằng `normalizeMmPhone`). */
export const phoneSchema = z.string().trim().min(1).max(30);
/** SĐT phụ (tuỳ chọn). */
export const phone2Schema = z.string().trim().max(30).optional();

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(200));

/** Slug a-z, 0-9, "-". `message` giữ câu báo lỗi riêng của từng form (bỏ trống = câu mặc định của Zod). */
export const slugSchema = (max: number, message?: string) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .regex(/^[a-z0-9-]+$/, message);

/** Mật khẩu mới (tối thiểu theo vai trò: MIN_STAFF_PASSWORD / MIN_CUSTOMER_PASSWORD). */
export const newPasswordSchema = (min: number) => z.string().min(min).max(128);
/** Mật khẩu hiện tại / đăng nhập. */
export const currentPasswordSchema = z.string().min(1).max(128);
/** Ô nhập lại mật khẩu. */
export const confirmPasswordSchema = z.string().max(128);

/**
 * Bắt `confirmPassword` khớp trường mật khẩu `field`. Lỗi: path `["confirmPassword"]`, message `"mismatch"`
 * (action đổi thành chuỗi giao diện theo đúng message này).
 */
export function withConfirm<S extends z.ZodType<{ confirmPassword: string } & Record<F, string>>, F extends string>(schema: S, field: F) {
  return schema.refine((d) => d[field] === d.confirmPassword, { path: ["confirmPassword"], message: "mismatch" });
}

/** Ngôn ngữ storefront (khớp `routing.locales` — có unit test). Mỗi nơi tự thêm `.default` / `.catch` / `.nullable`. */
export const localeSchema = z.enum(["my", "en", "vi"]);

/** Di chuyển phần tử lên/xuống trong danh sách có thứ tự. */
export const directionSchema = z.enum(["up", "down"]);
export type Direction = z.infer<typeof directionSchema>;
