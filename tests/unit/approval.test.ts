import { describe, expect, it } from "vitest";
import { approvalHash, approvalState, type ApprovalSnapshot } from "@/server/catalog/approval-rules";

const base = (): ApprovalSnapshot => ({
  categoryId: "c1",
  brandId: "b1",
  content: [
    { locale: "my", name: "ဆပ်ပြာ", description: "ဖော်ပြ" },
    { locale: "en", name: "Soap", description: "Desc" },
  ],
  variants: [
    { sku: "A", label: "50ml", priceMmk: 10_000, active: true, weightGrams: 80 },
    { sku: "B", label: "100ml", priceMmk: 18_000, active: true, weightGrams: 150 },
  ],
  images: ["f1", "f2"],
});

describe("approvalHash (QT2)", () => {
  it("không đổi theo thứ tự bản dịch/biến thể hay khoảng trắng thừa", () => {
    const b = base();
    const shuffled = { ...b, content: [...b.content].reverse().map((c) => ({ ...c, name: ` ${c.name} ` })), variants: [...b.variants].reverse() };
    expect(approvalHash(shuffled)).toBe(approvalHash(b));
  });

  it("đổi giá, nhãn, tắt loại, khối lượng, mô tả, danh mục, thương hiệu hoặc thứ tự ảnh → khác", () => {
    const h = approvalHash(base());
    const variants = (patch: Partial<ApprovalSnapshot["variants"][number]>) => ({ ...base(), variants: [{ ...base().variants[0], ...patch }, base().variants[1]] });
    for (const changed of [
      variants({ priceMmk: 11_000 }),
      variants({ label: "60ml" }),
      variants({ active: false }),
      variants({ weightGrams: 90 }),
      { ...base(), content: [base().content[0], { ...base().content[1], description: "New" }] },
      { ...base(), categoryId: "c2" },
      { ...base(), brandId: "b2" },
      { ...base(), images: ["f2", "f1"] },
    ]) {
      expect(approvalHash(changed)).not.toBe(h);
    }
  });

  it("trạng thái: chưa duyệt / đã duyệt / sửa sau khi duyệt", () => {
    expect(approvalState({ approvedAt: null, approvedHash: null })).toBe("PENDING");
    expect(approvalState({ approvedAt: new Date(), approvedHash: null })).toBe("APPROVED");
    expect(approvalState({ approvedAt: null, approvedHash: "x" })).toBe("STALE");
  });
});
