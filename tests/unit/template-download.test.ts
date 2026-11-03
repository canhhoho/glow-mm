import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ getStaffUser: vi.fn() }));
vi.mock("@/server/auth/session", () => auth);
vi.mock("@/server/catalog/products", () => ({ PRODUCT_CSV_COLUMNS: ["product_slug", "sku"], STOCK_CSV_COLUMNS: ["sku", "location_code"] }));
import { GET } from "@/app/api/templates/[name]/route";

const download = (name: string) => GET(new Request(`http://localhost/api/templates/${name}`), { params: Promise.resolve({ name }) });

beforeEach(() => auth.getStaffUser.mockResolvedValue({ id: "staff" }));

describe("Tải file mẫu Excel", () => {
  it.each(["products", "stock"])("%s: trả đúng file Excel và tên tải xuống", async (kind) => {
    const response = await download(`${kind}.xlsx`);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("spreadsheetml.sheet");
    expect(response.headers.get("Content-Disposition")).toContain(`${kind}.xlsx`);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(await readFile(`public/templates/${kind}.xlsx`));
  });

  it("yêu cầu đăng nhập và từ chối tên file không hỗ trợ", async () => {
    auth.getStaffUser.mockResolvedValue(null);
    expect((await download("products.xlsx")).status).toBe(401);
    auth.getStaffUser.mockResolvedValue({ id: "staff" });
    expect((await download("../products.xlsx")).status).toBe(404);
    expect((await download("products.csv")).headers.get("Content-Type")).toContain("text/csv");
  });
});
