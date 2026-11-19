import { describe, expect, it, vi } from "vitest";
// Cờ hạn dùng BẬT (production đang tắt, 17/11/2026) → giữ kiểm thử đọc ngày Excel cho lúc bật lại.
vi.mock("@/lib/features", async (orig) => (await import("../support/expiry-on")).expiryOn(orig));
import { parseCsvObjects } from "@/lib/csv";
import { sheetRowsToCsv } from "@/server/catalog/catalog-sheet-read";

describe("File Excel khi bật cờ hạn dùng", () => {
  it("đọc ngày Excel và dd/mm/yyyy; ô Hạn sử dụng 'Không' = không hạn; ngày sai báo đúng dòng", () => {
    const header = ["Tên sản phẩm", "Thương hiệu *", "Danh mục *", "Hạn sử dụng", "SKU"];
    const ok = sheetRowsToCsv([["tiêu đề cũ"], header, ["A", "B", "C", new Date("2028-03-31T00:00:00Z"), "X"], [], ["A", "B", "C", "01/02/2029", "Y"], ["A", "B", "C", "Không", "Z"]]);
    expect(ok.lines).toEqual([3, 5, 6]);
    expect(parseCsvObjects(ok.csv).map((r) => r.expiry_date)).toEqual(["2028-03-31", "2029-02-01", "NONE"]);
    expect(() => sheetRowsToCsv([header, ["A", "B", "C", "31/02/2028", "X"]])).toThrow("Dòng 2");
  });
});
