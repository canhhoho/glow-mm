import { describe, expect, it } from "vitest";
import { approvalHash, deriveLabel, labelWhere, type ApprovalSnapshot, type LabelInput } from "@/server/catalog/approval-rules";
import { summarizeChanges, type SummaryLive } from "@/server/catalog/change-summary";

const base = (): ApprovalSnapshot => ({
  categoryId: "c1",
  brandId: "b1",
  content: [
    { locale: "my", name: "ဆပ်ပြာ", description: "ဖော်ပြ" },
    { locale: "en", name: "Soap", description: "Desc" },
  ],
  variants: [
    { sku: "A", label: "50ml", priceMmk: 10_000, active: true },
    { sku: "B", label: "100ml", priceMmk: 18_000, active: true },
  ],
  images: ["f1", "f2"],
});

describe("approvalHash (phần cần duyệt)", () => {
  it("không đổi theo thứ tự bản dịch/biến thể/ảnh hay khoảng trắng thừa", () => {
    const b = base();
    const shuffled = {
      ...b,
      content: [...b.content].reverse().map((c) => ({ ...c, name: ` ${c.name} ` })),
      variants: [...b.variants].reverse(),
      images: ["f2", "f1"],
    };
    expect(approvalHash(shuffled)).toBe(approvalHash(b));
  });

  it("đổi giá, nhãn, tắt loại, mô tả, danh mục, thương hiệu, combo hoặc thêm/xoá ảnh → khác", () => {
    const h = approvalHash(base());
    const variants = (patch: Partial<ApprovalSnapshot["variants"][number]>) => ({ ...base(), variants: [{ ...base().variants[0], ...patch }, base().variants[1]] });
    for (const changed of [
      variants({ priceMmk: 11_000 }),
      variants({ label: "60ml" }),
      variants({ active: false }),
      variants({ isBundle: true, components: [{ componentId: "x", qty: 2 }] }),
      { ...base(), content: [base().content[0], { ...base().content[1], description: "New" }] },
      { ...base(), categoryId: "c2" },
      { ...base(), brandId: "b2" },
      { ...base(), images: ["f1"] },
      { ...base(), images: ["f1", "f2", "f3"] },
    ]) {
      expect(approvalHash(changed)).not.toBe(h);
    }
  });
});

describe("deriveLabel / labelWhere", () => {
  const p = (patch: Partial<LabelInput>): LabelInput => ({ archivedAt: null, published: false, approvedAt: null, approvalStatus: "DRAFT", hasChanges: false, ...patch });
  const approved = new Date();

  it("một nhãn chính theo thứ tự ưu tiên", () => {
    expect(deriveLabel(p({}))).toEqual({ label: "DRAFT", change: null });
    expect(deriveLabel(p({ approvalStatus: "PENDING" }))).toEqual({ label: "PENDING", change: null });
    expect(deriveLabel(p({ approvalStatus: "REJECTED" }))).toEqual({ label: "REJECTED", change: null });
    expect(deriveLabel(p({ approvedAt: approved, approvalStatus: "APPROVED" }))).toEqual({ label: "HIDDEN", change: null });
    expect(deriveLabel(p({ approvedAt: approved, approvalStatus: "APPROVED", published: true }))).toEqual({ label: "PUBLISHED", change: null });
    expect(deriveLabel(p({ archivedAt: approved, published: false }))).toMatchObject({ label: "ARCHIVED" });
  });

  it("SP đã duyệt có bản đang sửa → nhãn phụ theo trạng thái bản đang sửa", () => {
    const live = { approvedAt: approved, published: true, hasChanges: true };
    expect(deriveLabel(p({ ...live, approvalStatus: "DRAFT" })).change).toBe("DRAFT");
    expect(deriveLabel(p({ ...live, approvalStatus: "PENDING" }))).toEqual({ label: "PUBLISHED", change: "PENDING" });
    expect(deriveLabel(p({ ...live, approvalStatus: "REJECTED" })).change).toBe("REJECTED");
  });

  it("labelWhere khớp deriveLabel cho mọi tổ hợp", () => {
    const matches = (where: Record<string, unknown>, x: LabelInput) =>
      Object.entries(where).every(([k, cond]) => {
        const v = x[k as keyof LabelInput];
        if (cond === null) return v === null;
        if (typeof cond === "object" && cond && "not" in cond) return v !== null;
        if (typeof cond === "object" && cond && "in" in cond) return (cond.in as unknown[]).includes(v);
        return v === cond;
      });
    for (const archivedAt of [null, approved])
      for (const published of [false, true])
        for (const approvedAt of [null, approved])
          for (const approvalStatus of ["DRAFT", "PENDING", "REJECTED", "APPROVED"] as const) {
            if (published && !approvedAt) continue; // CHECK DB: đang bán phải có bản đã duyệt
            if (approvalStatus === "APPROVED" && !approvedAt) continue; // CHECK DB
            const x = p({ archivedAt, published: published && !archivedAt, approvedAt, approvalStatus });
            const { label } = deriveLabel(x);
            expect(matches(labelWhere(label), x)).toBe(true);
          }
  });
});

describe("summarizeChanges", () => {
  const live: SummaryLive = {
    brandId: "b1",
    categoryId: "c1",
    my: { name: "A", description: "d" },
    en: { name: "A", description: "d" },
    variants: [{ id: "v1", sku: "S1", label: "50ml", active: true, isBundle: false, components: [], priceMmk: 10_000 }],
  };
  it("liệt kê từng thay đổi: tên, danh mục, loại mới, giá, ảnh", () => {
    const items = summarizeChanges(live, {
      content: { ...live, categoryId: "c2", en: { name: "B", description: "d" }, variants: [...live.variants, { sku: "S2", label: "100ml", active: true, isBundle: false, components: [] }] },
      prices: { v1: { priceMmk: 12_000, baseLivePrice: 10_000 } },
      images: { add: [{}], remove: [] },
    });
    expect(items).toEqual([
      { kind: "name", locale: "en" },
      { kind: "category" },
      { kind: "variantNew", sku: "S2" },
      { kind: "price", sku: "S1", from: 10_000, to: 12_000 },
      { kind: "imagesAdded", count: 1 },
    ]);
  });
});
