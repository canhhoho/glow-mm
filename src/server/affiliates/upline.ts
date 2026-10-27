import "server-only";
import type { Tx } from "@/server/inventory/ledger";
import { getNumberSetting } from "@/server/settings";
import { effectiveUplineRateBp } from "./commission";

/**
 * Cấp trên chốt vào đơn khi gắn CTV (P11 — 2 tầng): cấp trên trực tiếp của CTV, nếu cả hồ sơ lẫn tài khoản
 * đang hoạt động, kèm % tầng trên hiện hành (% riêng của cấp trên — P13, không có thì % chung).
 * Không có / bị khoá → để trống (đơn không tính tầng trên).
 */
export async function uplineSnapshot(tx: Tx, parentId: string | null) {
  if (!parentId) return { uplineAffiliateId: null, uplineRateBp: null };
  const parent = await tx.affiliate.findFirst({
    where: { id: parentId, active: true, user: { active: true } },
    select: { id: true, uplineRateBp: true },
  });
  if (!parent) return { uplineAffiliateId: null, uplineRateBp: null };
  return { uplineAffiliateId: parent.id, uplineRateBp: effectiveUplineRateBp(parent, await getNumberSetting("affiliate.uplineRateBp")) };
}
