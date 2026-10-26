"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { AFFILIATE_ROLE, USER_INACTIVE } from "@/server/auth/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const field = "h-11 bg-card pl-9";
const fieldIcon = "pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground";

/** `portal`: admin (nhân viên) hoặc ctv (cộng tác viên) — tài khoản sai cổng bị đăng xuất ngay và báo lỗi. */
export function LoginForm({ portal }: { portal: "admin" | "ctv" }) {
  const t = useTranslations("Login");
  const router = useRouter();
  const [error, setError] = useState<"error" | "tooMany" | "locked" | "wrongPortal" | null>(null);
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    const { data, error } = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    if (error) {
      setPending(false);
      return setError(error.status === 429 ? "tooMany" : error.code === USER_INACTIVE ? "locked" : "error");
    }
    const role = (data?.user as { role?: string } | undefined)?.role;
    if (role && (role === AFFILIATE_ROLE) !== (portal === "ctv")) {
      await authClient.signOut();
      setPending(false);
      return setError("wrongPortal");
    }
    router.replace(portal === "ctv" ? "/ctv" : "/admin");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">{t("email")}</Label>
        <div className="relative">
          <Mail className={fieldIcon} aria-hidden />
          <Input id="email" name="email" type="email" autoComplete="username" required className={field} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">{t("password")}</Label>
        <div className="relative">
          <Lock className={fieldIcon} aria-hidden />
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            className={`${field} pr-11`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={t(showPassword ? "hidePassword" : "showPassword")}
            aria-pressed={showPassword}
            className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-lg text-muted-foreground hover:text-foreground"
          >
            {showPassword ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t(error)}
        </p>
      )}
      <Button type="submit" className="h-11 w-full text-base" disabled={pending}>
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        {t("submit")}
      </Button>
    </form>
  );
}
