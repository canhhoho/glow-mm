import "server-only";
import { z } from "zod";

/**
 * Biến môi trường phía server. Xem .env.example cho ghi chú từng môi trường.
 * Validate lười (khi gọi lần đầu) để `next build` không cần DB/secret.
 */
const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().url(),
    APP_URL: z.string().url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    CRON_SECRET: z.string().min(16),
    STORAGE_DRIVER: z.enum(["vercel-blob", "local"]).default("local"),
    BLOB_READ_WRITE_TOKEN: z.string().optional(),
    LOCAL_STORAGE_DIR: z.string().default("./storage"),
    FB_PAGE_USERNAME: z.string().optional(),
    VIBER_CHAT_URI: z.string().optional(),
  })
  .refine((e) => e.STORAGE_DRIVER !== "vercel-blob" || !!e.BLOB_READ_WRITE_TOKEN, {
    message: "BLOB_READ_WRITE_TOKEN là bắt buộc khi STORAGE_DRIVER=vercel-blob",
    path: ["BLOB_READ_WRITE_TOKEN"],
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
