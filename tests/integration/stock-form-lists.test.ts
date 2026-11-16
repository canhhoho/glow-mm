import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { deleteProducts } from "@/server/catalog/product-delete";
import { createDocument, postDocument, replaceDraftDocument } from "@/server/inventory/documents";
import { batchesForForms, listVariantsForPicker } from "@/server/inventory/queries";
import { createOrder } from "@/server/orders/orders";
import { isoDay, orderInput, saleFixture, unpublishTestProducts } from "./fixtures";

/** Dữ liệu cho form phiếu kho (Xuất / Chuyển / Điều chỉnh): biến thể và lô chọn được (docs/ban-do-nghiep-vu-admin.md). */

afterAll(unpublishTestProducts);

const pick = async (variantId: string) => (await listVariantsForPicker()).find((v) => v.id === variantId);

describe("Biến thể chọn được ở form phiếu kho (#2)", () => {
  it("biến thể đã tắt còn tồn vẫn chọn được (có cờ); hết tồn thì không còn", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 2 }]);
    expect(await pick(f.variantId)).toMatchObject({ inactive: false, archived: false });

    await prisma.variant.update({ where: { id: f.variantId }, data: { active: false } });
    expect(await pick(f.variantId)).toMatchObject({ inactive: true, archived: false });

    const doc = await createDocument({ type: "ISSUE", fromId: f.mm.id, reason: "IT dọn tồn", lines: [{ variantId: f.variantId, qty: 2 }] }, f.userId);
    await postDocument(doc.id, f.userId);
    expect(await pick(f.variantId)).toBeUndefined();
  });

  it("SP ngừng kinh doanh còn tồn: chọn được kèm cờ archived; chuyển tồn qua lại KHÔNG làm nó bán lại", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 3 }]);
    expect(await deleteProducts([f.productId], f.userId)).toEqual({ deleted: 0, archived: 1 });
    expect(await pick(f.variantId)).toMatchObject({ inactive: false, archived: true });

    const move = async (fromId: string, toId: string) => {
      const doc = await createDocument({ type: "TRANSFER", fromId, toId, lines: [{ variantId: f.variantId, qty: 3 }] }, f.userId);
      await postDocument(doc.id, f.userId);
    };
    await move(f.mm.id, f.qc.id);
    await move(f.qc.id, f.mm.id); // về lại kho bán của SP
    await expect(createOrder(orderInput(f, 1), { userId: null })).rejects.toThrow(/không còn bán/);
  });
});

describe("Điều chỉnh chỉ vào lô đã có sổ kho (#4)", () => {
  it("lô chỉ có ở phiếu nhập nháp: form không liệt kê ở dạng posted, tạo + ghi sổ điều chỉnh bị từ chối; lô đã ghi sổ điều chỉnh được", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 2 }]);
    const draft = await createDocument(
      { type: "RECEIVE", toId: f.mm.id, lines: [{ variantId: f.variantId, lotNo: "DRAFT-ONLY", expiryDate: isoDay(400), unitCostVnd: 100_000, qty: 5 }] },
      f.userId,
    );
    const batches = await batchesForForms();
    const draftBatch = batches.find((b) => b.variantId === f.variantId && b.lotNo === "DRAFT-ONLY")!;
    const postedBatch = batches.find((b) => b.variantId === f.variantId && b.lotNo === "A")!;
    expect(draftBatch.posted).toBe(false);
    expect(postedBatch.posted).toBe(true);

    const adjust = (batchId: string, qty: number) =>
      createDocument({ type: "ADJUST", toId: f.mm.id, reason: "IT điều chỉnh", lines: [{ variantId: f.variantId, batchId, qty }] }, f.userId);
    await expect(adjust(draftBatch.id, 1)).rejects.toThrow(/chưa ghi nhận nhập kho/);

    // Phiếu điều chỉnh nháp có sẵn từ trước khi có chặn: ghi sổ cũng bị từ chối, không đổi tồn.
    const legacy = await prisma.stockDocument.create({
      data: {
        code: `AJ-IT-${f.tag}`,
        type: "ADJUST",
        status: "DRAFT",
        toId: f.mm.id,
        reason: "IT phiếu cũ",
        createdById: f.userId,
        lines: { create: [{ variantId: f.variantId, batchId: draftBatch.id, stockType: "SELLABLE", qty: 1 }] },
      },
    });
    await expect(postDocument(legacy.id, f.userId)).rejects.toThrow(/chưa ghi nhận nhập kho/);
    expect(await prisma.stockBalance.count({ where: { batchId: draftBatch.id } })).toBe(0);

    // Lô đã ghi sổ: điều chỉnh bình thường; sau khi ghi sổ phiếu nhập nháp thì lô kia cũng điều chỉnh được.
    const ok = await adjust(postedBatch.id, 1);
    await expect(postDocument(ok.id, f.userId)).resolves.toBeTruthy();
    await postDocument(draft.id, f.userId);
    await expect(adjust(draftBatch.id, 1)).resolves.toBeTruthy();
  });
});

describe("Huỷ và tạo lại phiếu nháp (#5)", () => {
  it("tạo phiếu mới + huỷ phiếu cũ cùng giao dịch; sai điều kiện thì phiếu cũ giữ nguyên", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 5 }]);
    const issue = (qty: number) => ({ type: "ISSUE", fromId: f.mm.id, reason: "IT xuất", lines: [{ variantId: f.variantId, qty }] });
    const old = await createDocument(issue(1), f.userId);

    const fresh = await replaceDraftDocument(old.id, { ...issue(2), idempotencyKey: `replace-${f.tag}-1` }, f.userId);
    expect(fresh.id).not.toBe(old.id);
    expect((await prisma.stockDocument.findUniqueOrThrow({ where: { id: old.id } })).status).toBe("CANCELLED");
    expect((await prisma.stockDocument.findUniqueOrThrow({ where: { id: fresh.id } })).status).toBe("DRAFT");
    expect(await prisma.auditLog.findFirst({ where: { action: "stock.cancel", entityId: old.id }, select: { data: true } })).toMatchObject({ data: { replacedBy: fresh.code } });

    // Gửi lại cùng khoá: trả phiếu mới, không huỷ lần hai, không lỗi.
    const again = await replaceDraftDocument(old.id, { ...issue(2), idempotencyKey: `replace-${f.tag}-1` }, f.userId);
    expect(again.id).toBe(fresh.id);

    // Phiếu cũ đã huỷ / đã ghi sổ / khác loại / là phiếu Nhập: từ chối và KHÔNG tạo phiếu mới.
    const before = await prisma.stockDocument.count({ where: { createdById: f.userId, reason: "IT xuất" } });
    await expect(replaceDraftDocument(old.id, issue(1), f.userId)).rejects.toThrow(/Chỉ thay được phiếu nháp/);
    const posted = await createDocument(issue(1), f.userId);
    await postDocument(posted.id, f.userId);
    await expect(replaceDraftDocument(posted.id, issue(1), f.userId)).rejects.toThrow(/Chỉ thay được phiếu nháp/);
    const receive = await createDocument({ type: "RECEIVE", toId: f.mm.id, lines: [{ variantId: f.variantId, lotNo: "R-NEW", expiryDate: isoDay(400), unitCostVnd: 1000, qty: 1 }] }, f.userId);
    await expect(replaceDraftDocument(receive.id, issue(1), f.userId)).rejects.toThrow(/Phiếu nhập nháp sửa trực tiếp/);
    const draftIssue = await createDocument(issue(1), f.userId);
    await expect(
      replaceDraftDocument(draftIssue.id, { type: "TRANSFER", fromId: f.mm.id, toId: f.qc.id, lines: [{ variantId: f.variantId, qty: 1 }] }, f.userId),
    ).rejects.toThrow(/cùng loại/);
    expect((await prisma.stockDocument.findUniqueOrThrow({ where: { id: draftIssue.id } })).status).toBe("DRAFT");
    // Phiếu mới lỗi (vượt tồn không bắt ở bước tạo, nhưng thiếu lý do thì bị schema chặn) → phiếu cũ vẫn nháp.
    await expect(replaceDraftDocument(draftIssue.id, { ...issue(1), reason: "" }, f.userId)).rejects.toThrow();
    expect((await prisma.stockDocument.findUniqueOrThrow({ where: { id: draftIssue.id } })).status).toBe("DRAFT");
    expect(await prisma.stockDocument.count({ where: { createdById: f.userId, reason: "IT xuất" } })).toBe(before + 2); // chỉ `posted` và `draftIssue` do chính test tạo; mọi lần thay lỗi không để lại phiếu mới
  });
});
