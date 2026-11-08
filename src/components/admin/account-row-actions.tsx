import Link from "next/link";
import { LockKeyhole, LockKeyholeOpen, Pencil, Trash2 } from "lucide-react";
import { ActionButton } from "@/components/admin/action-button";
import { buttonVariants } from "@/components/ui/button";
import type { ActionState } from "@/server/inventory/actions";
import { cn } from "@/lib/utils";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

/**
 * Nút thao tác ở mỗi dòng danh sách tài khoản (Nhân viên, CTV, Khách hàng) — cùng một bộ icon:
 * bút chì = Sửa, ổ khoá = Khoá/Mở khoá, thùng rác hồng = Xoá. Mỗi nút có `aria-label` + chú thích khi rê chuột;
 * Khoá/Xoá hỏi xác nhận. Trang chi tiết dùng nút có chữ.
 */
export function AccountRowActions({
  editHref,
  editLabel,
  lock,
  remove,
}: {
  editHref: string;
  editLabel: string;
  /** Bỏ trống = không hiện (vd. chính tài khoản đang đăng nhập). */
  lock?: { action: Action; fields: Record<string, string>; active: boolean; lockLabel: string; unlockLabel: string; confirm: string };
  remove?: { action: Action; fields: Record<string, string>; label: string; confirm: string };
}) {
  return (
    <div className="flex flex-wrap items-start gap-1 md:flex-nowrap md:justify-end">
      <Link
        href={editHref}
        aria-label={editLabel}
        title={editLabel}
        className={cn(buttonVariants({ variant: "outline", size: "icon-lg" }), "size-11 md:size-9")}
      >
        <Pencil aria-hidden="true" />
      </Link>
      {lock && (
        <ActionButton
          action={lock.action}
          fields={lock.fields}
          label={lock.active ? lock.lockLabel : lock.unlockLabel}
          variant="outline"
          icon={lock.active ? <LockKeyhole aria-hidden="true" /> : <LockKeyholeOpen aria-hidden="true" />}
          confirm={lock.active ? lock.confirm : undefined}
        />
      )}
      {remove && (
        <ActionButton
          action={remove.action}
          fields={remove.fields}
          label={remove.label}
          variant="destructive"
          icon={<Trash2 aria-hidden="true" />}
          confirm={remove.confirm}
        />
      )}
    </div>
  );
}
