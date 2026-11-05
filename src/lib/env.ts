import "server-only";
import { z } from "zod";

const analyticsEnvSchema = z.object({
  ANALYTICS_ENABLED: z.enum(["true", "false"]).default("true").transform((v) => v === "true"),
  ANALYTICS_RETENTION_DAYS: z.coerce.number().int().min(1).max(730).default(180),
});
export const analyticsConfig = () => analyticsEnvSchema.parse(process.env);

/**
 * Biến môi trường phía server. Xem .env.example cho ghi chú từng môi trường.
 * Validate lười (khi gọi lần đầu) để `next build` không cần DB/secret.
 */
const schema = z
  .object({
    ...analyticsEnvSchema.shape,
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().url(),
    /** Số kết nối tối đa của pool pg (đọc trực tiếp ở src/lib/db.ts) — server riêng ~20, Vercel/Neon để mặc định 10. */
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).optional(),
    APP_URL: z.string().url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    CRON_SECRET: z.string().min(16),
    STORAGE_DRIVER: z.enum(["vercel-blob", "local"]).default("local"),
    BLOB_READ_WRITE_TOKEN: z.string().optional(),
    LOCAL_STORAGE_DIR: z.string().default("./storage"),
    FB_PAGE_USERNAME: z.string().optional(),
    VIBER_CHAT_URI: z.string().optional(),
    /** Gửi email (P14): none = tắt đăng ký/đăng nhập khách bằng email; outbox = ghi file (dev/E2E); resend = gửi thật. */
    EMAIL_DRIVER: z.enum(["none", "outbox", "resend"]).default("none"),
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().optional(),
    EMAIL_OUTBOX_DIR: z.string().default("./storage/outbox"),
    /** Đăng nhập Google cho khách (P14) — để trống cả hai = ẩn nút Google. */
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
  })
  .refine((e) => e.STORAGE_DRIVER !== "vercel-blob" || !!e.BLOB_READ_WRITE_TOKEN, {
    message: "BLOB_READ_WRITE_TOKEN là bắt buộc khi STORAGE_DRIVER=vercel-blob",
    path: ["BLOB_READ_WRITE_TOKEN"],
  })
  .refine((e) => e.EMAIL_DRIVER !== "resend" || (!!e.RESEND_API_KEY && !!e.EMAIL_FROM), {
    message: "RESEND_API_KEY và EMAIL_FROM là bắt buộc khi EMAIL_DRIVER=resend",
    path: ["RESEND_API_KEY"],
  })
  .refine((e) => !e.GOOGLE_CLIENT_ID === !e.GOOGLE_CLIENT_SECRET, {
    message: "GOOGLE_CLIENT_ID và GOOGLE_CLIENT_SECRET phải đặt đủ cả hai (hoặc để trống cả hai)",
    path: ["GOOGLE_CLIENT_ID"],
  });

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(`Biến môi trường không hợp lệ:\n${z.prettifyError(parsed.error)}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** Khách đăng ký/đăng nhập bằng email được không (cần gửi được email xác minh + đặt lại mật khẩu). */
export const emailAuthEnabled = () => env().EMAIL_DRIVER !== "none";

/** Có nút "Đăng nhập bằng Google" không. */
export const googleAuthEnabled = () => !!env().GOOGLE_CLIENT_ID;
