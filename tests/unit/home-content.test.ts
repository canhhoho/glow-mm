import { describe, expect, it } from "vitest";
import { utcToYangonLocal, yangonLocalToUtc } from "@/lib/time";
import { isInSchedule, linkSchema, moveInList, scheduleSchema } from "@/server/content/common";
import { checkImage, sniffImageMime } from "@/server/files/public-images";

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");

describe("Nội dung trang chủ — phần thuần", () => {
  it("link đích: chỉ đường dẫn nội bộ hoặc https", () => {
    expect(linkSchema.parse("/c/skincare")).toBe("/c/skincare");
    expect(linkSchema.parse("https://m.me/glow")).toBe("https://m.me/glow");
    expect(linkSchema.parse("")).toBeNull();
    expect(linkSchema.parse(undefined)).toBeNull();
    for (const bad of ["javascript:alert(1)", "//evil.com/x", "http://a.com", "data:text/html,x", "c/skincare", "/a b"]) {
      expect(linkSchema.safeParse(bad).success, bad).toBe(false);
    }
  });

  it("lịch hiển thị: kết thúc phải sau bắt đầu; ô trống = không giới hạn", () => {
    const d = (s: string) => new Date(s);
    expect(scheduleSchema.safeParse({ startAt: d("2026-10-20T00:00Z"), endAt: d("2026-10-19T00:00Z") }).success).toBe(false);
    expect(scheduleSchema.safeParse({ startAt: null, endAt: null }).success).toBe(true);
    const now = d("2026-10-20T12:00Z");
    expect(isInSchedule({ startAt: null, endAt: null }, now)).toBe(true);
    expect(isInSchedule({ startAt: d("2026-10-21T00:00Z"), endAt: null }, now)).toBe(false);
    expect(isInSchedule({ startAt: null, endAt: now }, now)).toBe(false); // endAt là mốc loại trừ
    expect(isInSchedule({ startAt: now, endAt: null }, now)).toBe(true);
  });

  it("đổi chỗ lên/xuống; không di chuyển được thì null", () => {
    expect(moveInList(["a", "b", "c"], "b", "up")).toEqual(["b", "a", "c"]);
    expect(moveInList(["a", "b", "c"], "b", "down")).toEqual(["a", "c", "b"]);
    expect(moveInList(["a", "b"], "a", "up")).toBeNull();
    expect(moveInList(["a", "b"], "b", "down")).toBeNull();
    expect(moveInList(["a"], "x", "up")).toBeNull();
  });

  it("giờ Yangon (UTC+06:30) ↔ UTC cho ô datetime-local", () => {
    expect(yangonLocalToUtc("2026-10-20T08:00").toISOString()).toBe("2026-10-20T01:30:00.000Z");
    expect(utcToYangonLocal(new Date("2026-10-20T01:30:00Z"))).toBe("2026-10-20T08:00");
    expect(() => yangonLocalToUtc("2026-10-20 08:00")).toThrow();
  });

  it("ảnh: nhận theo magic bytes, từ chối SVG / mime giả", () => {
    expect(sniffImageMime(PNG)).toBe("image/png");
    expect(sniffImageMime(Buffer.from("<svg onload=alert(1)/>"))).toBeNull();
    expect(checkImage({ data: PNG, mime: "image/png" }, Error)).toBe("image/png");
    expect(() => checkImage({ data: Buffer.from("<svg/>"), mime: "image/png" }, Error)).toThrow(/không hợp lệ/);
    expect(() => checkImage({ data: PNG, mime: "image/svg+xml" }, Error)).toThrow(/không hợp lệ/);
  });
});
