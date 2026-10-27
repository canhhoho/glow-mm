import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EmailAdapter, EmailMessage } from "./types";

/**
 * Không gửi thật: ghi mỗi email thành một file JSON (dev, E2E đọc link xác minh/đặt lại mật khẩu) + log tiêu đề.
 * Tên file: <thời điểm>-<người nhận>.json.
 */
export class OutboxEmail implements EmailAdapter {
  constructor(private readonly dir: string) {}

  async send(message: EmailMessage) {
    const dir = path.resolve(this.dir);
    await mkdir(dir, { recursive: true });
    const safeTo = message.to.toLowerCase().replace(/[^a-z0-9@._-]/g, "_");
    const file = path.join(dir, `${Date.now()}-${randomUUID().slice(0, 8)}-${safeTo}.json`);
    await writeFile(file, JSON.stringify({ ...message, sentAt: new Date().toISOString() }, null, 2));
    console.info(`[email:outbox] ${message.to} — ${message.subject}`);
  }
}
