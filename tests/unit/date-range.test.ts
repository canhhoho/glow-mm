import { describe, expect, it } from "vitest";
import { datePresetItems, optionalRange, presetRange, requiredRange } from "@/lib/date-range";

// 21/11/2026 (audit #10): khoảng ngày dùng chung cho bộ lọc admin, theo ngày Yangon (UTC+6:30).
const now = new Date("2026-03-01T20:00:00Z"); // 02:30 ngày 02/03 giờ Yangon

describe("lib/date-range", () => {
  it("nút nhanh tính theo ngày Yangon; tháng trước qua tháng 2", () => {
    expect(presetRange("today", now)).toEqual({ from: "2026-03-02", to: "2026-03-02" });
    expect(presetRange("last7", now)).toEqual({ from: "2026-02-24", to: "2026-03-02" });
    expect(presetRange("last30", now)).toEqual({ from: "2026-02-01", to: "2026-03-02" });
    expect(presetRange("thisMonth", now)).toEqual({ from: "2026-03-01", to: "2026-03-02" });
    expect(presetRange("lastMonth", now)).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(presetRange("lastMonth", new Date("2026-01-15T00:00:00Z"))).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  });

  it("khoảng tuỳ chọn: bỏ ngày sai, đảo khi nhập ngược", () => {
    expect(optionalRange({ from: "2026-02-30", to: "x" })).toEqual({ from: undefined, to: undefined });
    expect(optionalRange({ from: "2026-03-05", to: "2026-03-01" })).toEqual({ from: "2026-03-01", to: "2026-03-05" });
    expect(optionalRange({ from: ["2026-03-05"] })).toEqual({ from: undefined, to: undefined });
  });

  it("khoảng bắt buộc: mặc định N ngày, đảo, cắt theo độ dài tối đa", () => {
    const opts = { defaultDays: 30, maxDays: 90, now };
    expect(requiredRange({}, opts)).toEqual({ from: "2026-02-01", to: "2026-03-02" });
    expect(requiredRange({ to: "2026-01-31" }, opts)).toEqual({ from: "2026-01-02", to: "2026-01-31" });
    expect(requiredRange({ from: "2026-03-10", to: "2026-03-01" }, opts)).toEqual({ from: "2026-03-01", to: "2026-03-10" });
    expect(requiredRange({ from: "2025-01-01", to: "2026-03-02" }, opts)).toEqual({ from: "2025-12-03", to: "2026-03-02" });
  });

  it("nút nhanh: đánh dấu nút đang khớp khoảng hiện tại, href do trang dựng", () => {
    const labels = { today: "T", last7: "7", last30: "30", thisMonth: "M", lastMonth: "LM" };
    const items = datePresetItems(labels, (r) => `/x?from=${r.from}&to=${r.to}`, { from: "2026-02-24", to: "2026-03-02" }, now);
    expect(items.filter((i) => i.active).map((i) => i.key)).toEqual(["last7"]);
    expect(items.find((i) => i.key === "lastMonth")?.href).toBe("/x?from=2026-02-01&to=2026-02-28");
  });
});
