import type { EmailAdapter, EmailMessage } from "./types";

/** Gửi qua Resend REST API (fetch thuần, không SDK — chạy được cả Vercel lẫn server Myanmar). */
export class ResendEmail implements EmailAdapter {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: this.from, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Resend lỗi ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}
