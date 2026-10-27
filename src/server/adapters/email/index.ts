import "server-only";
import { env } from "@/lib/env";
import type { EmailAdapter } from "./types";

export type { EmailAdapter, EmailMessage } from "./types";

let adapter: EmailAdapter | undefined;

/** Chọn adapter theo EMAIL_DRIVER (resend | outbox). `none` → lỗi: nơi gọi phải kiểm tra emailAuthEnabled() trước. */
export async function email(): Promise<EmailAdapter> {
  if (adapter) return adapter;
  const e = env();
  if (e.EMAIL_DRIVER === "resend") {
    const { ResendEmail } = await import("./resend");
    adapter = new ResendEmail(e.RESEND_API_KEY!, e.EMAIL_FROM!);
  } else if (e.EMAIL_DRIVER === "outbox") {
    const { OutboxEmail } = await import("./outbox");
    adapter = new OutboxEmail(e.EMAIL_OUTBOX_DIR);
  } else {
    throw new Error("Chưa cấu hình gửi email (EMAIL_DRIVER=none)");
  }
  return adapter;
}
