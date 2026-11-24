import "server-only";
import { z } from "zod";

const analyticsEnvSchema = z.object({
  ANALYTICS_ENABLED: z.enum(["true", "false"]).default("true").transform((v) => v === "true"),
  ANALYTICS_RETENTION_DAYS: z.coerce.number().int().min(1).max(730).default(180),
});
export const analyticsConfig = () => analyticsEnvSchema.parse(process.env);

/**
 * Cổng trợ lý AI (P25, docs/ket-noi-tro-ly-ai.md §5) — tuỳ chọn: thiếu token/user = cổng tắt (404).
 * Đọc lười ở `src/server/agent/config.ts` (như CRON_SECRET) để đổi token có hiệu lực khi khởi động lại.
 */
const blankAsUnset = (s: z.ZodString) => z.preprocess((v) => (v === "" ? undefined : v), s.optional());
export const agentEnvSchema = z.object({
  AGENT_ADMIN_TOKEN: blankAsUnset(z.string().min(32)),
  AGENT_ADMIN_USER_ID: blankAsUnset(z.string().min(1)),
  /** Danh sách scope cách dấu phẩy; trống = chỉ đọc (catalog:read,stock:read,pricing:read,import:preview). */
  AGENT_ADMIN_SCOPES: z.string().optional(),
});

/** Giá trị mẫu (`change-me…` trong .env.example) — không được dùng ở production. */
export const isPlaceholderSecret = (v: string) => /change-?me/i.test(v);
/** https, hoặc http trên máy (`next start` cục bộ / E2E chạy NODE_ENV=production ở localhost). */
export const isProductionUrl = (url: string) => {
  const u = new URL(url);
  return u.protocol === "https:" || ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
};

/**
 * Biến môi trường phía server. Xem .env.example cho ghi chú từng môi trường.
 * Validate lười (khi gọi lần đầu) để `next build` không cần DB/secret.
 */
const schema = z
  .object({
    ...analyticsEnvSchema.shape,
    ...agentEnvSchema.shape,
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().url(),
    /** Số kết nối tối đa của pool pg (đọc trực tiếp ở src/lib/db.ts) — server riêng ~20, mặc định 10. */
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).optional(),
    APP_URL: z.string().url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    CRON_SECRET: z.string().min(16),
    STORAGE_DRIVER: z.enum(["local"]).default("local"),
    LOCAL_STORAGE_DIR: z.string().default("./storage"),
    FB_PAGE_USERNAME: z.string().optional(),
    VIBER_CHAT_URI: z.string().optional(),
    /** Gửi email (P14): none = tắt đăng ký/đăng nhập khách bằng email; outbox = ghi file (dev/E2E); resend = gửi thật. */
    EMAIL_DRIVER: z.enum(["none", "outbox", "resend"]).default("none"),
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().optional(),
    EMAIL_OUTBOX_DIR: z.string().default("./storage/outbox"),
  })
  // Production: không chạy với secret mẫu trong .env.example hoặc APP_URL không phải https (cookie mất cờ Secure).
  .refine((e) => e.NODE_ENV !== "production" || ![e.BETTER_AUTH_SECRET, e.CRON_SECRET, e.AGENT_ADMIN_TOKEN ?? ""].some(isPlaceholderSecret), {
    message: "BETTER_AUTH_SECRET / CRON_SECRET / AGENT_ADMIN_TOKEN vẫn là giá trị mẫu — sinh bằng `openssl rand -base64 32`",
    path: ["BETTER_AUTH_SECRET"],
  })
  .refine((e) => e.NODE_ENV !== "production" || isProductionUrl(e.APP_URL), {
    message: "APP_URL phải là https:// ở production",
    path: ["APP_URL"],
  })
  .refine((e) => e.EMAIL_DRIVER !== "resend" || (!!e.RESEND_API_KEY && !!e.EMAIL_FROM), {
    message: "RESEND_API_KEY và EMAIL_FROM là bắt buộc khi EMAIL_DRIVER=resend",
    path: ["RESEND_API_KEY"],
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
