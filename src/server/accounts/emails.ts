import { createTranslator } from "next-intl";
import en from "../../../messages/store.en.json";
import my from "../../../messages/store.my.json";
import type { EmailMessage } from "@/server/adapters/email/types";
import { BRAND_NAME } from "@/lib/brand";

/** Nội dung email tài khoản khách (P14) theo ngôn ngữ của khách (my mặc định). Hàm thuần — test được. */

export type AuthEmailKind = "verify" | "reset";

const MESSAGES = { my, en } as const;

/**
 * Chỉ my/en: `User.locale` mặc định "vi" (nhân viên/CTV — CTV cũng nhận email này) nên "vi" không chắc là khách
 * chọn tiếng Việt → gửi tiếng Myanmar như trước P22.
 */
export const emailLocale = (locale: string | null | undefined): "my" | "en" => (locale === "en" ? "en" : "my");

// Email client không đọc CSS variable → dùng mã hex của design token (globals.css: primary, background).
const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function authEmail(kind: AuthEmailKind, to: { email: string; name: string; locale?: string | null }, url: string): EmailMessage {
  const locale = emailLocale(to.locale);
  const t = createTranslator({ locale, messages: MESSAGES[locale], namespace: "Email" });
  const subject = t(`${kind}.subject`);
  const greeting = t("greeting", { name: to.name });
  const body = t(`${kind}.body`);
  const cta = t(`${kind}.cta`);
  const ignore = t(`${kind}.ignore`);
  const html = `<!doctype html><html lang="${locale}"><body style="margin:0;padding:24px;background:#FFF8F5;font-family:'Noto Sans Myanmar',Arial,sans-serif;color:#3b2f33">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px">
<p style="font-size:20px;font-weight:600;color:#E8657A;margin:0 0 16px">${escapeHtml(BRAND_NAME)}</p>
<p>${escapeHtml(greeting)}</p>
<p>${escapeHtml(body)}</p>
<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#E8657A;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">${escapeHtml(cta)}</a></p>
<p style="font-size:13px;color:#7a6a6f">${escapeHtml(ignore)}</p>
<p style="font-size:12px;color:#7a6a6f;word-break:break-all">${escapeHtml(url)}</p>
</div></body></html>`;
  const text = `${greeting}\n\n${body}\n\n${cta}: ${url}\n\n${ignore}`;
  return { to: to.email, subject, html, text };
}
