import { describe, expect, it } from "vitest";
import Rabbit from "rabbit-node";
import { applyImport, buildExportRows, flatten, parseCsv, placeholders, toCsv, type ExportInput } from "@/lib/i18n-csv";

const files = (): ExportInput => ({
  store: {
    en: { Cart: { count: "{count} items", title: "Cart" }, Info: { about: { body: ["A", "B"] } } },
    my: { Cart: { count: "{count} ခု", title: "ဈေးခြင်း" }, Info: { about: { body: ["က", "ခ"] } } },
  },
  admin: { en: { Nav: { home: "Home" } }, my: { Nav: { home: "ပင်မ" } }, vi: { Nav: { home: "Trang chủ" } } },
});

describe("Bản dịch CSV", () => {
  it("làm phẳng cả mảng; biến ICU", () => {
    expect([...flatten(files().store.en).keys()]).toEqual(["Cart.count", "Cart.title", "Info.about.body.0", "Info.about.body.1"]);
    expect(placeholders("{n, plural, one {# item} other {# items}} của {name}")).toEqual(["n", "name"]);
  });

  it("CSV: ô có dấu phẩy, nháy, xuống dòng đi-về nguyên vẹn (có BOM cho Excel)", () => {
    const rows = [["a,b", 'say "hi"', "dòng 1\ndòng 2", "မြန်မာ"]];
    const csv = toCsv(rows);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(parseCsv(csv)).toEqual(rows);
  });

  it("export đánh dấu key cần duyệt; import lại y nguyên thì không đổi gì và bỏ key đã duyệt", () => {
    const rows = buildExportRows(files(), { store: ["Cart.title"], admin: [] });
    expect(rows[0]).toEqual(["file", "key", "en", "vi", "my", "review"]);
    expect(rows.find((r) => r[1] === "Cart.title")?.[5]).toBe("x");
    expect(rows.find((r) => r[1] === "Nav.home")).toEqual(["admin", "Nav.home", "Home", "Trang chủ", "ပင်မ", ""]);

    const same = applyImport(parseCsv(toCsv(rows)), files(), { store: ["Cart.title"], admin: [] });
    expect(same.errors).toEqual([]);
    expect(same.my.store).toEqual(files().store.my);
    expect(same.review.store).toEqual(["Cart.title"]); // vẫn còn "x"

    const reviewed = rows.map((r) => (r[1] === "Cart.title" ? [...r.slice(0, 4), "ခြင်း", ""] : r));
    const done = applyImport(reviewed, files(), { store: ["Cart.title"], admin: [] });
    expect(done.review.store).toEqual([]);
    expect((done.my.store.Cart as Record<string, string>).title).toBe("ခြင်း");
  });

  it("từ chối key lạ, thiếu biến; chuyển Zawgyi → Unicode", () => {
    const head = ["file", "key", "my", "review"];
    const bad = applyImport([head, ["store", "Cart.nope", "x", ""], ["store", "Cart.count", "ခု", ""]], files(), { store: [], admin: [] });
    expect(bad.errors.join("\n")).toMatch(/Cart\.nope.*không tồn tại/);
    expect(bad.errors.join("\n")).toMatch(/Cart\.count cần biến \{count\}/);

    const zg = Rabbit.uni2zg("မြန်မာ");
    const ok = applyImport([head, ["admin", "Nav.home", zg, ""]], files(), { store: [], admin: [] });
    expect(ok.errors).toEqual([]);
    expect((ok.my.admin.Nav as Record<string, string>).home).toBe("မြန်မာ");
  });
});
