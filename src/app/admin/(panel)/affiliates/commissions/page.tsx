import { redirect } from "next/navigation";
import { requirePagePermission } from "@/server/auth/session";

/** Trang cũ "Hoa hồng & chi trả" (gộp vào Danh sách CTV 20/11/2026): giữ link cũ → Danh sách lọc "Có hoa hồng phải trả". */
export default async function CommissionsPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  await requirePagePermission("affiliates:manage");
  const { q } = await searchParams;
  const next = new URLSearchParams({ due: "1" });
  if (typeof q === "string" && q.trim()) next.set("q", q.trim());
  redirect(`/admin/affiliates?${next}`);
}
