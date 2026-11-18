import { strFromU8, unzipSync } from "fflate";

export const MAX_CATALOG_FILE_BYTES = 2 * 1024 * 1024;

/** Chỉ đọc metadata của workbook trong trình duyệt. Dữ liệu ô được đọc trên server khi xem trước. */
export async function visibleXlsxSheets(file: File): Promise<string[]> {
  const path = "xl/workbook.xml";
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter: (entry) => entry.name === path && entry.originalSize <= MAX_CATALOG_FILE_BYTES,
  });
  if (!files[path]) throw new Error("Missing workbook metadata");
  const { documentElement } = new DOMParser().parseFromString(strFromU8(files[path]), "application/xml");
  if (documentElement.localName !== "workbook") throw new Error("Invalid workbook metadata");
  return Array.from(documentElement.getElementsByTagNameNS(documentElement.namespaceURI, "sheet"), (sheet) =>
    ((sheet.getAttribute("state") ?? "visible") === "visible" ? sheet.getAttribute("name") : null),
  ).filter((name): name is string => Boolean(name));
}
