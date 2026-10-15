import { describe, expect, it } from "vitest";
import {
  addLine,
  addOrderAccess,
  CART_MAX_QTY,
  cartCount,
  parseCart,
  parseOrderAccess,
  serializeCart,
  setLine,
} from "@/server/cart/cart";

const A = "cmabc12345";
const B = "cmdef67890";

describe("Giỏ hàng cookie", () => {
  it("parse/serialize hai chiều, bỏ dòng hỏng và trùng", () => {
    expect(parseCart(`${A}:2,${B}:1`)).toEqual([
      { variantId: A, qty: 2 },
      { variantId: B, qty: 1 },
    ]);
    expect(parseCart(`${A}:2,bad,${A}:5,x:1,${B}:0,${B}:-1,<script>:1`)).toEqual([{ variantId: A, qty: 2 }]);
    expect(parseCart(undefined)).toEqual([]);
    expect(serializeCart(parseCart(`${A}:2,${B}:1`))).toBe(`${A}:2,${B}:1`);
  });

  it("thêm cộng dồn, đặt 0 là xoá, giới hạn số lượng", () => {
    let c = addLine([], A, 1);
    c = addLine(c, A, 2);
    expect(c).toEqual([{ variantId: A, qty: 3 }]);
    c = setLine(c, B, 500);
    expect(c[1]).toEqual({ variantId: B, qty: CART_MAX_QTY });
    expect(cartCount(c)).toBe(3 + CART_MAX_QTY);
    expect(setLine(c, A, 0)).toEqual([{ variantId: B, qty: CART_MAX_QTY }]);
  });

  it("danh sách đơn đã đặt: JSON hỏng → rỗng, mới nhất lên đầu, không trùng", () => {
    expect(parseOrderAccess("{bad")).toEqual([]);
    const l = addOrderAccess(addOrderAccess([], { c: "OD-1", p: "09" }), { c: "OD-1", p: "09" });
    expect(l).toHaveLength(1);
    expect(parseOrderAccess(JSON.stringify(addOrderAccess(l, { c: "OD-2", p: "09" })))[0].c).toBe("OD-2");
  });
});
