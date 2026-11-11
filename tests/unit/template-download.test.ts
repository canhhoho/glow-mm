import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ getStaffUser: vi.fn() }));
const template = vi.hoisted(() => ({ catalogTemplateFile: vi.fn() }));
vi.mock("@/server/auth/session", () => auth);
vi.mock("@/server/catalog/catalog-template", () => template);
import { GET } from "@/app/api/templates/[name]/route";

const download = (name: string) => GET(new Request(`http://localhost/api/templates/${name}`), { params: Promise.resolve({ name }) });

beforeEach(() => {
  auth.getStaffUser.mockResolvedValue({ id: "staff", role: "ADMIN" });
  template.catalogTemplateFile.mockImplementation(async (current: boolean) => new Uint8Array([current ? 2 : 1]));
});

describe("Tải file Excel nhập/cập nhật sản phẩm", () => {
  it("mẫu trống và danh sách hiện có: sinh lúc tải, đúng loại file và tên tải xuống", async () => {
    const blank = await download("catalog.xlsx");
    expect(blank.status).toBe(200);
    expect(blank.headers.get("Content-Type")).toContain("spreadsheetml.sheet");
    expect(blank.headers.get("Content-Disposition")).toContain("mau-nhap-san-pham.xlsx");
    expect([...new Uint8Array(await blank.arrayBuffer())]).toEqual([1]);
    const current = await download("catalog-current.xlsx");
    expect(current.headers.get("Content-Disposition")).toMatch(/san-pham-hien-co-\d{8}\.xlsx/);
    // P2: ADMIN có quyền giá → file SP hiện có kèm cột giá.
    expect(template.catalogTemplateFile).toHaveBeenLastCalledWith(true, { withPricing: true });
    await download("catalog.xlsx");
    expect(template.catalogTemplateFile).toHaveBeenLastCalledWith(false);
  });

  it("cần đăng nhập + quyền sản phẩm; tên file lạ / mẫu cũ → 404", async () => {
    auth.getStaffUser.mockResolvedValue(null);
    expect((await download("catalog.xlsx")).status).toBe(401);
    auth.getStaffUser.mockResolvedValue({ id: "staff", role: "ORDER_STAFF" });
    expect((await download("catalog.xlsx")).status).toBe(403);
    auth.getStaffUser.mockResolvedValue({ id: "staff", role: "ADMIN" });
    for (const name of ["../catalog.xlsx", "products.xlsx", "opening.xlsx", "products.csv"]) expect((await download(name)).status).toBe(404);
  });
});
