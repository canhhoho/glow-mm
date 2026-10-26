import { describe, expect, it } from "vitest";
import { can, isRole, PERMISSIONS, ROLES } from "@/server/auth/roles";

describe("RBAC", () => {
  it("admin có mọi quyền", () => {
    for (const p of Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]) expect(can("ADMIN", p)).toBe(true);
  });

  it("quản lý kho: nhận/xuất/chuyển/điều chỉnh, không duyệt thanh toán, không sửa giá", () => {
    expect(can("WAREHOUSE_MANAGER", "stock:receive")).toBe(true);
    expect(can("WAREHOUSE_MANAGER", "stock:issue")).toBe(true);
    expect(can("WAREHOUSE_MANAGER", "stock:transfer")).toBe(true);
    expect(can("WAREHOUSE_MANAGER", "stock:adjust")).toBe(true);
    expect(can("WAREHOUSE_MANAGER", "orders:confirm-payment")).toBe(false);
    expect(can("WAREHOUSE_MANAGER", "pricing:manage")).toBe(false);
  });

  it("nhân viên đơn hàng: duyệt thanh toán + giao hàng, không đụng kho", () => {
    expect(can("ORDER_STAFF", "orders:confirm-payment")).toBe(true);
    expect(can("ORDER_STAFF", "orders:ship")).toBe(true);
    expect(can("ORDER_STAFF", "stock:receive")).toBe(false);
    expect(can("ORDER_STAFF", "stock:adjust")).toBe(false);
    expect(can("ORDER_STAFF", "users:manage")).toBe(false);
  });

  it("không có role → không có quyền", () => {
    expect(can(null, "dashboard:view")).toBe(false);
    expect(can(undefined, "orders:view")).toBe(false);
  });

  it("isRole chỉ nhận role hợp lệ", () => {
    for (const r of ROLES) expect(isRole(r)).toBe(true);
    expect(isRole("CUSTOMER")).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });

  it("CTV không phải nhân viên: không có quyền admin nào", () => {
    expect(isRole("AFFILIATE")).toBe(false);
    for (const p of Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]) {
      expect(can("AFFILIATE" as never, p)).toBe(false);
    }
  });

  it("gán CTV cho đơn: admin + NV đơn hàng; quản lý CTV: chỉ admin", () => {
    expect(can("ORDER_STAFF", "orders:assign-affiliate")).toBe(true);
    expect(can("WAREHOUSE_MANAGER", "orders:assign-affiliate")).toBe(false);
    expect(can("ORDER_STAFF", "affiliates:manage")).toBe(false);
  });
});
