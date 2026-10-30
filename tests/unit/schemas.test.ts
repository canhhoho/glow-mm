import Rabbit from "rabbit-node";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { routing } from "@/i18n/routing";
import {
  confirmPasswordSchema,
  emailSchema,
  formId,
  localeSchema,
  mmText,
  mmTextReq,
  newPasswordSchema,
  phoneSchema,
  rawId,
  slugSchema,
  withConfirm,
} from "@/lib/schemas";

// Mẫu như tests/unit/myanmar.test.ts: chuỗi Unicode chuyển sang Zawgyi bằng Rabbit.
const UNICODE = "ပစ္စည်းရောက်မှ ငွေချေ";
const ZAWGYI = Rabbit.uni2zg(UNICODE);

describe("Khối Zod dùng chung (P21)", () => {
  it("id: rawId không trim; formId trim + max, rỗng → too_small không có path", () => {
    expect(rawId.parse(" a ")).toBe(" a ");
    expect(formId(5).parse("  ab ")).toBe("ab");
    expect(formId(5).safeParse("abcdef").success).toBe(false);
    const r = formId(64).safeParse("   ");
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]).toMatchObject({ code: "too_small", path: [] });
  });

  it("mmText chuyển Zawgyi → Unicode; mmTextReq kiểm min trước khi chuyển", () => {
    expect(mmText(100).parse(` ${ZAWGYI} `)).toBe(UNICODE);
    expect(mmText(100).parse("")).toBe("");
    expect(mmTextReq(100).safeParse("  ").success).toBe(false);
    expect(mmTextReq(500, 3).safeParse("ab").success).toBe(false);
    expect(mmTextReq(100).parse(ZAWGYI)).toBe(UNICODE);
  });

  it("SĐT, email", () => {
    expect(phoneSchema.parse(" 09 1234 ")).toBe("09 1234");
    expect(phoneSchema.safeParse("1".repeat(31)).success).toBe(false);
    expect(emailSchema.parse("  A@Glow.Local ")).toBe("a@glow.local");
    expect(emailSchema.safeParse("khong-phai-email").success).toBe(false);
  });

  it("slug giữ câu báo lỗi truyền vào", () => {
    expect(slugSchema(60).parse("bo-suu-tap-1")).toBe("bo-suu-tap-1");
    const r = slugSchema(60, "Slug chỉ gồm a-z, 0-9 và dấu -").safeParse("Có Dấu");
    expect(r.error?.issues[0].message).toBe("Slug chỉ gồm a-z, 0-9 và dấu -");
  });

  it("mật khẩu + withConfirm: lỗi khớp ở path confirmPassword, message mismatch", () => {
    const s = withConfirm(z.object({ password: newPasswordSchema(8), confirmPassword: confirmPasswordSchema }), "password");
    expect(s.safeParse({ password: "12345678", confirmPassword: "12345678" }).success).toBe(true);
    expect(s.safeParse({ password: "1234567", confirmPassword: "1234567" }).error?.issues[0].path).toEqual(["password"]);
    expect(s.safeParse({ password: "12345678", confirmPassword: "x" }).error?.issues[0]).toMatchObject({
      path: ["confirmPassword"],
      message: "mismatch",
    });
  });

  it("localeSchema khớp routing.locales", () => {
    expect(localeSchema.options).toEqual([...routing.locales]);
  });
});
