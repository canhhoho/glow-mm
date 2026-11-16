import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createDocument, postDocument } from "@/server/inventory/documents";
import { createWarehouse, setWarehouseActive, updateWarehouse } from "@/server/inventory/warehouses";
import { moveProductsToWarehouse } from "@/server/catalog/product-delete";
import { saveProduct } from "@/server/catalog/products";
import { getProductForEdit } from "@/server/catalog/admin-queries";
import { createOrder } from "@/server/orders/orders";
import { transitionOrder } from "@/server/orders/transitions";
import { admin, avail, isoDay, orderInput, saleFixture, unpublishTestProducts, markApproved } from "./fixtures";

/** P24: hai kho bán — SP thuộc một kho; nhập, tồn bán, xuất đơn theo kho của SP. */

afterAll(unpublishTestProducts);

/** `mmk`: SP thuộc kho mua tại Myanmar → giá mua MMK (P24). */
const receive = (f: { userId: string }, toId: string, variantId: string, lotNo: string, qty: number, mmk = false) =>
  createDocument(
    { type: "RECEIVE", toId, lines: [{ variantId, lotNo, expiryDate: isoDay(400), ...(mmk ? { unitCostMmk: 9_000 } : { unitCostVnd: 50_000 }), qty }] },
    f.userId,
  );

describe("Kho của sản phẩm", () => {
  it("nhập / chuyển vào kho bán khác kho của SP bị chặn; kho đã ngừng không nhận phiếu", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 5 }]);
    await expect(receive(f, f.chi.id, f.variantId, "X", 1)).rejects.toThrow(`SKU IT-${f.tag}: sản phẩm thuộc MM, không nhập vào CHI`);
    await expect(
      createDocument({ type: "TRANSFER", fromId: f.mm.id, toId: f.chi.id, lines: [{ variantId: f.variantId, qty: 1 }] }, f.userId),
    ).rejects.toThrow(/không nhập vào CHI/);
    // Kho không bán (VN) vẫn nhận bình thường.
    await expect(receive(f, f.vn.id, f.variantId, "V", 1)).resolves.toBeTruthy();

    await prisma.location.update({ where: { id: f.vn.id }, data: { active: false } });
    await expect(receive(f, f.vn.id, f.variantId, "V2", 1)).rejects.toThrow(/đã ngừng dùng/);
  });

  it("tồn bán chỉ tính ở kho của SP; đổi kho → chuyển hàng sang kho mới mới bán lại", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 4 }]);
    expect(await avail(f.variantId)).toBe(4);

    expect(await moveProductsToWarehouse([f.productId], f.chi.id, f.userId)).toBe(1);
    expect(await avail(f.variantId)).toBe(0); // hàng còn nằm ở kho cũ

    const tf = await createDocument(
      { type: "TRANSFER", fromId: f.mm.id, toId: f.chi.id, lines: [{ variantId: f.variantId, qty: 4 }] },
      f.userId,
    );
    await postDocument(tf.id, f.userId);
    expect(await avail(f.variantId)).toBe(4);
  });

  it("đơn có hàng của hai kho: bàn giao tạo một phiếu xuất cho mỗi kho", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 3 }]);
    const other = await saveProduct(
      {
        slug: `it-chi-${f.tag.toLowerCase()}`,
        brandId: f.brandId,
        categoryId: f.categoryId,
        stockLocationId: f.chi.id,
        my: { name: "ခရင်မ်" },
        en: { name: "Cream" },
        variants: [{ sku: `CHI-${f.tag}`, label: "30ml", priceMmk: 20_000 }],
      },
      f.userId,
    );
    await markApproved(other.id, { published: true });
    const chiVariant = await prisma.variant.findFirstOrThrow({ where: { productId: other.id } });
    await postDocument((await receive(f, f.chi.id, chiVariant.id, "C1", 2, true)).id, f.userId);

    const order = await createOrder(
      orderInput(f, 1, { items: [{ variantId: f.variantId, qty: 2 }, { variantId: chiVariant.id, qty: 1 }] }),
      { userId: null },
    );
    await transitionOrder(order.id, "confirmCod", admin(f));
    await transitionOrder(order.id, "ship", admin(f), { carrier: "VTP" });

    const issues = await prisma.stockDocument.findMany({ where: { orderId: order.id, type: "ISSUE" }, include: { lines: true } });
    expect(issues.map((d) => d.fromId).sort()).toEqual([f.mm.id, f.chi.id].sort());
    expect(issues.find((d) => d.fromId === f.chi.id)!.lines).toEqual([expect.objectContaining({ variantId: chiVariant.id, qty: 1 })]);
    expect(await avail(f.variantId)).toBe(1);
    expect(await avail(chiVariant.id)).toBe(1);
    // Giá vốn dòng đơn Kho Chi lấy thẳng từ giá MMK của lô (P24).
    const alloc = await prisma.orderAllocation.findFirstOrThrow({ where: { orderItem: { orderId: order.id, variantId: chiVariant.id } } });
    expect(alloc.unitLandedCostMmk).toBe(9_000);
  });

  it("thành phần combo phải cùng kho; đổi kho riêng một phía bị chặn", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 2 }]);
    const combo = await saveProduct(
      {
        slug: `it-combo-${f.tag.toLowerCase()}`,
        brandId: f.brandId,
        categoryId: f.categoryId,
        stockLocationId: f.mm.id,
        my: { name: "ဆက်" },
        en: { name: "Set" },
        variants: [{ sku: `SET-${f.tag}`, label: "Set", priceMmk: 1, isBundle: true, components: [{ componentId: f.variantId, qty: 1 }] }],
      },
      f.userId,
    );
    await expect(moveProductsToWarehouse([f.productId], f.chi.id, f.userId)).rejects.toThrow(/phải cùng kho/);
    expect(await moveProductsToWarehouse([f.productId, combo.id], f.chi.id, f.userId)).toBe(2);
  });

  /**
   * R3 (docs/ban-do-nghiep-vu-admin.md): form SP phải chặn giống chuyển kho hàng loạt, cả khi SP là thành phần.
   * Lỗi tái hiện 16/11/2026 (`saveProduct` chỉ kiểm khi chính SP là combo); sửa bằng `assertBundleWarehouses` dùng chung.
   */
  it("đổi kho qua form SP: thành phần của combo khác kho bị chặn", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 2 }]);
    const tag = f.tag.toLowerCase();
    const product = (slug: string, variants: Record<string, unknown>[]) =>
      saveProduct({ slug, brandId: f.brandId, categoryId: f.categoryId, stockLocationId: f.mm.id, my: { name: "ဆက်" }, en: { name: slug }, variants }, f.userId);
    // Thành phần tạo qua saveProduct (slug fixture có chữ hoa → form của nó không lưu lại được).
    const part = await product(`it-part-form-${tag}`, [{ sku: `PARTF-${f.tag}`, label: "50ml", priceMmk: 1 }]);
    const partVariant = await prisma.variant.findUniqueOrThrow({ where: { sku: `PARTF-${f.tag}` } });
    const combo = await product(`it-combo-form-${tag}`, [
      { sku: `SETF-${f.tag}`, label: "Set", priceMmk: 1, isBundle: true, components: [{ componentId: partVariant.id, qty: 1 }] },
    ]);
    // Chiều đã có kiểm tra: chính combo đổi kho khác thành phần.
    const comboForm = (await getProductForEdit(combo.id))!;
    await expect(saveProduct({ ...comboForm, stockLocationId: f.chi.id }, f.userId)).rejects.toThrow(/kho khác|cùng kho/);
    // Chiều R3: thành phần đổi kho, combo ở lại kho cũ.
    const partForm = (await getProductForEdit(part.id))!;
    await expect(saveProduct({ ...partForm, stockLocationId: f.chi.id }, f.userId)).rejects.toThrow(/kho khác|cùng kho/);
    const after = await prisma.product.findUniqueOrThrow({ where: { id: part.id }, select: { stockLocationId: true } });
    expect(after.stockLocationId).toBe(f.mm.id);
  });
});

describe("Quản lý kho", () => {
  it("tạo kho; không ngừng dùng được khi còn tồn / còn SP; ngừng được khi trống", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 1 }]);
    await expect(setWarehouseActive({ id: f.mm.id, active: false }, f.userId)).rejects.toThrow(/còn tồn/);
    await expect(setWarehouseActive({ id: f.chi.id, active: true }, f.userId)).resolves.toBeTruthy();

    const code = `W${f.tag.slice(0, 6)}`;
    const loc = await createWarehouse({ kind: "sell", code, name: "Kho thử", pricingMode: "LOCAL_MMK" }, f.userId);
    expect(loc).toMatchObject({ sellable: true, type: "MM_STOCK", pricingMode: "LOCAL_MMK", active: true });
    await expect(createWarehouse({ kind: "sell", code, name: "Trùng", pricingMode: "VN_IMPORT" }, f.userId)).rejects.toThrow(/đã có/);
    // P1-B (H5): kho trống đổi được cách tính giá; kho đã có SP / đã có hàng thì không.
    expect(await updateWarehouse({ id: loc.id, name: "Kho thử", pricingMode: "VN_IMPORT" }, f.userId)).toMatchObject({ pricingMode: "VN_IMPORT" });
    await expect(updateWarehouse({ id: f.mm.id, name: f.mm.name, pricingMode: "LOCAL_MMK" }, f.userId)).rejects.toThrow(/không đổi được cách tính giá/);
    expect(await updateWarehouse({ id: f.mm.id, name: "Đổi tên vẫn được", pricingMode: "VN_IMPORT" }, f.userId)).toMatchObject({ name: "Đổi tên vẫn được" });
    const off = await setWarehouseActive({ id: loc.id, active: false }, f.userId);
    expect(off.active).toBe(false);
    await expect(moveProductsToWarehouse([f.productId], loc.id, f.userId)).rejects.toThrow(/ngừng dùng/);
  });
});
