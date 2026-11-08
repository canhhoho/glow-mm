import { prisma } from "@/lib/db";
import { storage } from "@/server/adapters/storage";
import { assertSafeKey } from "@/server/adapters/storage/types";
import { PAYOUT_PROOF_PREFIX } from "@/server/affiliates/proof-policy";
import { can } from "@/server/auth/roles";
import { getStaffUser } from "@/server/auth/session";

/**
 * Phục vụ file qua storage adapter. File PRIVATE (biên lai chuyển khoản) chỉ trả cho nhân viên có `orders:view`.
 * File công khai khi STORAGE_DRIVER=local cũng đi qua đây.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/files/[...key]">) {
  const key = (await ctx.params).key.join("/");
  // Key phải ở dạng chuẩn trước khi xét quyền (chặn "./proofs/…" lách kiểm tra "proofs/").
  try {
    assertSafeKey(key);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const meta = await prisma.fileObject.findUnique({ where: { key }, select: { visibility: true } });
  const isPrivate = meta?.visibility === "PRIVATE" || key.startsWith("proofs/");
  if (isPrivate) {
    const user = await getStaffUser();
    // Chứng từ chi trả hoa hồng CTV: chỉ người quản lý CTV; biên lai đơn hàng: nhân viên xem đơn.
    const perm = key.startsWith(PAYOUT_PROOF_PREFIX) ? "affiliates:manage" : "orders:view";
    if (!user || !can(user.role, perm)) return new Response("Not found", { status: 404 });
  }

  const s = await storage();
  try {
    const file = await s.get(key);
    if (!file) return new Response("Not found", { status: 404 });
    return new Response(new Uint8Array(file.data), {
      headers: {
        "Content-Type": file.mime,
        "Cache-Control": isPrivate ? "private, no-store" : "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Bad request", { status: 400 });
  }
}
