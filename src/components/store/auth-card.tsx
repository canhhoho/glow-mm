/** Khung trang đăng nhập/đăng ký của khách (P14b): thẻ giữa trang, rộng tối đa ~24rem. */
export function AuthCard({ title, intro, children }: { title: string; intro?: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-sm space-y-4 rounded-xl bg-card p-4 ring-1 ring-border sm:p-6">
      <div className="space-y-1">
        <h1 className="text-lg font-medium">{title}</h1>
        {intro && <p className="text-sm text-muted-foreground">{intro}</p>}
      </div>
      {children}
    </div>
  );
}

/** Đường kẻ "hoặc" giữa nút Google và form email. */
export function OrDivider({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-3 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
      {label}
    </p>
  );
}
