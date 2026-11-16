import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { deleteProducts } from "@/server/catalog/product-delete";
import { createDocument, postDocument } from "@/server/inventory/documents";
import { listVariantsForPicker } from "@/server/inventory/queries";
import { createOrder } from "@/server/orders/orders";
import { orderInput, saleFixture, unpublishTestProducts } from "./fixtures";

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
