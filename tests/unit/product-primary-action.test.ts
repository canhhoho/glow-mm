import { describe, expect, it } from "vitest";
import { productPrimaryAction } from "@/server/catalog/product-actions";

const base = { archived: false, published: false, pendingReview: false, approved: false, hasChanges: false, ready: true, canManage: true, canApprove: true, canPublish: true, canSubmit: false };
const pick = (over: Partial<typeof base>) => productPrimaryAction({ ...base, ...over });

describe("nút chính ở đầu trang sản phẩm", () => {
  it("ngừng kinh doanh: chỉ Khôi phục (cần quyền quản lý), không đăng/nhập/gửi duyệt", () => {
    expect(pick({ archived: true, canSubmit: true, published: true })).toBe("restore");
    expect(pick({ archived: true, canManage: false })).toBeNull();
  });

  it("chờ duyệt: người duyệt thấy Duyệt (& Đăng khi có quyền đăng), người khác không có nút duyệt", () => {
    expect(pick({ pendingReview: true })).toBe("approvePublish");
    expect(pick({ pendingReview: true, canPublish: false })).toBe("approveOnly");
    expect(pick({ pendingReview: true, approved: true, hasChanges: true })).toBe("approveChanges");
    expect(pick({ pendingReview: true, canApprove: false })).toBe("edit");
  });

  it("nháp đủ điều kiện → Gửi duyệt; SP đã duyệt có bản sửa → Gửi duyệt lại", () => {
    expect(pick({ canSubmit: true })).toBe("submit");
    expect(pick({ canSubmit: true, approved: true, hasChanges: true, published: true })).toBe("submit");
  });

  it("đã duyệt, chưa hiển thị, không còn lỗi, có quyền đăng → Bật hiển thị", () => {
    expect(pick({ approved: true })).toBe("publish");
    expect(pick({ approved: true, ready: false })).toBe("edit");
    expect(pick({ approved: true, canPublish: false })).toBe("edit");
    expect(pick({ approved: true, hasChanges: true })).toBe("edit");
  });

  it("đang bán hoặc chưa đủ điều kiện → Sửa; không quyền quản lý → không có nút", () => {
    expect(pick({ published: true, approved: true })).toBe("edit");
    expect(pick({})).toBe("edit");
    expect(pick({ canManage: false, canApprove: false, canPublish: false })).toBeNull();
  });
});
