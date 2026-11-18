import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

/** Thêm một sheet dữ liệu vào workbook mẫu, giữ nguyên sheet danh sách ẩn. */
export function addCatalogSheet(template: Uint8Array, filled: Uint8Array, name: string) {
  const files = unzipSync(template);
  const nextSheetPath = "xl/worksheets/sheet3.xml";
  const escaped = name.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
  files[nextSheetPath] = unzipSync(filled)["xl/worksheets/sheet1.xml"];
  for (const [path, closing, extra] of [
    ["xl/workbook.xml", "</sheets>", `<sheet name="${escaped}" sheetId="3" r:id="rId4"/>`],
    ["xl/_rels/workbook.xml.rels", "</Relationships>", '<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>'],
    ["[Content_Types].xml", "</Types>", `<Override PartName="/${nextSheetPath}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`],
  ]) {
    files[path] = strToU8(strFromU8(files[path]).replace(closing, `${extra}${closing}`));
  }
  return zipSync(files);
}
