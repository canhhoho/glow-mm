import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { readSheet } from "read-excel-file/node";
import { unzipSync, strFromU8 } from "fflate";
import local from "../../prisma/data/vtp-myanmar-addresses.json";
import { VTP_ADDRESSES, resolveVtpAddress, vtpPreview, vtpRow, type VtpSourceOrder } from "@/server/orders/vtp-data";
import { fillVtpTemplate } from "@/server/orders/vtp-workbook";

const source: VtpSourceOrder = {
  id: "one", code: "DEMO-VTP-001", recipientName: "မသန္တာ", recipientPhone: "0978000000", recipientPhone2: "0940000000",
  addressText: "No. 7, Pyay Road", zoneName: "Kamaryut, Yangon (West), Yangon", stateCode: "YGN", districtCode: "WYG", townshipCode: "KMY",
  paymentMethod: "COD", paymentStatus: "UNPAID", subtotalMmk: 50000, totalMmk: 50000, note: "Call before delivery",
  items: [{ sku: "A", name: "Sunscreen 50 ml", qty: 2, variant: { weightGrams: 80 } }],
};
const options = { weightGrams: 200, addressKey: resolveVtpAddress(source)!.key, recipientName: source.recipientName, note: "Phone 2: 0940000000", service: "VNM - Normal Intra City", chargePayer: "Receiver", pickupTime: "" };

describe("Dữ liệu xuất VTP", () => {
  it("đối chiếu đủ địa chỉ theo tên và cấp cha, kể cả mã VTP khác", () => {
    for (const state of local) for (const district of state.districts) for (const township of district.townships) {
      expect(resolveVtpAddress({ stateCode: state.code, districtCode: district.code, townshipCode: township.code }), `${state.nameEn}/${district.nameEn}/${township.nameEn}`).not.toBeNull();
    }
    expect(new Set(VTP_ADDRESSES.map((a) => a.key)).size).toBe(VTP_ADDRESSES.length);
    expect(resolveVtpAddress(source)).toMatchObject({ state: "YGN-Yangon", township: "KMY-Kamaryut" });
    expect(resolveVtpAddress({ stateCode: "YGN", districtCode: "wrong", townshipCode: "KMY" })).toBeNull();
  });

  it("không cộng khối lượng một phần; lấy số lượng nhân trọng lượng từng biến thể", () => {
    expect(vtpPreview(source).weightGrams).toBe(160);
    expect(vtpPreview({ ...source, items: [...source.items, { sku: "UNKNOWN", name: "Other", qty: 1, variant: { weightGrams: null } }] })).toMatchObject({ weightGrams: null, missingWeights: ["UNKNOWN"] });
  });

  it("COD chỉ thu khi chưa trả, chuyển khoản và COD đã trả xuất 0", () => {
    expect(vtpPreview(source).codMmk).toBe(50000);
    expect(vtpPreview({ ...source, paymentMethod: "BANK_TRANSFER", paymentStatus: "PAID" }).codMmk).toBe(0);
    expect(vtpPreview({ ...source, paymentStatus: "PAID" }).codMmk).toBe(0);
    expect(vtpPreview(source).note).toContain(source.recipientPhone2);
  });

  it("đúng 21 cột, các số liệu lấy từ đơn; không tự điền kích thước", () => {
    const row = vtpRow(source, options, 0);
    expect(row).toHaveLength(21);
    expect(row.slice(0, 4)).toEqual([1, source.code, source.recipientName, source.recipientPhone]);
    expect(row.slice(9, 14)).toEqual([200, 50000, 50000, "Goods", "VNM - Normal Intra City"]);
    expect(row.slice(14, 20)).toEqual(["", "", "", "", "Receiver", ""]);
  });

  it("chặn dịch vụ, địa chỉ, khối lượng hoặc độ dài không đúng mẫu", () => {
    for (const change of [{ weightGrams: 0 }, { weightGrams: 1.5 }, { addressKey: "wrong" }, { service: "wrong" }, { note: "X".repeat(151) }, { recipientName: "X".repeat(51) }]) {
      expect(() => vtpRow(source, { ...options, ...change }, 0)).toThrow();
    }
  });
});

describe("File Excel theo mẫu OMS", () => {
  it("thay dữ liệu mẫu, giữ nguyên các sheet ẩn, styles, ảnh và validation", async () => {
    const template = await readFile("src/server/orders/templates/vtp-myanmar.xlsx");
    const row = vtpRow({ ...source, recipientName: "=TEST & <name>" }, { ...options, recipientName: "=TEST & <name>" }, 0);
    const output = fillVtpTemplate(template, [row, vtpRow({ ...source, code: "DEMO-002", paymentMethod: "BANK_TRANSFER", paymentStatus: "PAID" }, options, 1)]);
    const original = unzipSync(template), result = unzipSync(output);
    for (const key of Object.keys(original)) if (!["xl/worksheets/sheet1.xml", "xl/calcChain.xml", "xl/_rels/workbook.xml.rels", "[Content_Types].xml"].includes(key)) expect(result[key], key).toEqual(original[key]);
    const originalXml = strFromU8(original["xl/worksheets/sheet1.xml"]), outputXml = strFromU8(result["xl/worksheets/sheet1.xml"]);
    expect(outputXml.match(/<dataValidations[\s\S]*?<\/dataValidations>/)?.[0]).toBe(originalXml.match(/<dataValidations[\s\S]*?<\/dataValidations>/)?.[0]);
    expect(outputXml).toContain('r="D8" s="38" t="inlineStr"');
    expect(outputXml).not.toContain("<f>");
    expect(result["xl/calcChain.xml"]).toBeUndefined();
    const rows = await readSheet(Buffer.from(output), "Order list");
    expect(rows).toHaveLength(9);
    expect(rows[7].map((v) => v ?? "")).toEqual(row);
    expect(rows[8][1]).toBe("DEMO-002");
    expect(rows[8][11]).toBe(0);
    expect(rows[7][3]).toBe("0978000000");
  });

  it("không xuất danh sách trống hoặc quá 200 đơn", async () => {
    const template = await readFile("src/server/orders/templates/vtp-myanmar.xlsx");
    expect(() => fillVtpTemplate(template, [])).toThrow("1 đến 200");
    expect(() => fillVtpTemplate(template, Array.from({ length: 201 }, () => vtpRow(source, options, 0)))).toThrow("1 đến 200");
  });
});
