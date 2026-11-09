"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Lock, Mail } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { NOT_STAFF, portalAllowsRole, USER_INACTIVE } from "@/server/auth/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/ui/notice";
import { PasswordToggle } from "@/components/ui/password-toggle";

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
      return setError(
        error.status === 429 ? "tooMany" : error.code === USER_INACTIVE ? "locked" : error.code === NOT_STAFF ? "wrongPortal" : "error",
      );
    }
    // Allow-list theo cổng: nhân viên ở /admin, CTV ở /ctv (khách hàng đã bị server từ chối với NOT_STAFF).
    if (!portalAllowsRole(portal, (data?.user as { role?: string } | undefined)?.role)) {
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
          {/* section-<cổng>: trình duyệt nhớ tài khoản riêng cho admin / cổng CTV (cùng tên miền). */}
          <Input id="email" name="email" type="email" autoComplete={`section-${portal} username`} required className={field} />
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
            autoComplete={`section-${portal} current-password`}
            required
            className={`${field} pr-11`}
          />
          <PasswordToggle shown={showPassword} onToggle={() => setShowPassword((v) => !v)} showLabel={t("showPassword")} hideLabel={t("hidePassword")} />
        </div>
      </div>
      {error && (
        <Notice tone="danger">{t(error)}</Notice>
      )}
      <Button type="submit" size="touch" className="w-full" disabled={pending}>
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        {t("submit")}
      </Button>
    </form>
  );
}
