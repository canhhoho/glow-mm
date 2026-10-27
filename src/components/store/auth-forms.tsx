"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Eye, EyeOff } from "lucide-react";
import { customerAuthClient } from "@/lib/customer-auth-client";
import { Notice, outlineButton, primaryButton, storeField } from "./ui";

/**
 * Form đăng nhập / đăng ký / quên & đặt lại mật khẩu của khách (P14b) — gọi /api/customer-auth qua client Better Auth.
 * `prefix`: "" (my) hoặc "/en" — ghép vào URL Better Auth chuyển về sau khi xác minh/đặt lại.
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
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={t(show ? "hidePassword" : "showPassword")}
          aria-pressed={show}
          className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-lg text-muted-foreground hover:text-foreground"
        >
          {show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </button>
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
      className={`${outlineButton} w-full gap-2`}
    >
      <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
        <path fill="currentColor" d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
      </svg>
      {t("google")}
    </button>
  );
}

export function LoginForm({ prefix, next }: { prefix: string; next: string }) {
  const t = useTranslations("Auth");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    const { error } = await customerAuthClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
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
      <EmailInput />
      <PasswordInput name="password" autoComplete="current-password" label={t("password")} />
      {error && <Notice tone="error">{t(`err.${error}`, { min: 8 })}</Notice>}
      <button type="submit" disabled={pending} className={`${primaryButton} w-full`}>
        {t("submitLogin")}
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
      {error && <Notice tone="error">{t(`err.${error}`, { min: 8 })}</Notice>}
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
      {error && <Notice tone="error">{t(`err.${error}`, { min: 8 })}</Notice>}
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
      {error && <Notice tone="error">{t(`err.${error}`, { min: 8 })}</Notice>}
      <button type="submit" disabled={pending} className={`${primaryButton} w-full`}>
        {t("savePassword")}
      </button>
    </form>
  );
}
