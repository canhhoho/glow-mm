import fs from 'node:fs/promises';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';
const input = process.argv[2] ?? 'src/server/orders/templates/vtp-myanmar.xlsx';
const prefix = process.argv[3] ?? 'source';
await fs.mkdir('outputs/vtp-export', { recursive: true });
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(input));
for (const [part, range] of [['left', 'A5:L10'], ['right', 'M5:U10']]) {
  const preview = await workbook.render({ sheetName: 'Order list', range, scale: 1.5, format: 'png' });
  await fs.writeFile(`outputs/vtp-export/${prefix}-${part}.png`, new Uint8Array(await preview.arrayBuffer()));
}
console.log((await workbook.inspect({ kind: 'sheet', include: 'id,name', maxChars: 1500 })).ndjson);
