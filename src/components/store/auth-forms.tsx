"use client";

import { startTransition, useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { customerAuthClient } from "@/lib/customer-auth-client";
import { phoneRegisterAction, phoneSignInAction } from "@/server/accounts/actions";
import { Notice, outlineButton, primaryButton, storeField } from "./ui";
import { PasswordToggle } from "@/components/ui/password-toggle";

/**
 * Form đăng nhập / đăng ký / quên & đặt lại mật khẩu của khách (P14b) — gọi /api/customer-auth qua client Better Auth.
 * `prefix`: "" (my) hoặc "/en", "/vi" (`localePrefix`) — ghép vào URL Better Auth chuyển về sau khi xác minh/đặt lại.
 */

type AuthErr = { status?: number; code?: string } | null | undefined;

function errorKey(e: AuthErr): string {
  if (!e) return "unknown";
  if (e.status === 429) return "tooMany";
  switch (e.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "invalid";
    case "EMAIL_NOT_VERIFIED":
      return "notVerified";
    case "USER_INACTIVE":
      return "locked";
    case "NOT_CUSTOMER":
      return "notCustomer";
    case "PASSWORD_TOO_SHORT":
      return "tooShort";
    case "INVALID_TOKEN":
      return "invalidLink";
    default:
      return "unknown";
  }
}

function PasswordInput({ name, autoComplete, label }: { name: string; autoComplete: string; label: string }) {
  const t = useTranslations("Auth");
  const [show, setShow] = useState(false);
  return (
    <label className="block space-y-1 text-sm">
      <span>{label}</span>
      <span className="relative block">
        <input
          name={name}
          type={show ? "text" : "password"}
          required
          minLength={autoComplete === "new-password" ? 8 : undefined}
          maxLength={128}
          autoComplete={autoComplete}
          className={`${storeField} pr-11`}
        />
        <PasswordToggle shown={show} onToggle={() => setShow((v) => !v)} showLabel={t("showPassword")} hideLabel={t("hidePassword")} />
      </span>
    </label>
  );
}

function EmailInput() {
  const t = useTranslations("Auth");
  return (
    <label className="block space-y-1 text-sm">
      <span>{t("email")}</span>
      <input name="email" type="email" required maxLength={200} autoComplete="email" inputMode="email" className={storeField} />
    </label>
  );
}

/** Trang Better Auth chuyển về sau khi xác minh email: trang đăng nhập (đã có phiên → tự đi tiếp tới `next`). */
const loginUrl = (prefix: string, next: string, extra = "") =>
  `${prefix}/login?next=${encodeURIComponent(next)}${extra}`;

export function GoogleButton({ prefix, next }: { prefix: string; next: string }) {
  const t = useTranslations("Auth");
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        const { error } = await customerAuthClient.signIn.social({
          provider: "google",
          callbackURL: next,
          errorCallbackURL: loginUrl(prefix, next),
        });
        if (error) setPending(false);
      }}
      className={`${outlineButton} w-full`}
    >
      <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
        <path fill="currentColor" d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
      </svg>
      {t("google")}
    </button>
  );
}

/**
 * Đăng nhập bằng SĐT (P17, luôn có) hoặc email (khi bật gửi email): ô nhập có "@" → email, còn lại → SĐT.
 * SĐT đi qua Server Action (chuẩn hoá số, giới hạn số lần thử) rồi server chuyển trang.
 */
export function LoginForm({ prefix, next, emailEnabled }: { prefix: string; next: string; emailEnabled: boolean }) {
  const t = useTranslations("Auth");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const id = String(form.get("identifier")).trim();
    const password = String(form.get("password"));
    setPending(true);
    setError(null);
    if (!(emailEnabled && id.includes("@"))) {
      const res = await phoneSignInAction({ phone: id, password, next, locale: prefix ? "en" : "my" });
      // Thành công thì server đã chuyển trang; chỉ quay lại đây khi lỗi.
      setPending(false);
      if (res?.error) setError(res.error);
      return;
    }
    const { error } = await customerAuthClient.signIn.email({
      email: id,
      password,
      callbackURL: loginUrl(prefix, next),
    });
    if (error) {
      setPending(false);
      return setError(errorKey(error));
    }
    window.location.assign(next);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="block space-y-1 text-sm">
        <span>{t(emailEnabled ? "emailOrPhone" : "phone")}</span>
        <input
          name="identifier"
          required
          maxLength={200}
          type={emailEnabled ? "text" : "tel"}
          inputMode={emailEnabled ? "text" : "tel"}
          autoComplete="username"
          placeholder={emailEnabled ? undefined : t("phoneHint")}
          className={storeField}
        />
      </label>
      <PasswordInput name="password" autoComplete="current-password" label={t("password")} />
      {error && <Notice tone="danger">{t(`err.${error}`, { min: 8 })}</Notice>}
      <button type="submit" disabled={pending} className={`${primaryButton} w-full`}>
        {t("submitLogin")}
      </button>
    </form>
  );
}

/** Đăng ký bằng SĐT + mật khẩu (P17) — Server Action tạo tài khoản rồi đăng nhập, chuyển tới `next`. */
export function PhoneRegisterForm({ locale, next }: { locale: string; next: string }) {
  const t = useTranslations("Auth");
  const [state, action, pending] = useActionState(phoneRegisterAction, undefined);
  // Gửi qua onSubmit (không dùng `action=`): React 19 reset form sau mỗi lần action chạy → báo lỗi thì khách mất hết ô đã nhập.
  // Thành công thì server chuyển trang nên không cần reset.
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => action(data));
  }
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="next" value={next} />
      <label className="block space-y-1 text-sm">
        <span>{t("name")}</span>
        <input name="name" required maxLength={100} autoComplete="name" className={storeField} />
      </label>
      <label className="block space-y-1 text-sm">
        <span>{t("phone")}</span>
        <input
          name="phone"
          required
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          maxLength={30}
          placeholder={t("phoneHint")}
          className={storeField}
        />
      </label>
      <PasswordInput name="password" autoComplete="new-password" label={t("password")} />
      <p className="-mt-2 text-xs text-muted-foreground">{t("passwordHint")}</p>
      <PasswordInput name="confirmPassword" autoComplete="new-password" label={t("confirmPassword")} />
      {state?.error && <Notice tone="danger">{t(`err.${state.error}`, { min: 8 })}</Notice>}
      <button type="submit" disabled={pending} className={`${primaryButton} w-full`}>
        {t("submitRegister")}
      </button>
    </form>
  );
}

export function RegisterForm({ prefix, next }: { prefix: string; next: string }) {
  const t = useTranslations("Auth");
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password"));
    if (password !== String(form.get("confirmPassword"))) return setError("mismatch");
    setPending(true);
    setError(null);
    const email = String(form.get("email")).trim();
    const { error } = await customerAuthClient.signUp.email({
      name: String(form.get("name")).trim(),
      email,
      password,
      callbackURL: loginUrl(prefix, next, "&verified=1"),
    });
    setPending(false);
    if (error) return setError(errorKey(error));
    setSentTo(email);
  }

  if (sentTo) return <Notice tone="success">{t("checkEmail", { email: sentTo })}</Notice>;
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="block space-y-1 text-sm">
        <span>{t("name")}</span>
        <input name="name" required maxLength={100} autoComplete="name" className={storeField} />
      </label>
      <EmailInput />
      <PasswordInput name="password" autoComplete="new-password" label={t("password")} />
      <p className="-mt-2 text-xs text-muted-foreground">{t("passwordHint")}</p>
      <PasswordInput name="confirmPassword" autoComplete="new-password" label={t("confirmPassword")} />
      {error && <Notice tone="danger">{t(`err.${error}`, { min: 8 })}</Notice>}
      <button type="submit" disabled={pending} className={`${primaryButton} w-full`}>
        {t("submitRegister")}
      </button>
    </form>
  );
}

export function ForgotPasswordForm({ prefix }: { prefix: string }) {
  const t = useTranslations("Auth");
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email")).trim();
    setPending(true);
    setError(null);
    const { error } = await customerAuthClient.requestPasswordReset({ email, redirectTo: `${prefix}/reset-password` });
    setPending(false);
    if (error) return setError(errorKey(error));
    setSentTo(email);
  }

  if (sentTo) return <Notice tone="success">{t("forgotSent", { email: sentTo })}</Notice>;
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <EmailInput />
      {error && <Notice tone="danger">{t(`err.${error}`, { min: 8 })}</Notice>}
      <button type="submit" disabled={pending} className={`${primaryButton} w-full`}>
        {t("sendLink")}
      </button>
    </form>
  );
}

export function ResetPasswordForm({ token, loginHref }: { token: string; loginHref: string }) {
  const t = useTranslations("Auth");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const newPassword = String(form.get("password"));
    if (newPassword !== String(form.get("confirmPassword"))) return setError("mismatch");
    setPending(true);
    setError(null);
    const { error } = await customerAuthClient.resetPassword({ newPassword, token });
    setPending(false);
    if (error) return setError(errorKey(error));
    setDone(true);
  }

  if (done) {
    return (
      <div className="space-y-3">
        <Notice tone="success">{t("resetDone")}</Notice>
        <a href={loginHref} className={`${primaryButton} w-full`}>
          {t("signInLink")}
        </a>
      </div>
    );
  }
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <PasswordInput name="password" autoComplete="new-password" label={t("newPassword")} />
      <p className="-mt-2 text-xs text-muted-foreground">{t("passwordHint")}</p>
      <PasswordInput name="confirmPassword" autoComplete="new-password" label={t("confirmPassword")} />
      {error && <Notice tone="danger">{t(`err.${error}`, { min: 8 })}</Notice>}
      <button type="submit" disabled={pending} className={`${primaryButton} w-full`}>
        {t("savePassword")}
      </button>
    </form>
  );
}
