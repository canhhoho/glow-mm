import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveVtpAddress } from "@/server/orders/vtp-data";

const mocks = vi.hoisted(() => ({ user: vi.fn(), orders: vi.fn(), workbook: vi.fn() }));
vi.mock("@/server/auth/session", () => ({ getStaffUser: mocks.user }));
vi.mock("@/server/orders/vtp-queries", () => ({ vtpOrders: mocks.orders }));
vi.mock("@/server/orders/vtp-workbook", () => ({ createVtpWorkbook: mocks.workbook }));
import { POST } from "@/app/api/admin/orders/vtp-export/route";

const order = {
  id: "one", code: "OD-TEST", recipientName: "Demo", recipientPhone: "0978000000", recipientPhone2: null,
  addressText: "Street 1", zoneName: "Kamaryut", stateCode: "YGN", districtCode: "WYG", townshipCode: "KMY",
  paymentMethod: "COD", paymentStatus: "UNPAID", subtotalMmk: 50000, totalMmk: 50000, note: "",
  items: [{ sku: "A", name: "Sunscreen", qty: 1, variant: { weightGrams: 80 } }],
};
const selection = { id: order.id, weightGrams: 100, addressKey: resolveVtpAddress(order)!.key, recipientName: "Demo", note: "" };
const body = { service: "VNM - Normal Intra City", chargePayer: "Receiver", orders: [selection] };
const request = (input: unknown = body) => POST(new Request("http://localhost/api/admin/orders/vtp-export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ id: "staff", role: "ORDER_STAFF" });
  mocks.orders.mockResolvedValue([order]);
  mocks.workbook.mockResolvedValue(new Uint8Array([80, 75]));
});

describe("API xuất VTP", () => {
  it("chỉ cho nhân viên có quyền giao hàng xuất", async () => {
    mocks.user.mockResolvedValue(null);
    expect((await request()).status).toBe(401);
    mocks.user.mockResolvedValue({ role: "WAREHOUSE_MANAGER" });
    expect((await request()).status).toBe(403);
    expect(mocks.orders).not.toHaveBeenCalled();
  });

  it("lấy tiền và hàng hóa từ DB, bỏ qua giá trị giả do client gửi", async () => {
    const response = await request({ ...body, orders: [{ ...selection, totalMmk: 1, codMmk: 1 }] });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("spreadsheetml.sheet");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.workbook.mock.calls[0][0][0].slice(9, 12)).toEqual([100, 50000, 50000]);
  });

  it("chặn đơn không còn chuẩn bị giao hoặc ID trùng", async () => {
    mocks.orders.mockResolvedValue([]);
    expect((await request()).status).toBe(409);
    expect(mocks.workbook).not.toHaveBeenCalled();
    expect((await request({ ...body, orders: [selection, selection] })).status).toBe(400);
  });

  it("chặn thiếu cân nặng hoặc dịch vụ lạ trước khi tạo file", async () => {
    expect((await request({ ...body, orders: [{ ...selection, weightGrams: 0 }] })).status).toBe(400);
    expect((await request({ ...body, service: "INVALID" })).status).toBe(400);
    expect(mocks.workbook).not.toHaveBeenCalled();
  });
});
