import { redirect } from "next/navigation";
import { requirePagePermission } from "@/server/auth/session";

/**
 * Trang "Giá & tỷ giá" cũ đã gộp vào trang Giá bán (16/11/2026): tỷ giá, lịch sử giá và các lần tính nằm ở các tab của
 * `/admin/selling-prices`. Giữ đường dẫn để link / bookmark cũ vẫn mở đúng tab. Trang bản tính `/admin/pricing/runs/[id]`
 * không đổi.
 */
const MODE: Record<string, string> = { rates: "rates", history: "history", runs: "auto" };

export default async function PricingPage({ searchParams }: PageProps<"/admin/pricing">) {
  await requirePagePermission("pricing:manage");
  const { tab, receiptId, productId } = await searchParams;
  const q = new URLSearchParams({ mode: (typeof tab === "string" && MODE[tab]) || "rates" });
  if (typeof receiptId === "string") q.set("receiptId", receiptId);
  if (typeof productId === "string") q.set("productId", productId);
  redirect(`/admin/selling-prices?${q}`);
}
